import Link from "next/link";
import { KuroshioWaves } from "@/components/kuroshio-waves";
import { SiteHeader } from "@/components/site-header";
import { bookTokens, depegBands, publicEnv, venueAddresses } from "@/lib/env";

const ticker = [
  "Live on devnet",
  "Solana devnet",
  "One shared book",
  "Eight depeg bands",
  "1 bp fee",
  "kUSDC · kUSDT · kDAI · kFRAX",
];

const steps = [
  {
    title: "One reserve vector",
    body: "Four stablecoins sit in a single book. A kUSDC to kUSDT swap and a kDAI to kFRAX swap move the same reserves.",
    note: "6 pairs · 1 book",
  },
  {
    title: "Pick a depeg band",
    body: "Liquidity is nested around $1. A tighter band earns more while the peg holds. A wider band stays through a larger move.",
    note: "from $0.9995 to full range",
  },
  {
    title: "Swap any pair",
    body: "Pay, amount, and receive are the whole trade. Both sides quote the shared book, so depth is not trapped in one pair.",
    note: "exact in and exact out",
  },
  {
    title: "The band fences the loss",
    body: "Cross a band’s depeg bound and that band stops quoting. A broken coin does not drain the liquidity that stayed inside a tighter band.",
    note: "1 bp, rounded for the pool",
  },
];

