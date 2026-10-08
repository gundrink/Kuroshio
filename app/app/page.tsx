"use client";

import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { bookTokens, publicEnv } from "@/lib/env";
import {
  buyWithSolTransaction,
  claimKusdcTransaction,
  explainProgramError,
  fetchBook,
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
type Panel = "swap" | "book" | "bands";
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

function TokenMark({ symbol }: { symbol: string }) {
  const label = symbol === "SOL" ? "SOL" : symbol.slice(1, 3);
  return <span className={`token-mark mark-${symbol}`}>{label}</span>;
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

function SoonArt({ kind }: { kind: "book" | "bands" }) {
  if (kind === "book") {
    return (
      <svg className="soon-art" viewBox="0 0 160 96" aria-hidden="true">
        <circle cx="80" cy="48" r="30" fill="none" stroke="#1aa6a0" strokeWidth="1.4" />
        <circle cx="80" cy="48" r="7" fill="#1aa6a0" />
        <circle cx="26" cy="48" r="3.2" fill="#8fe3dc" />
        <circle cx="48" cy="48" r="3.2" fill="#8fe3dc" opacity="0.75" />
        <circle cx="112" cy="48" r="3.2" fill="#8fe3dc" opacity="0.75" />
        <circle cx="134" cy="48" r="3.2" fill="#8fe3dc" />
      </svg>
    );
  }

  return (
    <svg className="soon-art" viewBox="0 0 160 96" aria-hidden="true">
      {[36, 28, 20, 12].map((radius, index) => (
        <path
          key={radius}
          d={`M${80 - radius} 68a${radius} ${radius} 0 0 1 ${radius * 2} 0`}
          fill="none"
          stroke="#1aa6a0"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity={0.28 + index * 0.2}
        />
      ))}
    </svg>
  );
}

function ComingSoon({
  kind,
  title,
  body,
}: {
  kind: "book" | "bands";
  title: string;
  body: string;
}) {
  return (
    <section className="trade soon" aria-label={title}>
      <div className="soon-card">
        <p className="soon-kicker">Coming soon</p>
        <h2>{title}</h2>
        <p>{body}</p>
        <SoonArt kind={kind} />
      </div>
    </section>
  );
}

function ApplicationScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("panel");
  const panel: Panel = requested === "book" || requested === "bands" ? requested : "swap";
  const [pay, setPay] = useState<PaySymbol>(bookTokens[0].symbol);
  const [receive, setReceive] = useState<BookSymbol>(bookTokens[1].symbol);
  const [amount, setAmount] = useState("0");
  const [slippage, setSlippage] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [book, setBook] = useState<OnchainBook | null>(null);
  const [notice, setNotice] = useState("");
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && panel === "swap" && !isConnected) router.replace("/connect");
  }, [ready, panel, isConnected, router]);

  useEffect(() => {
    if (!address) {
      setClaimed(false);
      return;
    }
    setClaimed(hasClaimedReward(window.localStorage, address));
  }, [address]);

  useEffect(() => {
    if (!ready || !isConnected || !publicEnv.programId) return;
    const connection = new Connection(publicEnv.rpcUrl, "confirmed");
    let stop = false;
    const load = () => {
      fetchBook(connection)
        .then((next) => {
          if (!stop) setBook(next);
        })
        .catch(() => {
          if (!stop) setBook(null);
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [ready, isConnected]);
  const programReady = publicEnv.programId.length > 0;
  const payingSol = pay === "SOL";
  const receiveOptions = bookTokens.filter((token) => token.symbol !== pay).map((token) => token.symbol);
  const payToken = bookTokens.find((token) => token.symbol === pay);
  const receiveToken = bookTokens.find((token) => token.symbol === receive);
  const payOptions: PaySymbol[] = ["SOL", ...bookTokens.map((token) => token.symbol)];

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
    quotedOut && receiveToken ? formatTokenAmount(quotedOut.amountOut, receiveToken.decimals) : amount === "" ? "0" : "0";

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
      setNotice("1,000 kUSDC is in the wallet. This reward can be claimed once.");
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
                <input
                  aria-label="Pay amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <p>{payingSol ? "Native SOL" : dollars(amount)}</p>
              </div>
              <button type="button" className="flip-button" aria-label="Switch pay and receive" onClick={flip}>
                ↓↑
              </button>
              <div className="trade-side">
                <div className="trade-label">
                  <span>Receive</span>
                  <TokenPill value={receive} options={receiveOptions} onChange={setReceive} />
                </div>
                <output>{receiveText}</output>
                <p>
                  {payingSol && quotedOut && receiveToken
                    ? `${dollars(formatTokenAmount(quotedOut.amountOut, receiveToken.decimals))} · ${TOKENS_PER_SOL} tokens per SOL`
                    : quotedOut && receiveToken
                      ? `${dollars(formatTokenAmount(quotedOut.amountOut, receiveToken.decimals))} · fee ${formatTokenAmount(quotedOut.fee, payToken?.decimals ?? 6)} ${pay}`
                      : quoteError || "Quote from the devnet book"}
                </p>
              </div>
              <button
                type="button"
                className="trade-submit"
                disabled={!programReady || !quotedOut || pending}
                onClick={onSwap}
              >
                {pending ? "Confirm in wallet" : programReady ? (payingSol ? "Buy" : "Swap") : "Devnet program is not deployed yet"}
              </button>
              {programReady ? (
                <button type="button" className="trade-faucet" disabled={pending || !book || claimed} onClick={onClaim}>
                  {claimed ? "kUSDC reward claimed" : "Claim 1,000 kUSDC"}
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

        {panel === "book" ? (
          <ComingSoon
            kind="book"
            title="Book"
            body="One reserve for kUSDC, kUSDT, kDAI, and kFRAX. It opens when the devnet pool is issued."
          />
        ) : null}

        {panel === "bands" ? (
          <ComingSoon
            kind="bands"
            title="Bands"
            body="Liquidity nested around a dollar. The bands open together with the book."
          />
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
