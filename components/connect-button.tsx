"use client";

import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useEffect, useState } from "react";

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function ConnectButton({
  compact = false,
  label = "Connect",
}: {
  compact?: boolean;
  label?: string;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button type="button" className="connect-button" disabled>
        {label}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="wallet-cluster">
        <span className="wallet-address">{shorten(address)}</span>
        {compact ? null : (
          <button type="button" className="text-button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <button type="button" className="connect-button" onClick={() => open()}>
      {label}
    </button>
  );
}
