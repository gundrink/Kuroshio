import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { publicEnv } from "@/lib/env";

export const PROGRAM_ID = new PublicKey(
  publicEnv.programId || "2Q7mJej5TW3y5Uadf68KPFKV1BnKrDAibQLDZXyZyPox",
);
export const TOKEN_PROGRAM_ID = new PublicKey(publicEnv.splTokenProgram);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(publicEnv.associatedTokenProgram);

const BPS = 10_000n;
const FEE_BPS = 1n;
const MAX_CROSSINGS = 3;
const BAND_STRIDE = 67;

const DISC = {
  swap: Uint8Array.from([248, 198, 158, 145, 225, 117, 135, 200]),
  faucet: Uint8Array.from([0, 98, 59, 30, 144, 142, 113, 12]),
  buyWithSol: Uint8Array.from([49, 57, 124, 194, 240, 20, 216, 102]),
};

export const TOKENS_PER_SOL = 100n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export type BookBand = {
  priceBps: number;
  frozen: boolean;
  reserves: bigint[];
};

export type OnchainBook = {
  tradingEnabled: boolean;
  mints: PublicKey[];
  vaults: PublicKey[];
  decimals: number[];
  radius: bigint;
  bands: BookBand[];
};

export type SwapQuote = {
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
};

export function poolAddress() {
  return PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID)[0];
}

export function authorityAddress() {
  return PublicKey.findProgramAddressSync([Buffer.from("authority")], PROGRAM_ID)[0];
}

export function faucetAddress(wallet: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("faucet"), wallet.toBuffer()], PROGRAM_ID)[0];
}

