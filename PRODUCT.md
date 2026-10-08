# Kuroshio

Kuroshio is a Solana devnet automated market maker for four test stablecoins. kUSDC, kUSDT, kDAI, and kFRAX share one reserve book. A swap of any pair moves that same book, so one pool does the work of six pair markets.

It is an AMM. It is not a CLMM and not a DLMM. Liquidity is not placed in a price range on a single pair, and it is not split into constant-price bins. Eight depeg bands sit on one shared surface around $1.

The app is English. The network is Solana devnet. These tokens are test mints. They are not official USDC, USDT, DAI, or FRAX.

## Status

Live on devnet:

- The Kuroshio program is deployed and the book is seeded.
- Trading is enabled. Eight bands are open. A devnet swap has already settled.
- The site has a landing page, a wallet connect page, and a swap screen.
- A connected wallet can claim 1,000 kUSDC once.

Not built yet:

- The Book and Bands screens are Coming soon. They are not liquidity positions.
- Orca and Raydium are recorded as addresses only. No satellite pair pool has been opened.
- There is no mainnet deployment and no use of real funds.

## The book

Four stablecoins normally need six markets. Depth in one pair never reaches the others. Kuroshio keeps the four reserves in one vector. Paying kUSDC to receive kFRAX, or paying kDAI to receive kUSDT, reads the same vector.

Reserves stay on a sphere. `r` is the radius. `xᵢ` is the reserve of coin `i`. `n` is the number of coins, which is 4.

| Rule | Formula | What it does |
| --- | --- | --- |
| Sphere | Σ (r − xᵢ)² = r² | Every quote stays on this surface. |
| Price | pᵢ→ⱼ = (r − xⱼ) / (r − xᵢ) | How much of coin i buys one coin j. The larger reserve is the cheaper coin. |
| Equal reserves | xᵢ = r (1 − 1/√n) | With four coins, each reserve is r / 2. The seed starts there. |
| Fee | fee = amount / 10,000 | One basis point, taken on the way in. It stays in the vault and does not re-enter the price. |
| Depeg check | min(r − x) / max(r − x) × 10,000 | The cheapest coin, in basis points of $1. A band freezes when this price falls through its floor. |
| After a freeze | r′ = r × new sum / old sum | Frozen reserves leave the quote and the radius scales down. |

One swap may freeze at most three bands. Rounding favors the pool. The quote supports exact-in and exact-out. The swap screen sends exact-in.

## Bands

The seed is 1,250,000 whole tokens of each mint. It is split across eight floors. A tight floor does the trading near a dollar. A wider floor stays through a larger move. The full-range band has a floor of 0 and does not freeze.

| Floor | Share of the seed |
| --- | --- |
| $0.9995 | 40% |
| $0.9990 | 27% |
| $0.9950 | 15% |
| $0.9900 | 8% |
| $0.9800 | 4% |
| $0.9500 | 3% |
| $0.9000 | 2% |
| Full range | 1% |

When the cheapest coin falls through a floor, that band stops quoting. The bands still inside their floor keep trading.

## Assets

The book uses Kuroshio’s own SPL mints so the program can be the mint authority. Decimals follow the asset each test coin stands in for. Inside the program, every amount is scaled to 9 decimals.

The pool stores mints in ascending public-key order. That order is kFRAX, kUSDC, kDAI, kUSDT. The interface maps a symbol to its mint, then to that index.

| Symbol | Decimals | Mint | Vault |
| --- | --- | --- | --- |
| kFRAX | 9 | `7vkrapQkKwh3cmRjm1Xr21cxSZMqiJ2Pri3ia3v6E5Pk` | `DoGhvx1uBexXNnts5Trxh8qKpgpp9j8k4uWA8ur3m8m1` |
| kUSDC | 6 | `8BMVR8aJ8Xie5xFxRAr7EXM8fk44AcF8U78cFAJgDjKp` | `DtxmU7chWYzk1oxMsniJBCKZGZTwJ1h8cXMtCbDMJQUh` |
| kDAI | 9 | `DDTNBEGC5QN6pRN1GJMrG1yDk7Z6YP6P5eAmmdehEGfp` | `GchYn3GowWvdqdPZqj8GK1aAMxnJjAtJVKvDaHyAoHJ` |
| kUSDT | 6 | `HhDcQ5A99d5fkwWX8pAjnVimF2cykenuZu7HZuJ9j7G6` | `75LjvtLfenYkkrD2FpMkxS1fE7s9QyGHLpiwEjVKL7jm` |

## What a person can do

1. Open the landing page. The header jumps to Current, Shallows, Charter, Passage, Soundings, Latitude, and Horizon.
2. Launch app goes to Connect a wallet. The wallet must be on Solana devnet. Email and social login are off. Reown is wallet-only.
3. Swap opens only after the wallet is connected. The form is Pay, amount, and Receive. Slippage is a setting, with presets 0.1%, 0.5%, and 1%, or a custom value from 0.01% to 50%. The default is 0.5%. A quote expires 120 seconds after it is signed.
4. Pay with SOL to buy any of the four book tokens. 1 SOL mints 100 whole tokens. The SOL is paid to the deployer treasury. The sphere reserves do not move, because SOL is not one of the four stablecoins. One buy can spend at most 100 SOL.
5. Claim 1,000 kUSDC mints that amount to the connected wallet. The program allows this once per wallet. The browser also stores the wallet under `kuroshio.reward.kusdc`, so the button stays on “kUSDC reward claimed” after a reload. Clearing that storage shows the button again. The program still refuses a second mint for the same wallet.
6. Book and Bands show a Coming soon screen.

The header shows an X icon from `NEXT_PUBLIC_X_URL` and a CA chip from `NEXT_PUBLIC_CA`. The chip reads `CA :` plus the first four and last four characters. A click copies the full value.

## Devnet deployment

| Account | Address |
| --- | --- |
| Cluster | Solana devnet, `https://api.devnet.solana.com` |
| Program | `2Q7mJej5TW3y5Uadf68KPFKV1BnKrDAibQLDZXyZyPox` |
| Pool | `8ribZ2EAvQVN1kppxXd9EfVPaTufV8D7pbpnNucdWvg` |
| Mint authority | `2v6Agxq87QcJ6rs9j8ZyU7hkphH1yYRSMTd7wZmHi4iy` |
| Deployer | `DCYGieAFCYNvmNRDj3Aoi4qTpZAVC4RsKbGUqDn4RJdp` |

The first confirmed swap is `a7vFHh9wJ9pNKMfPMHVJq1TkP1xzzr9TGRgEYdEpmu5JHGYw79okvbSUuy4rjWDSVJ3kRrqQN4AjYEcX91WA5UZ`. It paid 10 kFRAX and received kUSDC.

Orca Whirlpool and Raydium CLMM addresses are kept in the environment for a later window onto the same mints. The price a person swaps against today is the Kuroshio book.

## Program surface

The program exposes four instructions:

- `initialize` creates the pool for four mints, in ascending public-key order, with trading closed.
- `seed_band` fills one band. After the eighth band, trading opens.
- `swap` moves one coin in and another coin out. The signer pays. Slippage and a deadline are checked on chain.
- `buy_with_sol` takes SOL and mints the chosen book token at 100 whole tokens per SOL.
- `faucet` mints 1,000 whole tokens of one book mint to the signer, once for that mint.

Custom program errors start at 6000: the book rejected the swap, the quote expired, slippage was passed, the book is not open, the faucet was already used, or pay and receive are the same token.
