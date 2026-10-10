import Link from "next/link";
import { NinjaWatch } from "@/components/ninja-watch";
import { ScrollStrike } from "@/components/scroll-strike";
import { SiteHeader } from "@/components/site-header";
import { bookTokens, depegBands, publicEnv, venueAddresses } from "@/lib/env";

const lineup = ["nUSDC", "nUSDT", "nPYUSD", "nUSDe", "nEURC", "nFDUSD", "nGHO", "nUSDS"] as const;

const ticker = [
  "A ninja keeps watch",
  "The pool stays guarded",
  "Fee stays at 1 bp",
  "Eight floors near $1",
  "nUSDC · nUSDT · nPYUSD · nUSDe",
  "nEURC · nFDUSD · nGHO · nUSDS",
  "Solana devnet",
];

const steps = [
  {
    title: "Four coins, one book",
    body: "nUSDC, nUSDT, nPYUSD, and nUSDe are the coins you can swap. Paying any one of them to receive another moves the same balances.",
    note: "six routes, one book",
  },
  {
    title: "The seed is already split",
    body: "You do not pick a floor. Most of the seed sits close to $1. A tight floor quotes while the peg holds. A wide floor is there if a coin slips further.",
    note: "$0.9995 down to full range",
  },
  {
    title: "Name the two coins",
    body: "You still choose what you pay, how much, and what you receive. Both coins read the shared reserve, so size is not stuck in one pair.",
    note: "exact in, exact out",
  },
  {
    title: "A broken floor steps aside",
    body: "If a coin falls through a floor, that slice stops quoting. Liquidity that stayed on a tighter floor is not pulled into the break.",
    note: "1 bp, kept by the pool",
  },
];

