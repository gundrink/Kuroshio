use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use kuroshio_math::{
    quote_exact_in, quote_exact_out, seed_whole_per_mint, to_internal, to_native, BandState, Book, LADDER,
    MathError, ASSETS, BANDS,
};

declare_id!("GRG9CqaYABVi2Z67CBFbkq9vHC8VJ2CtvCtmqs3woHqE");

// Bytes live in the section itself. A `&str` only stores a pointer, which Solscan does not follow.
#[cfg(not(feature = "no-entrypoint"))]
#[cfg_attr(
    any(target_arch = "bpf", target_arch = "sbf"),
    link_section = ".security.txt"
)]
#[allow(dead_code)]
#[no_mangle]
#[used]
pub static SECURITY_TXT: [u8; 332] = *include_bytes!("security.txt");

const FAUCET_WHOLE: u64 = 1_000;
/// Whole book tokens minted for 1 SOL. Matches `TOKENS_PER_SOL` in the client.
const TOKENS_PER_SOL: u128 = 100;
const LAMPORTS_PER_SOL: u128 = 1_000_000_000;
const MAX_BUY_LAMPORTS: u64 = 100 * 1_000_000_000;
const TOKEN_METADATA_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

#[program]
pub mod kuroshio {
    use super::*;

    /// Opens the shared book and records the four mints in ascending address order.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let mints = [
            ctx.accounts.mint_0.key(),
            ctx.accounts.mint_1.key(),
            ctx.accounts.mint_2.key(),
            ctx.accounts.mint_3.key(),
        ];
        require!(
            mints[0] < mints[1] && mints[1] < mints[2] && mints[2] < mints[3],
            KuroshioError::BadMintOrder
        );
        let decimals = [
            ctx.accounts.mint_0.decimals,
            ctx.accounts.mint_1.decimals,
            ctx.accounts.mint_2.decimals,
            ctx.accounts.mint_3.decimals,
        ];
        let vaults = [
            &ctx.accounts.vault_0,
            &ctx.accounts.vault_1,
            &ctx.accounts.vault_2,
            &ctx.accounts.vault_3,
        ];
        let mint_accounts = [
            &ctx.accounts.mint_0,
            &ctx.accounts.mint_1,
            &ctx.accounts.mint_2,
            &ctx.accounts.mint_3,
        ];
        for index in 0..ASSETS {
            require!(mint_accounts[index].supply == 0, KuroshioError::BadVault);
            require!(vaults[index].amount == 0, KuroshioError::BadVault);
            require!(vaults[index].mint == mints[index], KuroshioError::BadVault);
            require!(vaults[index].owner == ctx.accounts.authority.key(), KuroshioError::BadVault);
        }

        pool.bump = ctx.bumps.pool;
        pool.authority_bump = ctx.bumps.authority;
        pool.seeded_bands = 0;
        pool.trading_enabled = false;
        pool.admin = ctx.accounts.admin.key();
        pool.mints = mints;
        pool.vaults = [
            ctx.accounts.vault_0.key(),
            ctx.accounts.vault_1.key(),
            ctx.accounts.vault_2.key(),
            ctx.accounts.vault_3.key(),
        ];
        pool.decimals = decimals;
        pool.radius = 0;
        for (index, band) in pool.bands.iter_mut().enumerate() {
            band.price_bps = LADDER[index].0;
            band.frozen = false;
            band.reserves = [0; ASSETS];
        }
        Ok(())
    }

    /// Mints the next liquidity band into the vaults. The eighth band opens trading.
    pub fn seed_band(ctx: Context<SeedBand>, index: u8) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(!pool.trading_enabled, KuroshioError::AlreadySeeded);
        require!(index < BANDS as u8, KuroshioError::BadVault);
        require!(index == pool.seeded_bands, KuroshioError::BadVault);

        let share = LADDER[index as usize].1;
        let whole = seed_whole_per_mint(share);
        let mints = [
            &ctx.accounts.mint_0,
            &ctx.accounts.mint_1,
            &ctx.accounts.mint_2,
            &ctx.accounts.mint_3,
        ];
        let vaults = [
            &ctx.accounts.vault_0,
            &ctx.accounts.vault_1,
            &ctx.accounts.vault_2,
            &ctx.accounts.vault_3,
        ];
        for asset in 0..ASSETS {
            require!(mints[asset].key() == pool.mints[asset], KuroshioError::BadVault);
            require!(vaults[asset].key() == pool.vaults[asset], KuroshioError::BadVault);
            require!(
                mints[asset].mint_authority == COption::Some(ctx.accounts.admin.key()),
                KuroshioError::BadVault
            );
            let native = whole
                .checked_mul(10u64.pow(pool.decimals[asset] as u32))
                .ok_or(KuroshioError::Math)?;
            token::mint_to(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: mints[asset].to_account_info(),
                        to: vaults[asset].to_account_info(),
                        authority: ctx.accounts.admin.to_account_info(),
                    },
                ),
                native,
            )?;
            pool.bands[index as usize].reserves[asset] = map_math(to_internal(native, pool.decimals[asset]))?;
        }

        pool.seeded_bands = pool.seeded_bands.checked_add(1).ok_or(KuroshioError::Math)?;
        if pool.seeded_bands == BANDS as u8 {
            let total = pool.bands.iter().try_fold(0u128, |sum, band| {
                sum.checked_add(band.reserves[0]).ok_or(KuroshioError::Math)
            })?;
            for asset in 1..ASSETS {
                let asset_total = pool.bands.iter().try_fold(0u128, |sum, band| {
                    sum.checked_add(band.reserves[asset]).ok_or(KuroshioError::Math)
                })?;
                require!(asset_total == total, KuroshioError::Math);
            }
            pool.radius = total.checked_mul(2).ok_or(KuroshioError::Math)?;
            pool.trading_enabled = true;
        }
        Ok(())
    }

    /// Swaps one book token for another on the shared sphere.
    pub fn swap(
        ctx: Context<Swap>,
        input_index: u8,
        output_index: u8,
        amount: u64,
        limit: u64,
        deadline: i64,
        exact_in: bool,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(now <= deadline, KuroshioError::Expired);
        let input_index = input_index as usize;
        let output_index = output_index as usize;
        require!(input_index < ASSETS && output_index < ASSETS, KuroshioError::SameAsset);

        let book = load_book(&ctx.accounts.pool)?;
        require!(ctx.accounts.pool.trading_enabled, KuroshioError::NotReady);
        require!(ctx.accounts.input_mint.key() == ctx.accounts.pool.mints[input_index], KuroshioError::BadVault);
        require!(ctx.accounts.output_mint.key() == ctx.accounts.pool.mints[output_index], KuroshioError::BadVault);
        require!(ctx.accounts.input_vault.key() == ctx.accounts.pool.vaults[input_index], KuroshioError::BadVault);
        require!(ctx.accounts.output_vault.key() == ctx.accounts.pool.vaults[output_index], KuroshioError::BadVault);

        let internal = map_math(to_internal(amount, ctx.accounts.pool.decimals[if exact_in { input_index } else { output_index }]))?;
        let quote = if exact_in {
            map_math(quote_exact_in(&book, input_index, output_index, internal))?
        } else {
            map_math(quote_exact_out(&book, input_index, output_index, internal))?
        };

        let amount_in = map_math(to_native(quote.amount_in, ctx.accounts.pool.decimals[input_index]))?;
        let amount_out = map_math(to_native(quote.amount_out, ctx.accounts.pool.decimals[output_index]))?;
        require!(amount_out > 0, KuroshioError::Math);
        if exact_in {
            require!(amount_out >= limit, KuroshioError::Slippage);
        } else {
            require!(amount_in <= limit, KuroshioError::Slippage);
        }

        let bump = ctx.accounts.pool.authority_bump;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_input.to_account_info(),
                    to: ctx.accounts.input_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.output_vault.to_account_info(),
                    to: ctx.accounts.user_output.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                &[&[b"authority", &[bump]]],
            ),
            amount_out,
        )?;

        let pool = &mut ctx.accounts.pool;
        pool.radius = quote.radius;
        for index in 0..BANDS {
            pool.bands[index].frozen = quote.bands[index].frozen;
            pool.bands[index].reserves = quote.bands[index].reserves;
        }

        ctx.accounts.input_vault.reload()?;
        ctx.accounts.output_vault.reload()?;
        require!(
            covers(&ctx.accounts.input_vault, &pool.bands, input_index, pool.decimals[input_index])?,
            KuroshioError::Insolvent
        );
        require!(
            covers(&ctx.accounts.output_vault, &pool.bands, output_index, pool.decimals[output_index])?,
            KuroshioError::Insolvent
        );

        emit!(SwapEvent {
            user: ctx.accounts.user.key(),
            input_mint: ctx.accounts.input_mint.key(),
            output_mint: ctx.accounts.output_mint.key(),
            amount_in,
            amount_out,
        });
        Ok(())
    }

    /// Mints 1,000 whole tokens of one book asset. Each wallet can claim a mint once.
    pub fn faucet(ctx: Context<Faucet>, index: u8) -> Result<()> {
        let index = index as usize;
        require!(index < ASSETS, KuroshioError::BadVault);
        require!(ctx.accounts.pool.trading_enabled, KuroshioError::NotReady);
        require!(ctx.accounts.mint.key() == ctx.accounts.pool.mints[index], KuroshioError::BadVault);
        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.authority.key()),
            KuroshioError::NotReady
        );
        if ctx.accounts.receipt.wallet == Pubkey::default() {
            ctx.accounts.receipt.wallet = ctx.accounts.user.key();
        }
        require!(ctx.accounts.receipt.wallet == ctx.accounts.user.key(), KuroshioError::BadVault);
        require!(ctx.accounts.receipt.claimed[index] == 0, KuroshioError::FaucetCap);

        let native = FAUCET_WHOLE
            .checked_mul(10u64.pow(ctx.accounts.pool.decimals[index] as u32))
            .ok_or(KuroshioError::Math)?;
        let bump = ctx.accounts.pool.authority_bump;
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                &[&[b"authority", &[bump]]],
            ),
            native,
        )?;
        ctx.accounts.receipt.claimed[index] = native;
        emit!(FaucetEvent {
            user: ctx.accounts.user.key(),
            mint: ctx.accounts.mint.key(),
            amount: native,
        });
        Ok(())
    }

    /// Buys a book token with SOL. One SOL mints 100 whole tokens, and the SOL does not enter the book.
    pub fn buy_with_sol(ctx: Context<BuyWithSol>, index: u8, lamports: u64) -> Result<()> {
        let index = index as usize;
        require!(index < ASSETS, KuroshioError::BadVault);
        require!(ctx.accounts.pool.trading_enabled, KuroshioError::NotReady);
        require!(lamports > 0, KuroshioError::TooSmall);
        require!(lamports <= MAX_BUY_LAMPORTS, KuroshioError::TooLarge);
        require!(ctx.accounts.mint.key() == ctx.accounts.pool.mints[index], KuroshioError::BadVault);
        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.authority.key()),
            KuroshioError::NotReady
        );

        let native = tokens_for_sol(lamports, ctx.accounts.pool.decimals[index])?;
        let bump = ctx.accounts.pool.authority_bump;
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            lamports,
        )?;
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                &[&[b"authority", &[bump]]],
            ),
            native,
        )?;
        emit!(BuyEvent {
            user: ctx.accounts.user.key(),
            mint: ctx.accounts.mint.key(),
            lamports,
            amount: native,
        });
        Ok(())
    }

    /// Publishes the name and symbol for one book mint. An image URI is optional.
    pub fn attach_metadata(ctx: Context<AttachMetadata>, uri: String) -> Result<()> {
        require!(ctx.accounts.pool.trading_enabled, KuroshioError::NotReady);
        require!(valid_metadata_uri(&uri), KuroshioError::BadVault);
        require!(ctx.accounts.metadata.data_is_empty(), KuroshioError::MetadataExists);
        let (name, symbol) = book_token_meta(&ctx.accounts.mint.key()).ok_or(KuroshioError::BadVault)?;
        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.authority.key()),
            KuroshioError::NotReady
        );
        let (metadata_address, _) = Pubkey::find_program_address(
            &[
                b"metadata",
                TOKEN_METADATA_ID.as_ref(),
                ctx.accounts.mint.key().as_ref(),
            ],
            &TOKEN_METADATA_ID,
        );
        require!(ctx.accounts.metadata.key() == metadata_address, KuroshioError::BadVault);

        let bump = ctx.accounts.pool.authority_bump;
        let accounts = vec![
            AccountMeta::new(ctx.accounts.metadata.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
            AccountMeta::new(ctx.accounts.admin.key(), true),
            AccountMeta::new_readonly(ctx.accounts.admin.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
        ];
        let instruction = Instruction {
            program_id: TOKEN_METADATA_ID,
            accounts,
            data: metadata_instruction_data(name, symbol, &uri),
        };
        invoke_signed(
            &instruction,
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.admin.to_account_info(),
                ctx.accounts.admin.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[&[b"authority", &[bump]]],
        )?;
        Ok(())
    }
}

