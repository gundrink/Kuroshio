import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("2Q7mJej5TW3y5Uadf68KPFKV1BnKrDAibQLDZXyZyPox");
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const MINTS = [
  ["kFRAX", "7vkrapQkKwh3cmRjm1Xr21cxSZMqiJ2Pri3ia3v6E5Pk"],
  ["kUSDC", "8BMVR8aJ8Xie5xFxRAr7EXM8fk44AcF8U78cFAJgDjKp"],
  ["kDAI", "DDTNBEGC5QN6pRN1GJMrG1yDk7Z6YP6P5eAmmdehEGfp"],
  ["kUSDT", "HhDcQ5A99d5fkwWX8pAjnVimF2cykenuZu7HZuJ9j7G6"],
];

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/deployer.json", "utf8"))));
const connection = new Connection(RPC, "confirmed");
const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
const [authority] = PublicKey.findProgramAddressSync([Buffer.from("authority")], PROGRAM_ID);

function discriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function anchorString(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function metadataAddress(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

function metadataUri() {
  const env = fs.readFileSync(".env.local", "utf8");
  const match = env.match(/^NEXT_PUBLIC_APP_URL=(.*)$/m);
  const url = (match?.[1] ?? "").trim().replace(/\/$/, "");
  if (!url.startsWith("https://")) return "";
  return url;
}

const uriBase = metadataUri();

for (const [symbol, address] of MINTS) {
  const mint = new PublicKey(address);
  const metadata = metadataAddress(mint);
  const existing = await connection.getAccountInfo(metadata);
  if (existing && existing.data.length > 0) {
    console.log(symbol, "already has metadata", metadata.toBase58());
    continue;
  }
  const uri = uriBase ? `${uriBase}/tokens/${symbol.toLowerCase()}.json` : "";
  const data = Buffer.concat([discriminator("attach_metadata"), anchorString(uri)]);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    data,
    keys: [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
  });
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [deployer],
    { commitment: "confirmed" },
  );
  console.log(symbol, signature, metadata.toBase58());
}