export default function LandingPage() {
  const program = publicEnv.programId || "Issued at deploy";

  return (
    <>
      <SiteHeader current="home" />
      <ScrollStrike />
      <main>
        <section className="hero" id="current">
          <NinjaWatch />
          <p className="ticker" aria-hidden="true">
            {[0, 1].map((copy) => (
              <span key={copy}>
                {ticker.map((item) => (
                  <span key={`${copy}-${item}`}>
                    <i />
                    {item}
                  </span>
                ))}
              </span>
            ))}
          </p>
          <div className="hero-copy">
            <p className="eyebrow">Under watch</p>
            <h1>A ninja keeps the pool.</h1>
            <p className="lede">
              nUSDC, nUSDT, nPYUSD, and nUSDe share one book. nEURC, nFDUSD, nGHO, and nUSDS are named on the lineup, and they are not in the book yet.
              The watch stays on the reserves, so a slip in one coin does not walk off with the rest.
              Pay, amount, and receive still draw on <strong>the whole book</strong>.
            </p>
            <ul className="coin-row">
              {lineup.map((coin) => (
                <li key={coin}>{coin}</li>
              ))}
            </ul>
            <p className="fine">Solana devnet. The watch is already on. Connect, then step in.</p>
          </div>
          <div className="compare" aria-label="Separate pair markets compared with the Pool Ninja book">
            <article className="card card-dark">
              <header>
                <h2>Six separate markets</h2>
                <span>Split</span>
              </header>
              <dl>
                <div>
                  <dt>Route</dt>
                  <dd>nUSDC / nUSDe</dd>
                </div>
                <div>
                  <dt>Another</dt>
                  <dd>nUSDC / nUSDT</dd>
                </div>
                <div>
                  <dt>Size you touch</dt>
                  <dd>That pair only</dd>
                </div>
                <div>
                  <dt>If a coin slips</dt>
                  <dd>That market pays</dd>
                </div>
              </dl>
              <p>Each pair keeps its own depth. Size parked in one market never reaches the others.</p>
            </article>
            <article className="card card-light">
              <header>
                <h2>A guarded book</h2>
                <span>Watch</span>
              </header>
              <dl>
                <div>
                  <dt>You pay</dt>
                  <dd>nUSDC</dd>
                </div>
                <div>
                  <dt>You receive</dt>
                  <dd>nUSDe</dd>
                </div>
                <div>
                  <dt>Size you touch</dt>
                  <dd>The shared book</dd>
                </div>
                <div>
                  <dt>If a coin slips</dt>
                  <dd>That floor stops</dd>
                </div>
              </dl>
              <p>One ninja keeps this book. A floor can stop. The reserves beside it stay.</p>
            </article>
          </div>
        </section>

        <section className="section" id="shallows">
          <p className="kicker">Side by side</p>
          <h2>Don’t split the depth six ways.</h2>
          <p className="section-lede">
            A pair market makes you pick a lane. Pool Ninja holds the basket in one place and
            keeps most of the capital where a dollar actually trades.
          </p>
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Separate pairs</th>
                <th>Pool Ninja</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Coins in the quote</td>
                <td>2</td>
                <td>4, one reserve</td>
              </tr>
              <tr>
                <td>nUSDC into nUSDe</td>
                <td>Only that pair’s size</td>
                <td>The shared balances</td>
              </tr>
              <tr>
                <td>Where the seed sits</td>
                <td>Each pair’s own range</td>
                <td>Eight floors around $1</td>
              </tr>
              <tr>
                <td>One coin breaks</td>
                <td>The pair keeps quoting</td>
                <td>That floor stops</td>
              </tr>
              <tr>
                <td>Fee</td>
                <td>Chosen per market</td>
                <td>1 bp</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="section" id="charter">
          <p className="kicker">The curve</p>
          <h2>Every route reads one surface.</h2>
          <p className="section-lede">
            Pool Ninja is an automated market maker. The lineup shares one reserve.
            Any swap moves that same reserve, so one pool covers the routes between these coins.
          </p>
          <ol className="formula-grid">
            <li>
              <h3>Surface</h3>
              <p className="formula">
                Σ (r − x<sub>i</sub>)<sup>2</sup> = r<sup>2</sup>
              </p>
              <p>r is the radius. x<sub>i</sub> is how much of coin i is in the book. Every price stays on this surface.</p>
            </li>
            <li>
              <h3>Quote</h3>
              <p className="formula">
                p<sub>i→j</sub> = (r − x<sub>j</sub>) / (r − x<sub>i</sub>)
              </p>
              <p>Coin i paid for one coin j. The coin with the larger balance is the cheaper one.</p>
            </li>
            <li>
              <h3>Opening balances</h3>
              <p className="formula">
                x<sub>i</sub> = r (1 − 1/√n)
              </p>
              <p>Four coins means √4 = 2, so each balance starts at r / 2. That is the opening seed.</p>
            </li>
            <li>
              <h3>Fee</h3>
              <p className="formula">fee = amount / 10,000</p>
              <p>One basis point, taken as you pay in. It stays in the vault and does not feed back into the price.</p>
            </li>
            <li>
              <h3>Floor check</h3>
              <p className="formula">min(r − x) / max(r − x) × 10,000</p>
              <p>The cheapest coin, in basis points of $1. A floor freezes once the price falls through it.</p>
            </li>
            <li>
              <h3>After a freeze</h3>
              <p className="formula">r′ = r × new sum / old sum</p>
              <p>Frozen balances leave the quote and the radius shrinks with them. One swap can freeze at most three floors.</p>
            </li>
          </ol>
          <p className="charter-close">
            The opening seed is split into eight floors: 40% at $0.9995, then 27%, 15%, 8%, 4%, 3%, 2%,
            and 1% with no floor. A tight floor quotes near a dollar. If the cheapest coin falls through a
            floor, that slice stops and the wider floors keep quoting.
          </p>
        </section>

        <section className="section" id="passage">
          <p className="kicker">A swap</p>
          <h2>Three fields. A different book.</h2>
          <p className="section-lede">
            The form still asks what you pay, how much, and what comes back. The reserve behind those fields is what changed.
          </p>
          <ol className="steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <small>{step.note}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" id="soundings">
          <p className="kicker">On chain</p>
          <h2>Settled on Solana devnet.</h2>
          <p className="section-lede">
            Point the wallet at devnet before you sign. These are the mints in the book and the deployer that seeded them.
          </p>
          <ul className="deploy-grid">
            <li>
              <h3>Solana devnet</h3>
              <p className="mono">{publicEnv.cluster}</p>
              <p>The book, the eight floors, and every swap settle on this cluster.</p>
              <a href={publicEnv.rpcUrl}>{publicEnv.rpcUrl}</a>
            </li>
            <li>
              <h3>Pool Ninja program</h3>
              <p className="mono">{program}</p>
              <p>Swaps, liquidity, and positions call this program.</p>
            </li>
            <li>
              <h3>Orca and Raydium</h3>
              <p className="mono">Windows onto the book</p>
              <p>Pair pools on these same mints. The price underneath is still Pool Ninja.</p>
            </li>
            <li>
              <h3>Deployer</h3>
              <p className="mono">{publicEnv.deployer || "Issued at deploy"}</p>
              <p>Signed the setup. Swaps and the faucet use the wallet you connect.</p>
            </li>
            {bookTokens.map((token) => (
              <li key={token.symbol}>
                <h3>{token.symbol}</h3>
                <p className="mono">{token.mint || "Issued at deploy"}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" id="latitude">
          <p className="kicker">Floors</p>
          <h2>The seed leans toward $1.</h2>
          <p className="section-lede">
            The opening seed is split into eight floors. A tight floor does the trading near a dollar. If the cheapest coin falls through a floor, that slice stops and the wider floors keep quoting. Full range has no floor, so it does not stop.
          </p>
          <ul className="band-pills">
            {depegBands.map((band) => (
              <li key={band.price}>
                <strong>{band.price}</strong>
                <span>{band.share} of the seed</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="closing" id="horizon">
          <h2>The book stays under watch.</h2>
          <p>Pay one stablecoin and receive another. The ninja keeps both sides on the same reserve.</p>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <strong>Pool Ninja</strong>
          <p>A ninja watches one book on Solana devnet. nUSDC, nUSDT, nPYUSD, and nUSDe share it. nEURC, nFDUSD, nGHO, and nUSDS are named beside that book.</p>
        </div>
        <nav aria-label="App">
          <p>App</p>
          <Link href="/connect">Open book</Link>
        </nav>
        <nav aria-label="Networks">
          <p>Networks</p>
          {venueAddresses.slice(0, 3).map((item) => (
            <span key={item.label}>{item.label}</span>
          ))}
        </nav>
      </footer>
    </>
  );
}
