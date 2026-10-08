"use client";

import { useEffect, useState } from "react";
import { bookTokens } from "@/lib/env";

let imagesPromise: Promise<Record<string, string | null>> | null = null;

function loadImages() {
  if (!imagesPromise) {
    imagesPromise = fetch("/api/token-images")
      .then((response) => response.json())
      .then((body: { images?: Record<string, string | null> }) => body.images ?? {})
      .catch(() => ({}));
  }
  return imagesPromise;
}

export function TokenMark({ symbol }: { symbol: string }) {
  const known = symbol === "SOL" || bookTokens.some((token) => token.symbol === symbol);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!known) return;
    let stop = false;
    loadImages().then((images) => {
      if (!stop) setImage(images[symbol] ?? null);
    });
    return () => {
      stop = true;
    };
  }, [known, symbol]);

  if (image) return <img className="token-mark" src={image} alt="" />;
  const label = symbol === "SOL" ? "SOL" : symbol.slice(1, 3);
  return <span className={`token-mark mark-${symbol}`}>{label}</span>;
}