export function associatedTokenAddress(mint: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function parseTokenAmount(value: string, decimals: number) {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export function formatTokenAmount(amount: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function decodeBook(data: Uint8Array): OnchainBook {
  const view = Buffer.from(data);
  let offset = 8;
  offset += 3;
  const tradingEnabled = view.readUInt8(offset) === 1;
  offset += 1 + 32;
  const mints = Array.from({ length: 4 }, () => {
    const key = new PublicKey(view.subarray(offset, offset + 32));
    offset += 32;
    return key;
  });
  const vaults = Array.from({ length: 4 }, () => {
    const key = new PublicKey(view.subarray(offset, offset + 32));
    offset += 32;
    return key;
  });
  const decimals = Array.from({ length: 4 }, () => {
    const value = view.readUInt8(offset);
    offset += 1;
    return value;
  });
  const radius = readU128(view, offset);
  offset += 16;
  const bands = Array.from({ length: 8 }, () => {
    const priceBps = view.readUInt16LE(offset);
    const frozen = view.readUInt8(offset + 2) === 1;
    const reserves = [0, 1, 2, 3].map((index) => readU128(view, offset + 3 + index * 16));
    offset += BAND_STRIDE;
    return { priceBps, frozen, reserves };
  });
  return { tradingEnabled, mints, vaults, decimals, radius, bands };
}

export async function fetchBook(connection: Connection) {
  const info = await connection.getAccountInfo(poolAddress());
  if (!info) return null;
  return decodeBook(info.data);
}

export function quoteExactIn(book: OnchainBook, input: number, output: number, grossIn: bigint): SwapQuote {
  if (input === output) throw new Error("Pay and receive must be different tokens");
  if (grossIn <= 0n) throw new Error("Enter an amount");
  const internalIn = toInternal(grossIn, book.decimals[input]);
  const fee = (internalIn * FEE_BPS) / BPS;
  const net = internalIn - fee;
  if (net <= 0n) throw new Error("Amount is too small");
  const quote = settle(book, input, output, net);
  return {
    amountIn: grossIn,
    amountOut: toNative(quote.amountOut, book.decimals[output]),
    fee: toNative(fee, book.decimals[input]),
  };
}

export function swapTransaction(args: {
  user: PublicKey;
  book: OnchainBook;
  input: number;
  output: number;
  amountIn: bigint;
  minimumOut: bigint;
  deadline: bigint;
}) {
  const data = Buffer.alloc(8 + 1 + 1 + 8 + 8 + 8 + 1);
  data.set(DISC.swap, 0);
  data.writeUInt8(args.input, 8);
  data.writeUInt8(args.output, 9);
  data.writeBigUInt64LE(args.amountIn, 10);
  data.writeBigUInt64LE(args.minimumOut, 18);
  data.writeBigInt64LE(args.deadline, 26);
  data.writeUInt8(1, 34);
  return instruction(data, swapMetas(args.user, args.book, args.input, args.output));
}

export function faucetTransaction(user: PublicKey, book: OnchainBook) {
  const transaction = new Transaction();
  for (let index = 0; index < 4; index += 1) {
    transaction.add(faucetInstruction(user, book, index));
  }
  return transaction;
}

export function claimKusdcTransaction(user: PublicKey, book: OnchainBook) {
  const index = book.mints.findIndex((mint) => mint.toBase58() === publicEnv.mintKusdc);
  if (index < 0) throw new Error("kUSDC is not in this book");
  const transaction = new Transaction();
  transaction.add(faucetInstruction(user, book, index));
  return transaction;
}

export function quoteSolBuy(lamports: bigint, decimals: number) {
  if (lamports <= 0n) return null;
  const native = (lamports * TOKENS_PER_SOL * 10n ** BigInt(decimals)) / LAMPORTS_PER_SOL;
  return native > 0n ? native : null;
}

export function buyWithSolTransaction(user: PublicKey, book: OnchainBook, outputMint: string, lamports: bigint) {
  const index = book.mints.findIndex((mint) => mint.toBase58() === outputMint);
  if (index < 0) throw new Error("That token is not in this book");
  if (!publicEnv.deployer) throw new Error("The SOL treasury is not set");
  const mint = book.mints[index];
  const data = Buffer.alloc(8 + 1 + 8);
  data.set(DISC.buyWithSol, 0);
  data.writeUInt8(index, 8);
  data.writeBigUInt64LE(lamports, 9);
  const keys: AccountMeta[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: poolAddress(), isSigner: false, isWritable: false },
    { pubkey: authorityAddress(), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(publicEnv.deployer), isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: associatedTokenAddress(mint, user), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  const transaction = new Transaction();
  transaction.add(instruction(data, keys));
  return transaction;
}

function faucetInstruction(user: PublicKey, book: OnchainBook, index: number) {
  const data = Buffer.alloc(9);
  data.set(DISC.faucet, 0);
  data.writeUInt8(index, 8);
  return instruction(data, faucetMetas(user, book, index));
}

export function explainProgramError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (!match) return text;
  const code = Number.parseInt(match[1], 16);
  const messages: Record<number, string> = {
    6000: "The book rejected this swap.",
    6001: "This quote expired. Try again.",
    6002: "The price moved past your slippage.",
    6003: "The book is not open yet.",
    6007: "This wallet already claimed the test tokens.",
    6008: "Pay and receive must be different tokens.",
    6009: "The vault no longer covers the book.",
    6010: "This SOL amount buys no tokens.",
    6011: "One buy can spend at most 100 SOL.",
  };
  return messages[code] ?? text;
}

function swapMetas(user: PublicKey, book: OnchainBook, input: number, output: number): AccountMeta[] {
  const authority = authorityAddress();
  return [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: poolAddress(), isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: book.mints[input], isSigner: false, isWritable: false },
    { pubkey: book.mints[output], isSigner: false, isWritable: false },
    { pubkey: book.vaults[input], isSigner: false, isWritable: true },
    { pubkey: book.vaults[output], isSigner: false, isWritable: true },
    { pubkey: associatedTokenAddress(book.mints[input], user), isSigner: false, isWritable: true },
    { pubkey: associatedTokenAddress(book.mints[output], user), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

function faucetMetas(user: PublicKey, book: OnchainBook, index: number): AccountMeta[] {
  return [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: poolAddress(), isSigner: false, isWritable: false },
    { pubkey: authorityAddress(), isSigner: false, isWritable: false },
    { pubkey: book.mints[index], isSigner: false, isWritable: true },
    { pubkey: associatedTokenAddress(book.mints[index], user), isSigner: false, isWritable: true },
    { pubkey: faucetAddress(user), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

function instruction(data: Buffer, keys: AccountMeta[]) {
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

function toInternal(amount: bigint, decimals: number) {
  return amount * 10n ** BigInt(9 - decimals);
}

function toNative(amount: bigint, decimals: number) {
  return amount / 10n ** BigInt(9 - decimals);
}

function settle(book: OnchainBook, input: number, output: number, netIn: bigint) {
  const bands = book.bands.map((band) => ({ ...band, reserves: [...band.reserves] }));
  let radius = book.radius;
  let crossings = 0;
  for (;;) {
    const active = bands.flatMap((band, index) => (band.frozen ? [] : [index]));
    if (active.length === 0) throw new Error("The book has no open liquidity.");
    const aggregate = [0n, 0n, 0n, 0n];
    for (const index of active) {
      for (let asset = 0; asset < 4; asset += 1) aggregate[asset] += bands[index].reserves[asset];
    }
    const next = [...aggregate];
    next[input] += netIn;
    const outReserve = solveReserve(next, radius, output);
    if (outReserve >= aggregate[output]) throw new Error("The book cannot fill this size.");
    const amountOut = aggregate[output] - outReserve;
    next[output] = outReserve;
    const price = cheapestPrice(radius, next);
    const breached = active.filter((index) => bands[index].priceBps > 0 && price < BigInt(bands[index].priceBps));
    if (breached.length === 0) {
      distribute(bands, active, input, next[input] - aggregate[input], true);
      distribute(bands, active, output, aggregate[output] - next[output], false);
      return { amountOut, radius, bands };
    }
    if (crossings + breached.length > MAX_CROSSINGS) {
      throw new Error("This trade would cross more than three bands. Use a smaller size.");
    }
    const oldSum = aggregate.reduce((sum, value) => sum + value, 0n);
    let removed = 0n;
    for (const index of breached) {
      bands[index].frozen = true;
      removed += bands[index].reserves.reduce((sum, value) => sum + value, 0n);
    }
    radius = (radius * (oldSum - removed)) / oldSum;
    crossings += breached.length;
  }
}

function solveReserve(reserves: bigint[], radius: bigint, unknown: number) {
  const radiusSq = radius * radius;
  let used = 0n;
  for (let index = 0; index < reserves.length; index += 1) {
    if (index === unknown) continue;
    const gap = radius - reserves[index];
    if (gap < 0n) throw new Error("The book cannot fill this size.");
    used += gap * gap;
  }
  if (used > radiusSq) throw new Error("The book cannot fill this size.");
  return radius - isqrt(radiusSq - used);
}

function cheapestPrice(radius: bigint, reserves: bigint[]) {
  let minGap = radius;
  let maxGap = 0n;
  for (const reserve of reserves) {
    const gap = radius - reserve;
    if (gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
  }
  if (maxGap === 0n) throw new Error("The book cannot fill this size.");
  return (minGap * BPS) / maxGap;
}

function distribute(
  bands: BookBand[],
  active: number[],
  asset: number,
  delta: bigint,
  add: boolean,
) {
  if (delta === 0n) return;
  const total = active.reduce((sum, index) => sum + bands[index].reserves[asset], 0n);
  let left = delta;
  active.forEach((index, position) => {
    const share = position + 1 === active.length ? left : (delta * bands[index].reserves[asset]) / total;
    bands[index].reserves[asset] += add ? share : -share;
    left -= share;
  });
}

function isqrt(value: bigint) {
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

function readU128(buffer: Buffer, offset: number) {
  const low = buffer.readBigUInt64LE(offset);
  const high = buffer.readBigUInt64LE(offset + 8);
  return low + (high << 64n);
}