export default function LandingPage() {
  const program = publicEnv.programId || "Issued at deploy";

  return (
    <>
      <SiteHeader current="home" />
      <main>
        <section className="hero" id="current">
          <KuroshioWaves />
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
            <h1>
              One pool for every stablecoin.
              <em> Depth that stays together.</em>
            </h1>
            <p className="lede">
              Kuroshio prices kUSDC, kUSDT, kDAI, and kFRAX from <strong>one reserve vector</strong>.
              The same swap form you already know — pay, amount, receive — draws on the whole book
              instead of one shallow pair.
            </p>
            <p className="fine">
              Solana devnet. Connect a wallet, then use the same swap, book, and band screens.
            </p>
          </div>
          <div className="compare" aria-label="Fragmented pairs compared with one book">
            <article className="card card-dark">
              <header>
                <h2>Six shallow pairs</h2>
                <span>Split</span>
              </header>
              <dl>
                <div>
                  <dt>Pair</dt>
                  <dd>kUSDC / kFRAX</dd>
                </div>
                <div>
                  <dt>Also live</dt>
                  <dd>kUSDC / kUSDT</dd>
                </div>
                <div>
                  <dt>This trade sees</dt>
                  <dd>Only that pool</dd>
                </div>
                <div>
                  <dt>A depeg</dt>
                  <dd>Drains the pair</dd>
                </div>
              </dl>
              <p>Four stablecoins need six markets. Depth in one pair never reaches the others.</p>
            </article>
            <article className="card card-light">
              <header>
                <h2>One Kuroshio book</h2>
                <span>Shared</span>
              </header>
              <dl>
                <div>
                  <dt>Pay</dt>
                  <dd>kUSDC</dd>
                </div>
                <div>
                  <dt>Receive</dt>
                  <dd>kFRAX</dd>
                </div>
                <div>
                  <dt>This trade sees</dt>
                  <dd>The whole book</dd>
                </div>
                <div>
                  <dt>Reserves</dt>
                  <dd>One vector</dd>
                </div>
              </dl>
              <p>Quoted on Solana. The band you picked stops when its depeg bound is crossed.</p>
            </article>
          </div>
        </section>

        <section className="section" id="shallows">
          <p className="kicker">The split</p>
          <h2>Breadth and depth, in one book.</h2>
          <p className="section-lede">
            A pair AMM makes you choose. Kuroshio keeps the basket together and concentrates
            capital where a dollar actually trades.
          </p>
          <table>
            <thead>
              <tr>
                <th>On a swap</th>
                <th>A pair of pools</th>
                <th>Kuroshio</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Assets in the book</td>
                <td>2</td>
                <td>4, one vector</td>
              </tr>
              <tr>
                <td>kUSDC to kFRAX</td>
                <td>Only that pair’s depth</td>
                <td>The shared reserves</td>
              </tr>
              <tr>
                <td>Where capital sits</td>
                <td>Whatever range that pair uses</td>
                <td>Eight bands around $1</td>
              </tr>
              <tr>
                <td>When one coin breaks</td>
                <td>The pair keeps quoting</td>
                <td>That band stops</td>
              </tr>
              <tr>
                <td>Fee</td>
                <td>Set per pool</td>
                <td>1 bp</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="section" id="charter">
          <p className="kicker">The book</p>
          <h2>One surface prices every pair.</h2>
          <p className="section-lede">
            Kuroshio is an automated market maker. Four stablecoins share one reserve vector.
            A swap of any pair moves that same vector, so one pool does the work of six.
          </p>
          <ol className="formula-grid">
            <li>
              <h3>The sphere</h3>
              <p className="formula">
                Σ (r − x<sub>i</sub>)<sup>2</sup> = r<sup>2</sup>
              </p>
              <p>r is the radius. x<sub>i</sub> is the reserve of coin i. Every quote stays on this surface.</p>
            </li>
            <li>
              <h3>The price</h3>
              <p className="formula">
                p<sub>i→j</sub> = (r − x<sub>j</sub>) / (r − x<sub>i</sub>)
              </p>
              <p>How much of coin i buys one coin j. The larger reserve is the cheaper coin.</p>
            </li>
            <li>
              <h3>Equal reserves</h3>
              <p className="formula">
                x<sub>i</sub> = r (1 − 1/√n)
              </p>
              <p>With four coins, √4 = 2, so each reserve is r / 2. The seed starts there.</p>
            </li>
            <li>
              <h3>The fee</h3>
              <p className="formula">fee = amount / 10,000</p>
              <p>One basis point, taken on the way in. It stays in the vault and does not re-enter the price.</p>
            </li>
            <li>
              <h3>The depeg check</h3>
              <p className="formula">min(r − x) / max(r − x) × 10,000</p>
              <p>The cheapest coin, in basis points of $1. A band freezes when this price falls through its floor.</p>
            </li>
            <li>
              <h3>After a band freezes</h3>
              <p className="formula">r′ = r × new sum / old sum</p>
              <p>Frozen reserves leave the quote and the radius scales down. One swap may freeze at most three bands.</p>
            </li>
          </ol>
          <p className="charter-close">
            The seed is split across eight floors: 40% above $0.9995, then 27%, 15%, 8%, 4%, 3%, 2%, and 1%
            across the full range. Tight bands do the trading near a dollar. A broken coin stops those bands
            and leaves the wider ones in place. Rounding favors the pool.
          </p>
        </section>

        <section className="section" id="passage">
          <p className="kicker">How a trade moves</p>
          <h2>Four steps, one form.</h2>
          <p className="section-lede">
            The app still asks for pay, amount, and receive. What changes is the book behind that form.
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
          <p className="kicker">Deployed</p>
          <h2>Live on Solana devnet.</h2>
          <p className="section-lede">
            Switch the wallet to devnet before you sign. These are the book mints and the deployer that seeded them.
          </p>
          <ul className="deploy-grid">
            <li>
              <h3>Solana devnet</h3>
              <p className="mono">{publicEnv.cluster}</p>
              <p>The shared book, the eight bands, and the swap all settle here.</p>
              <a href={publicEnv.rpcUrl}>{publicEnv.rpcUrl}</a>
            </li>
            <li>
              <h3>Kuroshio program</h3>
              <p className="mono">{program}</p>
              <p>Swap, liquidity, and positions call this program. The form does not change.</p>
            </li>
            <li>
              <h3>Orca and Raydium</h3>
              <p className="mono">Windows, not the book</p>
              <p>Pair pools on the same mints. The price you swap against is still Kuroshio.</p>
            </li>
            <li>
              <h3>Deployer</h3>
              <p className="mono">{publicEnv.deployer || "Issued at deploy"}</p>
              <p>Signs the book setup. Swap and faucet use the connected wallet.</p>
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
          <p className="kicker">Bands</p>
          <h2>Capital packed around a dollar.</h2>
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
          <h2>The next swap does not have to pick a shallow pair.</h2>
          <p>Open the same form. Pay one stablecoin, receive another, and both sides use one book.</p>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <strong>Kuroshio</strong>
          <p>One stablecoin book on Solana devnet. Pair windows on Orca and Raydium.</p>
        </div>
        <nav aria-label="App">
          <p>App</p>
          <Link href="/connect">Launch app</Link>
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
