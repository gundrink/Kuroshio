"use client";

import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { TokenMark } from "@/components/token-mark";
import { WalletTransfer } from "@/components/wallet-transfer";
import { bookTokens, depegBands, publicEnv } from "@/lib/env";
import {
  buyWithSolTransaction,
  claimKusdcTransaction,
  explainProgramError,
  fetchBook,
  fetchOwnerBalance,
  formatTokenAmount,
  parseTokenAmount,
  quoteExactIn,
  quoteSolBuy,
  swapTransaction,
  TOKENS_PER_SOL,
  type OnchainBook,
} from "@/lib/kuroshio";
import { hasClaimedReward, saveClaimedReward } from "@/lib/reward-claim";

type BookSymbol = (typeof bookTokens)[number]["symbol"];
type PaySymbol = BookSymbol | "SOL";
type Panel = "swap" | "send" | "receive" | "book" | "bands";
const SLIPPAGE_PRESETS = [0.1, 0.5, 1];

function formatSlippage(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function parseSlippage(draft: string) {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(draft)) return null;
  const value = Number(draft);
  if (!Number.isFinite(value) || value < 0.01 || value > 50) return null;
  return value;
}

function SlippageSettings({ value, onSave }: { value: number; onSave: (next: number) => void }) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(formatSlippage(value).replace("%", ""));
  const parsed = parseSlippage(draft);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
  }

  function save() {
    if (parsed === null) return;
    onSave(parsed);
    setOpen(false);
  }

  return (
    <div className="slippage">
      <span>Slippage</span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(formatSlippage(value).replace("%", ""));
          setOpen(true);
        }}
      >
        {formatSlippage(value)}
      </button>
      {open ? (
        <div className="slippage-modal" onClick={close}>
          <div
            className="slippage-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id={titleId}>Slippage</h2>
              <button type="button" className="icon-button" aria-label="Close" onClick={close}>
                ×
              </button>
            </header>
            <p>The most the price can move before this swap stops.</p>
            <div className="slippage-presets">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={parsed === preset}
                  onClick={() => setDraft(String(preset))}
                >
                  {formatSlippage(preset)}
                </button>
              ))}
            </div>
            <label className="slippage-custom">
              <span>Custom</span>
              <input
                ref={inputRef}
                inputMode="decimal"
                aria-label="Custom slippage percent"
                value={draft}
                onChange={(event) => {
                  const next = event.target.value.replace("%", "").trim();
                  if (next === "" || /^\d{0,2}(\.\d{0,2})?$/.test(next)) setDraft(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") save();
                }}
              />
              <span>%</span>
            </label>
            <p className="slippage-note" role="status">
              {draft !== "" && parsed === null
                ? "Use a value from 0.01 to 50."
                : parsed !== null && parsed > 5
                  ? "Above 5% can fill far from the quoted price."
                  : parsed !== null && parsed < 0.1
                    ? "Under 0.1% can fail on a small price move."
                    : ""}
            </p>
            <button type="button" className="trade-submit" disabled={parsed === null} onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dollars(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0.00";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function TokenPill<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="token-pill">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <TokenMark symbol={value} />
        {value}
      </button>
      {open ? (
        <ul>
          {options.map((symbol) => (
            <li key={symbol}>
              <button
                type="button"
                onClick={() => {
                  onChange(symbol);
                  setOpen(false);
                }}
              >
                <TokenMark symbol={symbol} />
                {symbol}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatBookAmount(amount: bigint) {
  const cents = (amount + 5_000_000n) / 10_000_000n;
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function floorLabel(priceBps: number) {
  if (priceBps === 0) return "Full range";
  return `$${(priceBps / 10_000).toFixed(4)}`;
}

function livePrice(bps: bigint) {
  const whole = bps / 10_000n;
  const fraction = (bps % 10_000n).toString().padStart(4, "0");
  return `$${whole.toString()}.${fraction}`;
}

function shortMint(mint: string) {
  return mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : "Not issued";
}

function coinRows(book: OnchainBook) {
  return bookTokens.map((token) => {
    const index = book.mints.findIndex((mint) => mint.toBase58() === token.mint);
    const reserve = index < 0 ? null : book.bands.reduce((sum, band) => sum + band.reserves[index], 0n);
    return { token, index, reserve };
  });
}

function quotingState(book: OnchainBook) {
  const totals = [0n, 0n, 0n, 0n];
  let open = 0;
  for (const band of book.bands) {
    if (band.frozen) continue;
    open += 1;
    band.reserves.forEach((value, index) => {
      totals[index] += value;
    });
  }
  return { totals, open };
}

function cheapestBps(radius: bigint, reserves: bigint[]) {
  let minGap: bigint | null = null;
  let maxGap = 0n;
  for (const reserve of reserves) {
    if (reserve > radius) return null;
    const gap = radius - reserve;
    if (minGap === null || gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
  }
  if (minGap === null || maxGap === 0n) return null;
  return (minGap * 10_000n) / maxGap;
}

function BookReadout({ book }: { book: OnchainBook }) {
  const rows = coinRows(book);
  const { totals, open } = quotingState(book);
  const price = open > 0 ? cheapestBps(book.radius, totals) : null;
  const priced = rows.filter((row) => row.index >= 0);
  const richest = priced.reduce((best, row) => (row.reserve !== null && row.reserve > best ? row.reserve : best), 0n);
  const cheapest = priced.filter((row) => row.reserve === richest).map((row) => row.token.symbol);
  const even = cheapest.length === priced.length;
  const priceText =
    price === null
      ? "The live price is not available."
      : even || priced.length === 0
        ? `All four coins are the same price, ${livePrice(price)}.`
        : `${cheapest.join(" and ")} ${cheapest.length > 1 ? "are" : "is"} cheapest, at ${livePrice(price)}.`;

  return (
    <>
      <p className="ledger-now">
        {book.tradingEnabled ? "Trading is open." : "Trading is closed."} {open} of {book.bands.length} floors are
        quoting. {priceText}
      </p>
      <ul className="coin-ledger">
        {rows.map((row) => (
          <li key={row.token.symbol}>
            <TokenMark symbol={row.token.symbol} />
            <div>
              <strong>{row.token.symbol}</strong>
              <span>
                {row.token.decimals} decimals · {shortMint(row.token.mint)}
              </span>
            </div>
            <div className="coin-amount">
              <strong>{row.reserve === null ? "—" : formatBookAmount(row.reserve)}</strong>
              <span>{row.reserve === null ? "Not in this book" : "in the book"}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function BandsReadout({ book }: { book: OnchainBook }) {
  const rows = coinRows(book);
  const { totals, open } = quotingState(book);
  const price = open > 0 ? cheapestBps(book.radius, totals) : null;

  return (
    <>
      <p className="ledger-now">
        {price === null
          ? "No floor is quoting right now."
          : `Cheapest coin right now: ${livePrice(price)}. ${open} of ${book.bands.length} floors are still quoting.`}
      </p>
      <ol className="slice-list">
        {book.bands.map((band, index) => {
          const share = depegBands.find((item) => item.priceBps === band.priceBps)?.share;
          const floor = floorLabel(band.priceBps);
          const state = band.frozen ? "Stopped" : band.priceBps === 0 ? "No floor" : "Quoting";
          const meaning = band.priceBps === 0
            ? "This slice has no floor, so it keeps quoting after the others stop."
            : band.frozen
              ? `Stopped. The cheapest coin fell below ${floor}, so this slice no longer quotes.`
              : `Still quoting. It stops if the cheapest coin falls below ${floor}.`;
          return (
            <li className="slice" key={`${band.priceBps}-${index}`}>
              <header>
                <strong>{floor}</strong>
                <span>{share ? `${share} of the opening seed` : "Opening seed"}</span>
                <em className={band.frozen ? "slice-state is-stopped" : band.priceBps === 0 ? "slice-state is-steady" : "slice-state is-quoting"}>
                  {state}
                </em>
              </header>
              <p>{meaning}</p>
              <ul className="slice-reserves">
                {rows.map((row) => (
                  <li key={row.token.symbol}>
                    <span>{row.token.symbol}</span>
                    <strong>{row.index < 0 ? "—" : formatBookAmount(band.reserves[row.index])}</strong>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Ledger({
  label,
  kicker,
  title,
  lead,
  book,
  bookError,
  ready,
  children,
  next,
}: {
  label: string;
  kicker: string;
  title: string;
  lead: string;
  book: OnchainBook | null;
  bookError: string;
  ready: boolean;
  children: (book: OnchainBook) => ReactNode;
  next: { href: string; label: string };
}) {
  return (
    <section className="trade ledger" aria-label={label}>
      <div className="ledger-card">
        <p className="ledger-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p className="ledger-lead">{lead}</p>
        {book ? children(book) : <p className="ledger-message">{bookError || (ready ? "Loading the book…" : "Loading…")}</p>}
        <p className="ledger-note">
          Only nUSDC, nUSDT, nPYUSD, and nUSDe can be swapped. A name on the landing page that is not in this list is not in the book.
        </p>
        <Link className="ledger-link" href={next.href}>
          {next.label}
        </Link>
      </div>
    </section>
  );
}

function ApplicationScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("panel");
  const panel: Panel =
    requested === "book" || requested === "bands" || requested === "send" || requested === "receive"
      ? requested
      : "swap";
  const [pay, setPay] = useState<PaySymbol>(bookTokens[0].symbol);
  const [receive, setReceive] = useState<BookSymbol>(bookTokens[1].symbol);
  const [amount, setAmount] = useState("0");
  const [slippage, setSlippage] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [book, setBook] = useState<OnchainBook | null>(null);
  const [bookError, setBookError] = useState("");
  const [payBalance, setPayBalance] = useState<bigint | null>(null);
  const [receiveBalance, setReceiveBalance] = useState<bigint | null>(null);
  const [notice, setNotice] = useState("");
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  const { address, isConnected, status } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") {
      setWalletReady(false);
      return;
    }
    if (status === "connected") {
      setWalletReady(true);
      return;
    }
    const timer = window.setTimeout(() => setWalletReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!ready || !walletReady) return;
    if ((panel === "swap" || panel === "send" || panel === "receive") && status === "disconnected") {
      router.replace("/connect");
    }
  }, [ready, walletReady, panel, status, router]);

  useEffect(() => {
    if (!address) {
      setClaimed(false);
      return;
    }
    setClaimed(hasClaimedReward(window.localStorage, address));
  }, [address]);

  useEffect(() => {
    if (!ready || !publicEnv.programId) return;
    const connection = new Connection(publicEnv.rpcUrl, "confirmed");
    let stop = false;
    const load = () => {
      fetchBook(connection)
        .then((next) => {
          if (stop) return;
          setBook(next);
          setBookError(next ? "" : "The devnet book is not on this cluster.");
        })
        .catch(() => {
          if (!stop) {
            setBook(null);
            setBookError("The devnet book did not load.");
          }
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [ready]);
  const programReady = publicEnv.programId.length > 0;
  const payingSol = pay === "SOL";
  const receiveOptions = bookTokens.filter((token) => token.symbol !== pay).map((token) => token.symbol);
  const payToken = bookTokens.find((token) => token.symbol === pay);
  const receiveToken = bookTokens.find((token) => token.symbol === receive);
  const payOptions: PaySymbol[] = ["SOL", ...bookTokens.map((token) => token.symbol)];

  useEffect(() => {
    if (!ready || !address) {
      setPayBalance(null);
      setReceiveBalance(null);
      return;
    }
    const connection = new Connection(publicEnv.rpcUrl, "confirmed");
    let stop = false;
    const load = async () => {
      try {
        const owner = new PublicKey(address);
        const payMint = payingSol || !payToken?.mint ? null : new PublicKey(payToken.mint);
        const receiveMint = receiveToken?.mint ? new PublicKey(receiveToken.mint) : null;
        const [nextPay, nextReceive] = await Promise.all([
          fetchOwnerBalance(connection, owner, payMint),
          receiveMint ? fetchOwnerBalance(connection, owner, receiveMint) : Promise.resolve(0n),
        ]);
        if (stop) return;
        setPayBalance(nextPay);
        setReceiveBalance(nextReceive);
      } catch {
        if (!stop) {
          setPayBalance(null);
          setReceiveBalance(null);
        }
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, [ready, address, payingSol, payToken?.mint, receiveToken?.mint, signature]);

  function choosePay(next: PaySymbol) {
    setPay(next);
    if (next === "SOL") return;
    if (next === receive) {
      const fallback = bookTokens.find((token) => token.symbol !== next);
      if (fallback) setReceive(fallback.symbol);
    }
  }

  function flip() {
    if (pay === "SOL") {
      const fallback = bookTokens.find((token) => token.symbol !== receive);
      setPay(receive);
      if (fallback) setReceive(fallback.symbol);
      return;
    }
    setPay(receive);
    setReceive(pay);
  }

  const payIndex = book && payToken ? book.mints.findIndex((mint) => mint.toBase58() === payToken.mint) : -1;
  const receiveIndex = book && receiveToken ? book.mints.findIndex((mint) => mint.toBase58() === receiveToken.mint) : -1;
  const payNative = payingSol
    ? parseTokenAmount(amount, 9)
    : payToken
      ? parseTokenAmount(amount, payToken.decimals)
      : null;
  const quote = useMemo(() => {
    if (payingSol) {
      if (!receiveToken || payNative === null || payNative <= 0n) return null;
      const amountOut = quoteSolBuy(payNative, receiveToken.decimals);
      if (!amountOut) return "This SOL amount buys no tokens.";
      return { amountIn: payNative, amountOut, fee: 0n };
    }
    if (!book || payIndex < 0 || receiveIndex < 0 || payNative === null || payNative <= 0n) return null;
    try {
      return quoteExactIn(book, payIndex, receiveIndex, payNative);
    } catch (error) {
      return error instanceof Error ? error.message : "Quote unavailable";
    }
  }, [book, payIndex, receiveIndex, payNative, payingSol, receiveToken]);
  const quotedOut = quote && typeof quote !== "string" ? quote : null;
  const quoteError = typeof quote === "string" ? quote : "";
  const receiveText =
    quotedOut && receiveToken ? formatTokenAmount(quotedOut.amountOut, receiveToken.decimals) : "0";
  const payDecimals = payingSol ? 9 : (payToken?.decimals ?? 0);
  const receiveDecimals = receiveToken?.decimals ?? 0;
  const payBalanceText =
    payBalance === null ? "…" : `${formatTokenAmount(payBalance, payDecimals)} ${pay}`;
  const receiveBalanceText =
    receiveBalance === null ? "Balance …" : `Balance ${formatTokenAmount(receiveBalance, receiveDecimals)}`;
  const shortBalance = payBalance !== null && payNative !== null && payNative > payBalance;
  const actionLabel = pending
    ? "Confirm in wallet"
    : !programReady
      ? "Devnet program is not deployed yet"
      : !book
        ? "Loading the book"
        : payNative === null || payNative <= 0n
          ? "Enter an amount"
          : quoteError
            ? "Quote unavailable"
            : shortBalance
              ? `Not enough ${pay}`
              : payingSol
                ? "Buy"
                : "Swap";

  async function send(transaction: Transaction) {
    if (!address || !walletProvider) throw new Error("Connect a wallet first");
    const connection = new Connection(publicEnv.rpcUrl, "confirmed");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.feePayer = new PublicKey(address);
    transaction.recentBlockhash = blockhash;
    const sent = await walletProvider.signAndSendTransaction(transaction);
    await connection.confirmTransaction({ signature: sent, blockhash, lastValidBlockHeight }, "confirmed");
    setSignature(sent);
    setBook(await fetchBook(connection));
  }

  async function onSwap() {
    if (!book || !quotedOut || !payNative) return;
    setPending(true);
    setNotice("");
    try {
      if (payingSol) {
        if (!receiveToken?.mint) return;
        await send(buyWithSolTransaction(new PublicKey(address!), book, receiveToken.mint, payNative));
        setNotice(`Bought ${receive} with SOL. 1 SOL mints ${TOKENS_PER_SOL} tokens.`);
      } else {
        if (payIndex < 0 || receiveIndex < 0) return;
        const slippageBps = BigInt(Math.round(slippage * 100));
        const minimumOut = (quotedOut.amountOut * (10_000n - slippageBps)) / 10_000n;
        const transaction = new Transaction().add(
          swapTransaction({
            user: new PublicKey(address!),
            book,
            input: payIndex,
            output: receiveIndex,
            amountIn: payNative,
            minimumOut,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
          }),
        );
        await send(transaction);
        setNotice("Swap confirmed on devnet.");
      }
    } catch (error) {
      setNotice(explainProgramError(error));
    } finally {
      setPending(false);
    }
  }

  async function onClaim() {
    if (!book || !address || claimed) return;
    setPending(true);
    setNotice("");
    try {
      await send(claimKusdcTransaction(new PublicKey(address), book));
      saveClaimedReward(window.localStorage, address);
      setClaimed(true);
      setNotice("1,000 nUSDC is in the wallet. This reward can be claimed once.");
    } catch (error) {
      const message = explainProgramError(error);
      if (message.includes("already claimed")) {
        saveClaimedReward(window.localStorage, address);
        setClaimed(true);
      }
      setNotice(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SiteHeader current="app" panel={panel} swapHref={ready && isConnected ? "/app?panel=swap" : "/connect"} />
      <main className="shell trade-shell">
        {panel === "swap" && ready && isConnected ? (
          <section className="trade" id="swap" aria-label="Swap">
            <div className="trade-tools">
              <button type="button" className="icon-button" aria-label="Reset amount" onClick={() => setAmount("0")}>
                ↻
              </button>
              <SlippageSettings value={slippage} onSave={setSlippage} />
            </div>
            <div className="trade-card">
              <div className="trade-side">
                <div className="trade-label">
                  <span>Pay</span>
                  <TokenPill value={pay} options={payOptions} onChange={choosePay} />
                </div>
                <div className="pay-amount">
                  <input
                    aria-label="Pay amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <div className="pay-max">
                    <button
                      type="button"
                      className="max-button"
                      disabled={payBalance === null || payBalance === 0n}
                      onClick={() => {
                        if (payBalance !== null) setAmount(formatTokenAmount(payBalance, payDecimals));
                      }}
                    >
                      Max
                    </button>
                    <span className="token-balance">{payBalanceText}</span>
                  </div>
                </div>
                <p>{payingSol ? "Native SOL" : dollars(amount)}</p>
              </div>
              <button type="button" className="flip-button" aria-label="Switch pay and receive" onClick={flip}>
                ↓↑
              </button>
              <div className="trade-side">
                <div className="trade-label">
                  <span>Receive</span>
                  <div className="token-choice">
                    <TokenPill value={receive} options={receiveOptions} onChange={setReceive} />
                    <span className="token-balance">{receiveBalanceText}</span>
                  </div>
                </div>
                <output>{receiveText}</output>
                <p>
                  {payingSol && quotedOut && receiveToken
                    ? `${dollars(formatTokenAmount(quotedOut.amountOut, receiveToken.decimals))} · ${TOKENS_PER_SOL} tokens per SOL`
                    : quotedOut && receiveToken
                      ? `${dollars(formatTokenAmount(quotedOut.amountOut, receiveToken.decimals))} · fee ${formatTokenAmount(quotedOut.fee, payToken?.decimals ?? 6)} ${pay}`
                      : bookError || quoteError || "Quote from the devnet book"}
                </p>
              </div>
              <button
                type="button"
                className="trade-submit"
                disabled={!programReady || !book || !quotedOut || pending || shortBalance}
                onClick={onSwap}
              >
                {actionLabel}
              </button>
              {programReady ? (
                <button type="button" className="trade-faucet" disabled={pending || !book || claimed} onClick={onClaim}>
                  {claimed ? "nUSDC reward claimed" : "Claim 1,000 nUSDC"}
                </button>
              ) : null}
              {notice ? <p className="trade-notice">{notice}</p> : null}
              {signature ? (
                <a
                  className="trade-explorer"
                  href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer
                </a>
              ) : null}
            </div>
            <ul className="asset-list">
              {(payingSol
                ? [{ symbol: "SOL", decimals: 9, mint: "" }, receiveToken]
                : [payToken, receiveToken]
              ).map((token) =>
                token ? (
                  <li key={token.symbol}>
                    <div>
                      <TokenMark symbol={token.symbol} />
                      <div>
                        <strong>{token.symbol}</strong>
                        <span>{token.symbol === "SOL" ? "Pays the treasury" : `${token.decimals} decimals`}</span>
                      </div>
                    </div>
                    <span>
                      {token.symbol === "SOL"
                        ? "Native"
                        : token.mint
                          ? `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}`
                          : "Not issued yet"}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}

        {(panel === "send" || panel === "receive") && ready && isConnected && address ? (
          <WalletTransfer mode={panel} address={address} walletProvider={walletProvider} />
        ) : null}
        {(panel === "send" || panel === "receive") && ready && !isConnected ? (
          <section className="trade" aria-label="Opening wallet">
            <div className="trade-card">
              <p className="transfer-note">Opening the wallet…</p>
            </div>
          </section>
        ) : null}

        {panel === "book" ? (
          <Ledger
            label="Book"
            kicker="Four coins"
            title="Book"
            lead="These four test coins share one reserve. Paying any of them to receive another uses this same book. SOL can buy them, and SOL is not one of the four reserves."
            book={book}
            bookError={programReady ? bookError : "The devnet program is not set."}
            ready={ready}
            next={{ href: "/app?panel=bands", label: "See the eight floors" }}
          >
            {(loaded) => <BookReadout book={loaded} />}
          </Ledger>
        ) : null}

        {panel === "bands" ? (
          <Ledger
            label="Bands"
            kicker="Eight floors"
            title="Bands"
            lead="Each band is one slice of the same four coins, with its own floor. You do not choose a slice. If the cheapest coin falls through a floor, that slice stops quoting and the slices still above their floor keep trading. One swap can stop at most three slices."
            book={book}
            bookError={programReady ? bookError : "The devnet program is not set."}
            ready={ready}
            next={{ href: "/app?panel=book", label: "See the four coins" }}
          >
            {(loaded) => <BandsReadout book={loaded} />}
          </Ledger>
        ) : null}
      </main>
    </>
  );
}

export default function ApplicationPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationScreen />
    </Suspense>
  );
}
