"use client";

import type { Provider } from "@reown/appkit-adapter-solana/react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { bookTokens, publicEnv } from "@/lib/env";
import { TokenMark } from "@/components/token-mark";
import {
  explainProgramError,
  fetchOwnerBalance,
  formatTokenAmount,
  parseTokenAmount,
  SOL_FEE_RESERVE,
  transferTransaction,
} from "@/lib/kuroshio";

type BookSymbol = (typeof bookTokens)[number]["symbol"];
type AssetSymbol = BookSymbol | "SOL";
const assets: AssetSymbol[] = ["SOL", ...bookTokens.map((token) => token.symbol)];

function shortenWallet(address: string) {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}.....${address.slice(-4)}`;
}

function TokenPill({
  value,
  onChange,
}: {
  value: AssetSymbol;
  onChange: (next: AssetSymbol) => void;
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
          {assets.map((symbol) => (
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

function destinationKey(value: string) {
  const text = value.trim();
  if (!text) return null;
  try {
    return new PublicKey(text);
  } catch {
    return undefined;
  }
}

export function WalletTransfer({
  mode,
  address,
  walletProvider,
}: {
  mode: "send" | "receive";
  address: string;
  walletProvider: Provider | undefined;
}) {
  const [asset, setAsset] = useState<AssetSymbol>(bookTokens[0].symbol);
  const [amount, setAmount] = useState("0");
  const [destination, setDestination] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [signature, setSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState("");
  const token = bookTokens.find((item) => item.symbol === asset);
  const decimals = asset === "SOL" ? 9 : (token?.decimals ?? 0);
  const native = parseTokenAmount(amount, decimals);
  const spendable =
    balance === null ? null : asset === "SOL" ? (balance > SOL_FEE_RESERVE ? balance - SOL_FEE_RESERVE : 0n) : balance;
  const recipient = destinationKey(destination);
  const shortBalance = spendable !== null && native !== null && native > spendable;
  const actionLabel = pending
    ? "Confirm in wallet"
    : native === null || native <= 0n
      ? "Enter an amount"
      : recipient === null
        ? "Enter a wallet"
        : recipient === undefined
          ? "Wallet address is not valid"
          : recipient.toBase58() === address
            ? "Choose a different wallet"
            : shortBalance
              ? asset === "SOL" && balance !== null && native <= balance
                ? "Leave a little SOL for the fee"
                : `Not enough ${asset}`
              : "Send";

  useEffect(() => {
    if (mode !== "receive") return;
    let stop = false;
    QRCode.toString(address, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((markup) => {
        if (!stop) setQr(markup);
      })
      .catch(() => {
        if (!stop) setQr("");
      });
    return () => {
      stop = true;
    };
  }, [address, mode]);

  useEffect(() => {
    let stop = false;
    const connection = new Connection(publicEnv.rpcUrl, "confirmed");
    const load = async () => {
      try {
        const next = await fetchOwnerBalance(
          connection,
          new PublicKey(address),
          asset === "SOL" || !token?.mint ? null : new PublicKey(token.mint),
        );
        if (!stop) setBalance(next);
      } catch {
        if (!stop) setBalance(null);
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, [address, asset, token?.mint, signature]);

  async function onSend() {
    if (!recipient || native === null || native <= 0n || shortBalance) return;
    if (!walletProvider) {
      setNotice("Connect a wallet first.");
      return;
    }
    setPending(true);
    setNotice("");
    try {
      const connection = new Connection(publicEnv.rpcUrl, "confirmed");
      const transaction = transferTransaction({
        from: new PublicKey(address),
        to: recipient,
        mint: asset === "SOL" || !token?.mint ? null : new PublicKey(token.mint),
        amount: native,
      });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.feePayer = new PublicKey(address);
      transaction.recentBlockhash = blockhash;
      const sent = await walletProvider.signAndSendTransaction(transaction);
      await connection.confirmTransaction({ signature: sent, blockhash, lastValidBlockHeight }, "confirmed");
      setSignature(sent);
      setAmount("0");
      setNotice(`Sent ${formatTokenAmount(native, decimals)} ${asset}.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/rejected|denied|cancelled|canceled/i.test(text)) {
        setNotice("The wallet closed the request.");
      } else if (/insufficient funds|InsufficientFunds/i.test(text)) {
        setNotice("Not enough SOL for the fee, or not enough of this token.");
      } else {
        setNotice(explainProgramError(error));
      }
    } finally {
      setPending(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  if (mode === "receive") {
    return (
      <section className="trade" id="receive" aria-label="Receive">
        <div className="trade-card receive-card">
          <p className="kicker">Solana devnet</p>
          <h2>Receive</h2>
          <p>Another wallet sends SOL, nUSDC, nUSDT, nPYUSD, or nUSDe to this address.</p>
          <div className="receive-qr">
            <div
              className="receive-qr-frame"
              role="img"
              aria-label={`QR code for ${shortenWallet(address)}`}
              dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
            />
            <div className="receive-qr-meta">
              <div>
                <strong>Pool Ninja</strong>
                <button type="button" className="receive-short" onClick={copyAddress}>
                  {copied ? "Copied" : shortenWallet(address)}
                </button>
              </div>
              <TokenMark symbol={bookTokens[0].symbol} />
            </div>
          </div>
          <ul className="asset-list">
            {assets.map((symbol) => (
              <li key={symbol}>
                <div>
                  <TokenMark symbol={symbol} />
                  <strong>{symbol}</strong>
                </div>
                <span>{symbol === "SOL" ? "Native" : "Book token"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="trade" id="send" aria-label="Send">
      <div className="trade-card">
        <div className="trade-side">
          <div className="trade-label">
            <span>Send</span>
            <TokenPill value={asset} onChange={setAsset} />
          </div>
          <div className="pay-amount">
            <input
              aria-label="Send amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <div className="pay-max">
              <button
                type="button"
                className="max-button"
                disabled={spendable === null || spendable === 0n}
                onClick={() => {
                  if (spendable !== null) setAmount(formatTokenAmount(spendable, decimals));
                }}
              >
                Max
              </button>
              <span className="token-balance">
                {balance === null ? "…" : `${formatTokenAmount(balance, decimals)} ${asset}`}
              </span>
            </div>
          </div>
          <p>{asset === "SOL" ? "Native SOL" : "Book token"}</p>
        </div>
        <label className="wallet-field">
          <span>To</span>
          <input
            aria-label="Recipient wallet"
            placeholder="Wallet address"
            spellCheck={false}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="trade-submit"
          disabled={pending || actionLabel !== "Send"}
          onClick={onSend}
        >
          {actionLabel}
        </button>
        {asset === "SOL" ? (
          <p className="transfer-note">A little SOL stays in this wallet so the network fee can be paid.</p>
        ) : (
          <p className="transfer-note">The recipient token account is created when it does not exist yet.</p>
        )}
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
    </section>
  );
}
