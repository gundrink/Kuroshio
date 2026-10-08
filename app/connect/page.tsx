"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { ConnectButton } from "@/components/connect-button";

export default function ConnectPage() {
  const { isConnected } = useAppKitAccount();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <>
      <SiteHeader current="connect" swapHref={ready && isConnected ? "/app?panel=swap" : "/connect"} />
      <main className="connect-stage">
        <section className="connect-panel" aria-label="Connect wallet">
          <WaveMark />
          <p className="connect-kicker">Solana devnet</p>
          <h1>Connect a wallet</h1>
          <p className="connect-lead">One wallet signature.</p>
          <ConnectButton label="Connect Wallet" />
          {ready && isConnected ? (
            <Link className="connect-enter" href="/app">
              Enter the swap
            </Link>
          ) : null}
        </section>
      </main>
    </>
  );
}

function WaveMark() {
  return (
    <svg className="connect-mark" width="36" height="36" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M1 14c3-6 5-6 8 0s5 6 8 0 4-6 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M1 8c3-4 5-4 8 0s5 4 8 0 4-4 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