fn load_book(pool: &Pool) -> Result<Book> {
    let mut bands = [BandState {
        price_bps: 0,
        frozen: false,
        reserves: [0; ASSETS],
    }; BANDS];
    for (index, band) in pool.bands.iter().enumerate() {
        bands[index] = BandState {
            price_bps: band.price_bps,
            frozen: band.frozen,
            reserves: band.reserves,
        };
    }
    Ok(Book {
        radius: pool.radius,
        bands,
    })
}

fn covers(vault: &TokenAccount, bands: &[Band; BANDS], asset: usize, decimals: u8) -> Result<bool> {
    let reserve = bands.iter().try_fold(0u128, |sum, band| {
        sum.checked_add(band.reserves[asset]).ok_or(KuroshioError::Math)
    })?;
    let vault_internal = map_math(to_internal(vault.amount, decimals))?;
    Ok(vault_internal + 10_000 >= reserve)
}

fn tokens_for_sol(lamports: u64, decimals: u8) -> Result<u64> {
    let scaled = (lamports as u128)
        .checked_mul(TOKENS_PER_SOL)
        .and_then(|value| value.checked_mul(10u128.pow(decimals as u32)))
        .ok_or(KuroshioError::Math)?;
    let amount = u64::try_from(scaled / LAMPORTS_PER_SOL).map_err(|_| KuroshioError::Math)?;
    require!(amount > 0, KuroshioError::TooSmall);
    Ok(amount)
}

