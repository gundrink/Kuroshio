//! Shared-book math for the Kuroshio sphere.
//! Reserves are internal units: 1 token = 1e9, whatever the SPL decimals are.

pub const ASSETS: usize = 4;
pub const BANDS: usize = 8;
pub const SCALE: u128 = 1_000_000_000;
pub const FEE_BPS: u128 = 1;
pub const BPS: u128 = 10_000;
pub const MAX_CROSSINGS: usize = 3;

pub const LADDER: [(u16, u16); BANDS] = [
    (9995, 4000),
    (9990, 2700),
    (9950, 1500),
    (9900, 800),
    (9800, 400),
    (9500, 300),
    (9000, 200),
    (0, 100),
];

/// Whole tokens minted into the book, split by the ladder and then by four mints.
pub const SEED_WHOLE_TOKENS: u64 = 5_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MathError {
    Overflow,
    SameAsset,
    ZeroAmount,
    Sphere,
    BandLimit,
    EmptyBook,
    Decimals,
}

#[derive(Clone, Copy, Debug)]
pub struct BandState {
    pub price_bps: u16,
    pub frozen: bool,
    pub reserves: [u128; ASSETS],
}

#[derive(Clone, Copy, Debug)]
pub struct Book {
    pub radius: u128,
    pub bands: [BandState; BANDS],
}

#[derive(Clone, Copy, Debug)]
pub struct SwapQuote {
    pub amount_in: u128,
    pub amount_out: u128,
    pub fee: u128,
    pub radius: u128,
    pub bands: [BandState; BANDS],
}

pub fn to_internal(amount: u64, decimals: u8) -> Result<u128, MathError> {
    if decimals > 9 {
        return Err(MathError::Decimals);
    }
    let factor = 10u128.pow((9 - decimals) as u32);
    (amount as u128).checked_mul(factor).ok_or(MathError::Overflow)
}

pub fn to_native(amount: u128, decimals: u8) -> Result<u64, MathError> {
    if decimals > 9 {
        return Err(MathError::Decimals);
    }
    let factor = 10u128.pow((9 - decimals) as u32);
    u64::try_from(amount / factor).map_err(|_| MathError::Overflow)
}

pub fn seed_whole_per_mint(share_bps: u16) -> u64 {
    SEED_WHOLE_TOKENS * share_bps as u64 / 10_000 / ASSETS as u64
}

pub fn balanced_book(per_band: [u128; BANDS], floors: [u16; BANDS]) -> Book {
    let mut bands = [BandState {
        price_bps: 0,
        frozen: false,
        reserves: [0; ASSETS],
    }; BANDS];
    let mut total = 0u128;
    for (index, band) in bands.iter_mut().enumerate() {
        band.price_bps = floors[index];
        band.reserves = [per_band[index]; ASSETS];
        total += per_band[index];
    }
    Book {
        radius: total * 2,
        bands,
    }
}

pub fn quote_exact_in(book: &Book, input: usize, output: usize, gross_in: u128) -> Result<SwapQuote, MathError> {
    if input == output || input >= ASSETS || output >= ASSETS {
        return Err(MathError::SameAsset);
    }
    if gross_in == 0 {
        return Err(MathError::ZeroAmount);
    }
    let fee = gross_in.checked_mul(FEE_BPS).ok_or(MathError::Overflow)? / BPS;
    let net = gross_in.checked_sub(fee).ok_or(MathError::Overflow)?;
    if net == 0 {
        return Err(MathError::ZeroAmount);
    }
    settle(book, input, output, net, None, fee, gross_in)
}

pub fn quote_exact_out(book: &Book, input: usize, output: usize, exact_out: u128) -> Result<SwapQuote, MathError> {
    if input == output || input >= ASSETS || output >= ASSETS {
        return Err(MathError::SameAsset);
    }
    if exact_out == 0 {
        return Err(MathError::ZeroAmount);
    }
    settle(book, input, output, 0, Some(exact_out), 0, 0).and_then(|mut quote| {
        let gross = gross_up(quote.amount_in)?;
        let fee = gross / BPS;
        let net = gross - fee;
        if net < quote.amount_in {
            return Err(MathError::Sphere);
        }
        quote.fee = fee;
        quote.amount_in = gross;
        Ok(quote)
    })
}

