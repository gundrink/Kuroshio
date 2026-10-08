"use client";

import { useState } from "react";

export function HeaderMarks({ xUrl, ca }: { xUrl: string; ca: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!ca) return;
    await navigator.clipboard.writeText(ca);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <span className="header-marks">
      <a
        className="mark-button"
        href={xUrl || undefined}
        target={xUrl ? "_blank" : undefined}
        rel={xUrl ? "noreferrer" : undefined}
        aria-label="X"
      >
        <XIcon />
      </a>
      <button
        className="mark-button ca-button"
        type="button"
        onClick={copyAddress}
        aria-label={copied ? "Contract address copied" : "Copy contract address"}
      >
        {copied ? "Copied" : formatCa(ca)}
      </button>
    </span>
  );
}

function formatCa(ca: string) {
  if (ca.length <= 8) return `CA : ${ca}`;
  return `CA : ${ca.slice(0, 4)}....${ca.slice(-4)}`;
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}
