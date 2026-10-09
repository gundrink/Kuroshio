function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`${name} is not set`);
  }
  return trimmed;
}

function optional(value: string | undefined): string {
  return value?.trim() ?? "";
}

export const publicEnv = {
  reownProjectId: required(
    "NEXT_PUBLIC_REOWN_PROJECT_ID",
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
  ),
  appUrl: optional(process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000",
  cluster: required("NEXT_PUBLIC_SOLANA_CLUSTER", process.env.NEXT_PUBLIC_SOLANA_CLUSTER),
  rpcUrl: required("NEXT_PUBLIC_SOLANA_RPC_URL", process.env.NEXT_PUBLIC_SOLANA_RPC_URL),
  splTokenProgram: required(
    "NEXT_PUBLIC_SPL_TOKEN_PROGRAM",
    process.env.NEXT_PUBLIC_SPL_TOKEN_PROGRAM,
  ),
  associatedTokenProgram: required(
    "NEXT_PUBLIC_ASSOCIATED_TOKEN_PROGRAM",
    process.env.NEXT_PUBLIC_ASSOCIATED_TOKEN_PROGRAM,
  ),
  orcaWhirlpoolProgram: required(
    "NEXT_PUBLIC_ORCA_WHIRLPOOL_PROGRAM",
    process.env.NEXT_PUBLIC_ORCA_WHIRLPOOL_PROGRAM,
  ),
  orcaWhirlpoolConfig: required(
    "NEXT_PUBLIC_ORCA_WHIRLPOOL_CONFIG",
    process.env.NEXT_PUBLIC_ORCA_WHIRLPOOL_CONFIG,
  ),
  orcaConfigExtension: required(
    "NEXT_PUBLIC_ORCA_CONFIG_EXTENSION",
    process.env.NEXT_PUBLIC_ORCA_CONFIG_EXTENSION,
  ),
  orcaFeeTier1: required("NEXT_PUBLIC_ORCA_FEE_TIER_1", process.env.NEXT_PUBLIC_ORCA_FEE_TIER_1),
  raydiumClmmProgram: required(
    "NEXT_PUBLIC_RAYDIUM_CLMM_PROGRAM",
    process.env.NEXT_PUBLIC_RAYDIUM_CLMM_PROGRAM,
  ),
  referenceUsdc: required(
    "NEXT_PUBLIC_REFERENCE_USDC_DEVNET",
    process.env.NEXT_PUBLIC_REFERENCE_USDC_DEVNET,
  ),
  referencePyusd: required(
    "NEXT_PUBLIC_REFERENCE_PYUSD_DEVNET",
    process.env.NEXT_PUBLIC_REFERENCE_PYUSD_DEVNET,
  ),
  deployer: optional(process.env.NEXT_PUBLIC_DEPLOYER),
  xUrl: optional(process.env.NEXT_PUBLIC_X_URL),
  ca: optional(process.env.NEXT_PUBLIC_CA),
  programId: optional(process.env.NEXT_PUBLIC_KUROSHIO_PROGRAM_ID),
  mintKusdc: optional(process.env.NEXT_PUBLIC_MINT_KUSDC),
  mintKusdt: optional(process.env.NEXT_PUBLIC_MINT_KUSDT),
  mintKdai: optional(process.env.NEXT_PUBLIC_MINT_KDAI),
  mintKfrax: optional(process.env.NEXT_PUBLIC_MINT_KFRAX),
};

export const bookTokens = [
  { symbol: "nUSDC", decimals: 6, mint: publicEnv.mintKusdc },
  { symbol: "nUSDT", decimals: 6, mint: publicEnv.mintKusdt },
  { symbol: "nPYUSD", decimals: 9, mint: publicEnv.mintKdai },
  { symbol: "nUSDe", decimals: 9, mint: publicEnv.mintKfrax },
] as const;

export const venueAddresses = [
  { label: "SPL Token", address: publicEnv.splTokenProgram },
  { label: "Associated Token", address: publicEnv.associatedTokenProgram },
  { label: "Orca Whirlpool", address: publicEnv.orcaWhirlpoolProgram },
  { label: "Orca config", address: publicEnv.orcaWhirlpoolConfig },
  { label: "Orca extension", address: publicEnv.orcaConfigExtension },
  { label: "Orca fee 0.01%", address: publicEnv.orcaFeeTier1 },
  { label: "Raydium CLMM", address: publicEnv.raydiumClmmProgram },
  { label: "USDC devnet (reference)", address: publicEnv.referenceUsdc },
  { label: "PYUSD devnet (reference)", address: publicEnv.referencePyusd },
] as const;

export const depegBands = [
  { price: "$0.9995", share: "40%" },
  { price: "$0.9990", share: "27%" },
  { price: "$0.9950", share: "15%" },
  { price: "$0.9900", share: "8%" },
  { price: "$0.9800", share: "4%" },
  { price: "$0.9500", share: "3%" },
  { price: "$0.9000", share: "2%" },
  { price: "Full range", share: "1%" },
] as const;