fn settle(
    book: &Book,
    input: usize,
    output: usize,
    net_in: u128,
    exact_out: Option<u128>,
    fee: u128,
    gross_in: u128,
) -> Result<SwapQuote, MathError> {
    let mut bands = book.bands;
    let mut radius = book.radius;
    let mut crossings = 0usize;

    loop {
        let active = active_indexes(&bands);
        if active.is_empty() {
            return Err(MathError::EmptyBook);
        }
        let agg = aggregate(&bands, &active);
        let (new_agg, dx_net, dy) = match exact_out {
            None => {
                let (new_agg, dy) = sphere_exact_in(&agg, radius, input, output, net_in)?;
                (new_agg, net_in, dy)
            }
            Some(wanted) => {
                let (new_agg, dx) = sphere_exact_out(&agg, radius, input, output, wanted)?;
                (new_agg, dx, wanted)
            }
        };
        let price = cheapest_price_bps(radius, &new_agg)?;
        let breached = breached_indexes(&bands, &active, price);
        if breached.is_empty() {
            let din = new_agg[input].checked_sub(agg[input]).ok_or(MathError::Sphere)?;
            let dout = agg[output].checked_sub(new_agg[output]).ok_or(MathError::Sphere)?;
            distribute_add(&mut bands, &active, input, din)?;
            distribute_sub(&mut bands, &active, output, dout)?;
            return Ok(SwapQuote {
                amount_in: if exact_out.is_some() { dx_net } else { gross_in },
                amount_out: dy,
                fee: if exact_out.is_some() { 0 } else { fee },
                radius,
                bands,
            });
        }
        if crossings + breached.len() > MAX_CROSSINGS {
            return Err(MathError::BandLimit);
        }
        let old_sum = sum_reserves(&agg);
        let mut removed = 0u128;
        for index in &breached {
            bands[*index].frozen = true;
            removed = removed
                .checked_add(sum_reserves(&bands[*index].reserves))
                .ok_or(MathError::Overflow)?;
        }
        let new_sum = old_sum.checked_sub(removed).ok_or(MathError::Sphere)?;
        radius = scale_radius(radius, old_sum, new_sum)?;
        crossings += breached.len();
    }
}

fn sphere_exact_in(
    agg: &[u128; ASSETS],
    radius: u128,
    input: usize,
    output: usize,
    dx: u128,
) -> Result<([u128; ASSETS], u128), MathError> {
    let mut next = *agg;
    next[input] = next[input].checked_add(dx).ok_or(MathError::Overflow)?;
    let x_out = solve_output(&next, radius, output)?;
    if x_out >= agg[output] {
        return Err(MathError::Sphere);
    }
    let dy = agg[output] - x_out;
    next[output] = x_out;
    Ok((next, dy))
}

fn sphere_exact_out(
    agg: &[u128; ASSETS],
    radius: u128,
    input: usize,
    output: usize,
    dy: u128,
) -> Result<([u128; ASSETS], u128), MathError> {
    if dy >= agg[output] {
        return Err(MathError::Sphere);
    }
    let mut next = *agg;
    next[output] = agg[output] - dy;
    let x_in = solve_output(&next, radius, input)?;
    if x_in <= agg[input] {
        return Err(MathError::Sphere);
    }
    let dx = x_in - agg[input];
    next[input] = x_in;
    Ok((next, dx))
}