fn book_token_meta(mint: &Pubkey) -> Option<(&'static str, &'static str)> {
    const TABLE: [(Pubkey, &str, &str); 4] = [
        (pubkey!("AtKin6p4ecibN42YPBN1gdgBwwU69cWqdWewj7x4tphR"), "Pool Ninja USDe", "nUSDe"),
        (pubkey!("AogEbswqviQNztUJJZziERHt2SbZMEFBqxj7wQfQLyg5"), "Pool Ninja USDC", "nUSDC"),
        (pubkey!("6EVpJryaSzY29qyJQwWQbMt8AbtBSQrZcMkAdHMMbZMn"), "Pool Ninja PYUSD", "nPYUSD"),
        (pubkey!("FNEBoyu8SpihwkA5ApDii13MHwK1scKmrGsefXPkC1ru"), "Pool Ninja USDT", "nUSDT"),
    ];
    TABLE.iter().find(|(key, _, _)| key == mint).map(|(_, name, symbol)| (*name, *symbol))
}

fn valid_metadata_uri(uri: &str) -> bool {
    if uri.is_empty() {
        return true;
    }
    uri.len() <= 200
        && uri.is_ascii()
        && !uri.chars().any(|c| c.is_ascii_whitespace())
        && (uri.starts_with("https://") || uri.starts_with("http://"))
}

