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
const PROGRAM_ID = new PublicKey("GRG9CqaYABVi2Z67CBFbkq9vHC8VJ2CtvCtmqs3woHqE");
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const MINTS = [
  ["nUSDe", "AtKin6p4ecibN42YPBN1gdgBwwU69cWqdWewj7x4tphR", "https://files.catbox.moe/5wo77b.json"],
  ["nUSDC", "AogEbswqviQNztUJJZziERHt2SbZMEFBqxj7wQfQLyg5", "https://files.catbox.moe/9grs3i.json"],
  ["nPYUSD", "6EVpJryaSzY29qyJQwWQbMt8AbtBSQrZcMkAdHMMbZMn", "https://files.catbox.moe/wm2e92.json"],
  ["nUSDT", "FNEBoyu8SpihwkA5ApDii13MHwK1scKmrGsefXPkC1ru", "https://files.catbox.moe/zni7lw.json"],
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

for (const [symbol, address, uri] of MINTS) {
  const mint = new PublicKey(address);
  const metadata = metadataAddress(mint);
  const existing = await connection.getAccountInfo(metadata);
  if (existing && existing.data.length > 0) {
    console.log(symbol, "already has metadata", metadata.toBase58());
    continue;
  }
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