/// Reserve of `unknown` that puts the vector back on the sphere.
fn solve_output(reserves: &[u128; ASSETS], radius: u128, unknown: usize) -> Result<u128, MathError> {
    let radius_sq = radius.checked_mul(radius).ok_or(MathError::Overflow)?;
    let mut used = 0u128;
    for (index, reserve) in reserves.iter().enumerate() {
        if index == unknown {
            continue;
        }
        let gap = radius.checked_sub(*reserve).ok_or(MathError::Sphere)?;
        used = used
            .checked_add(gap.checked_mul(gap).ok_or(MathError::Overflow)?)
            .ok_or(MathError::Overflow)?;
    }
    if used > radius_sq {
        return Err(MathError::Sphere);
    }
    let gap = isqrt(radius_sq - used);
    radius.checked_sub(gap).ok_or(MathError::Sphere)
}

pub fn cheapest_price_bps(radius: u128, reserves: &[u128; ASSETS]) -> Result<u128, MathError> {
    let mut min_gap = u128::MAX;
    let mut max_gap = 0u128;
    for reserve in reserves {
        let gap = radius.checked_sub(*reserve).ok_or(MathError::Sphere)?;
        min_gap = min_gap.min(gap);
        max_gap = max_gap.max(gap);
    }
    if max_gap == 0 {
        return Err(MathError::Sphere);
    }
    min_gap.checked_mul(BPS).ok_or(MathError::Overflow)?
        .checked_div(max_gap)
        .ok_or(MathError::Overflow)
}

pub fn isqrt(value: u128) -> u128 {
    if value == 0 {
        return 0;
    }
    let mut x = value;
    let mut y = x.saturating_add(1) / 2;
    while y < x {
        x = y;
        y = x.saturating_add(value / x) / 2;
    }
    x
}

fn gross_up(net: u128) -> Result<u128, MathError> {
    let denom = BPS - FEE_BPS;
    let mut gross = net.checked_mul(BPS).ok_or(MathError::Overflow)?
        .checked_add(denom - 1)
        .ok_or(MathError::Overflow)?
        / denom;
    while gross - gross / BPS < net {
        gross = gross.checked_add(1).ok_or(MathError::Overflow)?;
    }
    Ok(gross)
}

fn active_indexes(bands: &[BandState; BANDS]) -> Vec<usize> {
    bands
        .iter()
        .enumerate()
        .filter(|(_, band)| !band.frozen)
        .map(|(index, _)| index)
        .collect()
}

fn aggregate(bands: &[BandState; BANDS], active: &[usize]) -> [u128; ASSETS] {
    let mut totals = [0u128; ASSETS];
    for index in active {
        for asset in 0..ASSETS {
            totals[asset] += bands[*index].reserves[asset];
        }
    }
    totals
}

fn breached_indexes(bands: &[BandState; BANDS], active: &[usize], price: u128) -> Vec<usize> {
    active
        .iter()
        .copied()
        .filter(|index| {
            let floor = bands[*index].price_bps;
            floor > 0 && price < floor as u128
        })
        .collect()
}

fn sum_reserves(reserves: &[u128; ASSETS]) -> u128 {
    reserves.iter().sum()
}

fn scale_radius(radius: u128, old_sum: u128, new_sum: u128) -> Result<u128, MathError> {
    if old_sum == 0 || new_sum == 0 {
        return Err(MathError::EmptyBook);
    }
    let scaled = radius.checked_mul(new_sum).ok_or(MathError::Overflow)? / old_sum;
    if scaled == 0 {
        Err(MathError::Sphere)
    } else {
        Ok(scaled)
    }
}

fn distribute_add(bands: &mut [BandState; BANDS], active: &[usize], asset: usize, delta: u128) -> Result<(), MathError> {
    if delta == 0 {
        return Ok(());
    }
    let total: u128 = active.iter().map(|index| bands[*index].reserves[asset]).sum();
    if total == 0 {
        return Err(MathError::EmptyBook);
    }
    let mut left = delta;
    for (position, index) in active.iter().enumerate() {
        let share = if position + 1 == active.len() {
            left
        } else {
            delta.checked_mul(bands[*index].reserves[asset]).ok_or(MathError::Overflow)? / total
        };
        bands[*index].reserves[asset] = bands[*index].reserves[asset]
            .checked_add(share)
            .ok_or(MathError::Overflow)?;
        left -= share;
    }
    Ok(())
}

