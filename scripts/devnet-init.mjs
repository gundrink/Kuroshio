import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  createMint,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  setAuthority,
} from "@solana/spl-token";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("2Q7mJej5TW3y5Uadf68KPFKV1BnKrDAibQLDZXyZyPox");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/deployer.json", "utf8"))));
const connection = new Connection(RPC, "confirmed");
const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
const [authority] = PublicKey.findProgramAddressSync([Buffer.from("authority")], PROGRAM_ID);

function discriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function compareKeys(left, right) {
  return Buffer.compare(left.toBuffer(), right.toBuffer());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, action) {
  let wait = 2000;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const result = await action();
      await sleep(1500);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retry = /429|Too many requests|blockhash|timed out|Blockhash not found|Node is behind/i.test(message);
      if (!retry || attempt === 8) throw error;
      console.log(label, "retry", attempt);
      await sleep(wait);
      wait = Math.min(wait * 2, 15000);
    }
  }
  throw new Error(`${label} failed`);
}

async function send(instructions, signer = deployer) {
  return withRetry("send", () => {
    const transaction = new Transaction().add(...instructions);
    return sendAndConfirmTransaction(connection, transaction, [signer], { commitment: "confirmed" });
  });
}

async function ensureSol(pubkey, targetSol) {
  let balance = await connection.getBalance(pubkey);
  let tries = 0;
  while (balance < targetSol * 1_000_000_000 && tries < 8) {
    try {
      const signature = await connection.requestAirdrop(pubkey, 1_000_000_000);
      await connection.confirmTransaction(signature, "confirmed");
    } catch (error) {
      console.log("airdrop wait", error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    balance = await connection.getBalance(pubkey);
    tries += 1;
  }
  console.log(`${pubkey.toBase58()} ${balance / 1_000_000_000} SOL`);
  if (balance < 0.2 * 1_000_000_000) throw new Error("Devnet airdrop did not fund the wallet");
}

function initializeIx(mints, vaults) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: discriminator("initialize"),
    keys: [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      ...mints.map((mint) => ({ pubkey: mint, isSigner: false, isWritable: false })),
      ...vaults.map((vault) => ({ pubkey: vault, isSigner: false, isWritable: false })),
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

function seedIx(mints, vaults, index) {
  const data = Buffer.alloc(9);
  discriminator("seed_band").copy(data, 0);
  data.writeUInt8(index, 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data,
    keys: [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      ...mints.map((mint) => ({ pubkey: mint, isSigner: false, isWritable: true })),
      ...vaults.map((vault) => ({ pubkey: vault, isSigner: false, isWritable: true })),
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

function faucetIx(user, mint, index) {
  const data = Buffer.alloc(9);
  discriminator("faucet").copy(data, 0);
  data.writeUInt8(index, 8);
  const [receipt] = PublicKey.findProgramAddressSync([Buffer.from("faucet"), user.toBuffer()], PROGRAM_ID);
  const [tokenAccount] = PublicKey.findProgramAddressSync(
    [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

function swapIx(user, input, output, inputVault, outputVault, amount, inputMint, outputMint) {
  const data = Buffer.alloc(35);
  discriminator("swap").copy(data, 0);
  data.writeUInt8(input, 8);
  data.writeUInt8(output, 9);
  data.writeBigUInt64LE(amount, 10);
  data.writeBigUInt64LE(1n, 18);
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 180), 26);
  data.writeUInt8(1, 34);
  const [inputAccount] = PublicKey.findProgramAddressSync(
    [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), inputMint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [outputAccount] = PublicKey.findProgramAddressSync(
    [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), outputMint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: inputMint, isSigner: false, isWritable: false },
      { pubkey: outputMint, isSigner: false, isWritable: false },
      { pubkey: inputVault, isSigner: false, isWritable: true },
      { pubkey: outputVault, isSigner: false, isWritable: true },
      { pubkey: inputAccount, isSigner: false, isWritable: true },
      { pubkey: outputAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

function writeEnv(name, value) {
  for (const file of [".env.local", ".env.example"]) {
    const text = fs.readFileSync(file, "utf8");
    const next = text.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
    fs.writeFileSync(file, next);
  }
}

const programInfo = await connection.getAccountInfo(PROGRAM_ID);
if (!programInfo) throw new Error("Deploy the program before running this script");

await ensureSol(deployer.publicKey, 2);

const specs = [
  ["kUSDC", 6],
  ["kUSDT", 6],
  ["kDAI", 9],
  ["kFRAX", 9],
];
const symbolsByMint = {
  "7vkrapQkKwh3cmRjm1Xr21cxSZMqiJ2Pri3ia3v6E5Pk": "kFRAX",
  "8BMVR8aJ8Xie5xFxRAr7EXM8fk44AcF8U78cFAJgDjKp": "kUSDC",
  DDTNBEGC5QN6pRN1GJMrG1yDk7Z6YP6P5eAmmdehEGfp: "kDAI",
  HhDcQ5A99d5fkwWX8pAjnVimF2cykenuZu7HZuJ9j7G6: "kUSDT",
};
let created = [];
const existingPool = await connection.getAccountInfo(pool);
const alreadyOpen = existingPool && existingPool.data.length > 320 && existingPool.data[10] > 0;
if (alreadyOpen) {
  const data = existingPool.data;
  console.log("resume seeded", data[10], "trading", data[11]);
  for (let index = 0; index < 4; index += 1) {
    const mint = new PublicKey(data.subarray(44 + index * 32, 76 + index * 32));
    const vault = new PublicKey(data.subarray(172 + index * 32, 204 + index * 32));
    const symbol = symbolsByMint[mint.toBase58()];
    if (!symbol) throw new Error(`Unknown mint on the book: ${mint.toBase58()}`);
    created.push({ symbol, decimals: data[300 + index], mint, vault });
    console.log("book", symbol, mint.toBase58());
  }
} else {
  for (const [symbol, decimals] of specs) {
    const mint = await withRetry(`mint ${symbol}`, () =>
      createMint(connection, deployer, deployer.publicKey, null, decimals),
    );
    created.push({ symbol, decimals, mint });
    console.log("mint", symbol, mint.toBase58());
  }
  created.sort((left, right) => compareKeys(left.mint, right.mint));
  for (const item of created) {
    const vault = await withRetry(`vault ${item.symbol}`, () =>
      getOrCreateAssociatedTokenAccount(connection, deployer, item.mint, authority, true),
    );
    item.vault = vault.address;
    console.log("vault", item.symbol, vault.address.toBase58());
  }
}

const mints = created.map((item) => item.mint);
const vaultAccounts = created.map((item) => item.vault);
if (!alreadyOpen) {
  const initSig = await send([initializeIx(mints, vaultAccounts)]);
  console.log("initialize", initSig);
}
const seeded = alreadyOpen ? existingPool.data[10] : 0;
for (let index = seeded; index < 8; index += 1) {
  const signature = await send([seedIx(mints, vaultAccounts, index)]);
  console.log("seed", index, signature);
}
for (const item of created) {
  const mintInfo = await withRetry(`read ${item.symbol}`, () => getMint(connection, item.mint));
  if (mintInfo.mintAuthority?.equals(authority)) {
    console.log("authority already", item.symbol);
    continue;
  }
  await withRetry(`authority ${item.symbol}`, () =>
    setAuthority(connection, deployer, item.mint, deployer, AuthorityType.MintTokens, authority),
  );
  console.log("authority", item.symbol);
}

const faucetSig = await send(created.map((item, index) => faucetIx(deployer.publicKey, item.mint, index)));
console.log("faucet", faucetSig);

const pay = 10n * 10n ** BigInt(created[0].decimals);
const swapSig = await send([
  swapIx(deployer.publicKey, 0, 1, vaultAccounts[0], vaultAccounts[1], pay, created[0].mint, created[1].mint),
]);
console.log("swap", swapSig);

const inputAccount = await getAccount(
  connection,
  PublicKey.findProgramAddressSync(
    [deployer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), created[0].mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0],
);
const outputAccount = await getAccount(
  connection,
  PublicKey.findProgramAddressSync(
    [deployer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), created[1].mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0],
);
console.log("pay left", inputAccount.amount.toString(), "received", outputAccount.amount.toString());

const deployment = {
  cluster: "devnet",
  programId: PROGRAM_ID.toBase58(),
  pool: pool.toBase58(),
  authority: authority.toBase58(),
  deployer: deployer.publicKey.toBase58(),
  mints: Object.fromEntries(created.map((item) => [item.symbol, item.mint.toBase58()])),
  vaults: Object.fromEntries(created.map((item, index) => [item.symbol, vaultAccounts[index].toBase58()])),
  swap: swapSig,
};
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync("deployments/devnet.json", `${JSON.stringify(deployment, null, 2)}\n`);

const bySymbol = Object.fromEntries(created.map((item) => [item.symbol, item.mint.toBase58()]));
writeEnv("NEXT_PUBLIC_KUROSHIO_PROGRAM_ID", PROGRAM_ID.toBase58());
writeEnv("NEXT_PUBLIC_MINT_KUSDC", bySymbol.kUSDC);
writeEnv("NEXT_PUBLIC_MINT_KUSDT", bySymbol.kUSDT);
writeEnv("NEXT_PUBLIC_MINT_KDAI", bySymbol.kDAI);
writeEnv("NEXT_PUBLIC_MINT_KFRAX", bySymbol.kFRAX);
console.log("wrote deployments/devnet.json");