fn push_borsh_str(data: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    data.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(bytes);
}

fn metadata_instruction_data(name: &str, symbol: &str, uri: &str) -> Vec<u8> {
    let mut data = Vec::with_capacity(16 + name.len() + symbol.len() + uri.len());
    data.push(33);
    push_borsh_str(&mut data, name);
    push_borsh_str(&mut data, symbol);
    push_borsh_str(&mut data, uri);
    data.extend_from_slice(&0u16.to_le_bytes());
    data.extend_from_slice(&[0, 0, 0, 1, 0]);
    data
}

fn map_math<T>(result: std::result::Result<T, MathError>) -> Result<T> {
    result.map_err(|err| {
        msg!("kuroshio math {:?}", err);
        error!(KuroshioError::Math)
    })
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Pool::SIZE, seeds = [b"pool"], bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: PDA that owns the vaults and, after seeding, the mint authority.
    #[account(seeds = [b"authority"], bump)]
    pub authority: UncheckedAccount<'info>,
    pub mint_0: Box<Account<'info, Mint>>,
    pub mint_1: Box<Account<'info, Mint>>,
    pub mint_2: Box<Account<'info, Mint>>,
    pub mint_3: Box<Account<'info, Mint>>,
    pub vault_0: Box<Account<'info, TokenAccount>>,
    pub vault_1: Box<Account<'info, TokenAccount>>,
    pub vault_2: Box<Account<'info, TokenAccount>>,
    pub vault_3: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SeedBand<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump, has_one = admin)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: vault owner recorded at initialize.
    #[account(seeds = [b"authority"], bump = pool.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub mint_0: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub mint_1: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub mint_2: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub mint_3: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault_0: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_1: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_2: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_3: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: signs vault transfers.
    #[account(seeds = [b"authority"], bump = pool.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    pub input_mint: Box<Account<'info, Mint>>,
    pub output_mint: Box<Account<'info, Mint>>,
    #[account(mut, constraint = input_vault.mint == input_mint.key(), constraint = input_vault.owner == authority.key())]
    pub input_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = output_vault.mint == output_mint.key(), constraint = output_vault.owner == authority.key())]
    pub output_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = input_mint,
        associated_token::authority = user
    )]
    pub user_input: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = output_mint,
        associated_token::authority = user
    )]
    pub user_output: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Faucet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: mint authority after seeding.
    #[account(seeds = [b"authority"], bump = pool.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + FaucetReceipt::SIZE,
        seeds = [b"faucet", user.key().as_ref()],
        bump
    )]
    pub receipt: Account<'info, FaucetReceipt>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyWithSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: mint authority after seeding.
    #[account(seeds = [b"authority"], bump = pool.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut, address = pool.admin)]
    pub treasury: SystemAccount<'info>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttachMetadata<'info> {
    #[account(mut, address = pool.admin)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: mint authority after seeding.
    #[account(seeds = [b"authority"], bump = pool.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: Metaplex metadata account, created by the metadata program.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: Metaplex token metadata program.
    #[account(address = TOKEN_METADATA_ID)]
    pub metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct Pool {
    pub bump: u8,
    pub authority_bump: u8,
    pub seeded_bands: u8,
    pub trading_enabled: bool,
    pub admin: Pubkey,
    pub mints: [Pubkey; 4],
    pub vaults: [Pubkey; 4],
    pub decimals: [u8; 4],
    pub radius: u128,
    pub bands: [Band; 8],
}

impl Pool {
    pub const SIZE: usize = 900;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct Band {
    pub price_bps: u16,
    pub frozen: bool,
    pub reserves: [u128; 4],
}

#[account]
pub struct FaucetReceipt {
    pub wallet: Pubkey,
    pub claimed: [u64; 4],
}

impl FaucetReceipt {
    pub const SIZE: usize = 32 + 8 * 4;
}

#[event]
pub struct SwapEvent {
    pub user: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
}

#[event]
pub struct FaucetEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BuyEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub lamports: u64,
    pub amount: u64,
}

#[error_code]
pub enum KuroshioError {
    #[msg("The book rejected this swap")]
    Math,
    #[msg("This quote expired")]
    Expired,
    #[msg("The price moved past the slippage limit")]
    Slippage,
    #[msg("The book is not open yet")]
    NotReady,
    #[msg("This band is already seeded")]
    AlreadySeeded,
    #[msg("Mints must be passed in ascending address order")]
    BadMintOrder,
    #[msg("A mint or vault does not belong to this book")]
    BadVault,
    #[msg("This wallet already used the faucet for that token")]
    FaucetCap,
    #[msg("Pay and receive must be different tokens")]
    SameAsset,
    #[msg("The vault no longer covers the book")]
    Insolvent,
    #[msg("This SOL amount buys no tokens")]
    TooSmall,
    #[msg("One buy can spend at most 100 SOL")]
    TooLarge,
    #[msg("This token already has metadata")]
    MetadataExists,
}
