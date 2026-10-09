"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectButton } from "@/components/connect-button";
import { SiteHeader } from "@/components/site-header";

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
          <img className="connect-mark" src="/logo-ninja.png" alt="" width={148} height={148} />
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