fn distribute_sub(bands: &mut [BandState; BANDS], active: &[usize], asset: usize, delta: u128) -> Result<(), MathError> {
    if delta == 0 {
        return Ok(());
    }
    let total: u128 = active.iter().map(|index| bands[*index].reserves[asset]).sum();
    if total == 0 || delta > total {
        return Err(MathError::Sphere);
    }
    let mut left = delta;
    for (position, index) in active.iter().enumerate() {
        let share = if position + 1 == active.len() {
            left
        } else {
            delta.checked_mul(bands[*index].reserves[asset]).ok_or(MathError::Overflow)? / total
        };
        bands[*index].reserves[asset] = bands[*index].reserves[asset]
            .checked_sub(share)
            .ok_or(MathError::Sphere)?;
        left -= share;
    }
    Ok(())
}

pub fn sphere_gap(book: &Book) -> Result<u128, MathError> {
    let active = active_indexes(&book.bands);
    let agg = aggregate(&book.bands, &active);
    let radius_sq = book.radius.checked_mul(book.radius).ok_or(MathError::Overflow)?;
    let mut used = 0u128;
    for reserve in agg {
        let gap = book.radius.checked_sub(reserve).ok_or(MathError::Sphere)?;
        used = used.checked_add(gap.checked_mul(gap).ok_or(MathError::Overflow)?).ok_or(MathError::Overflow)?;
    }
    if used > radius_sq {
        return Err(MathError::Sphere);
    }
    Ok(radius_sq - used)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deep_book() -> Book {
        let floors = LADDER.map(|(price, _)| price);
        let per_band = LADDER.map(|(_, share)| seed_whole_per_mint(share) as u128 * SCALE);
        balanced_book(per_band, floors)
    }

    #[test]
    fn decimals_share_one_internal_token() {
        assert_eq!(to_internal(1_000_000, 6).unwrap(), SCALE);
        assert_eq!(to_internal(1_000_000_000, 9).unwrap(), SCALE);
        assert_eq!(to_native(SCALE, 6).unwrap(), 1_000_000);
        assert_eq!(to_native(SCALE + 999, 6).unwrap(), 1_000_000);
    }

    #[test]
    fn seed_ladder_sums_to_one_quarter_each() {
        let total: u64 = LADDER.iter().map(|(_, share)| seed_whole_per_mint(*share)).sum();
        assert_eq!(total, SEED_WHOLE_TOKENS / 4);
    }

    #[test]
    fn small_swap_stays_near_peg_and_on_the_sphere() {
        let book = deep_book();
        let quote = quote_exact_in(&book, 0, 1, SCALE).unwrap();
        assert!(quote.amount_out + SCALE / 100 > SCALE);
        assert!(quote.amount_out < SCALE);
        assert!(quote.bands.iter().all(|band| !band.frozen));
        let gap = sphere_gap(&Book {
            radius: quote.radius,
            bands: quote.bands,
        })
        .unwrap();
        assert!(gap < quote.radius);
    }

    #[test]
    fn exact_out_round_trip_pays_the_fee() {
        let book = deep_book();
        let wanted = SCALE;
        let quote = quote_exact_out(&book, 0, 1, wanted).unwrap();
        assert_eq!(quote.amount_out, wanted);
        assert!(quote.amount_in > wanted);
    }

    #[test]
    fn a_modest_sale_freezes_only_the_tightest_band() {
        let book = deep_book();
        let quote = quote_exact_in(&book, 0, 1, SCALE * 350).unwrap();
        assert!(quote.bands[0].frozen);
        assert!(quote.bands.iter().skip(1).all(|band| !band.frozen));
        assert!(quote.amount_out > 0);
    }

    #[test]
    fn four_band_crossings_revert() {
        let book = deep_book();
        let err = quote_exact_in(&book, 0, 1, SCALE * 7_000).unwrap_err();
        assert_eq!(err, MathError::BandLimit);
    }
}
