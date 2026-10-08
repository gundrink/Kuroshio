"use client";

import { createAppKit, type CreateAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solanaDevnet } from "@reown/appkit/networks";
import { publicEnv } from "@/lib/env";

const solanaAdapter = new SolanaAdapter();
const origin = typeof window === "undefined" ? publicEnv.appUrl : window.location.origin;

// `basic` is omitted from the public type. It skips the dashboard fetch that
// turns email and social login back on for this project id.
createAppKit({
  adapters: [solanaAdapter],
  networks: [solanaDevnet],
  defaultNetwork: solanaDevnet,
  projectId: publicEnv.reownProjectId,
  metadata: {
    name: "Kuroshio",
    description: "One book for every stablecoin on Solana devnet.",
    url: origin,
    icons: [`${origin}/icon`],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#d7a15a",
    "--w3m-color-mix": "#102028",
    "--w3m-color-mix-strength": 20,
  },
  basic: true,
} as unknown as CreateAppKit);

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return children;
}
