import fs from "node:fs";
import zlib from "node:zlib";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("GRG9CqaYABVi2Z67CBFbkq9vHC8VJ2CtvCtmqs3woHqE");
// Explorers that call Anchor's fetchIdl read this account, not the program-metadata IDL.
const IDL_IX_TAG = Buffer.from("40f4bc78a7e9690a", "hex");
const CHUNK = 900;

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/deployer.json", "utf8"))));
const connection = new Connection(RPC, "confirmed");

const [base] = PublicKey.findProgramAddressSync([], PROGRAM_ID);
const idlAddress = await PublicKey.createWithSeed(base, "anchor:idl", PROGRAM_ID);
const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(JSON.parse(fs.readFileSync("idl/kuroshio.json", "utf8")))));

function idlInstruction(variant, payload, keys) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.concat([IDL_IX_TAG, Buffer.from([variant]), payload]),
  });
}

const existing = await connection.getAccountInfo(idlAddress);
if (existing) {
  console.log(`IDL account ${idlAddress.toBase58()} already exists. Nothing to do.`);
  process.exit(0);
}

const dataLen = Buffer.alloc(8);
dataLen.writeBigUInt64LE(BigInt(compressed.length));
const create = idlInstruction(0, dataLen, [
  { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
  { pubkey: idlAddress, isSigner: false, isWritable: true },
  { pubkey: base, isSigner: false, isWritable: false },
  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
]);
console.log(`create ${idlAddress.toBase58()}`, await sendAndConfirmTransaction(connection, new Transaction().add(create), [deployer]));

for (let offset = 0; offset < compressed.length; offset += CHUNK) {
  const chunk = compressed.subarray(offset, offset + CHUNK);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(chunk.length);
  const write = idlInstruction(2, Buffer.concat([length, chunk]), [
    { pubkey: idlAddress, isSigner: false, isWritable: true },
    { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
  ]);
  console.log(`write ${offset}`, await sendAndConfirmTransaction(connection, new Transaction().add(write), [deployer]));
}

const account = await connection.getAccountInfo(idlAddress);
const storedLen = account.data.readUInt32LE(40);
const stored = JSON.parse(zlib.inflateSync(account.data.subarray(44, 44 + storedLen)).toString("utf8"));
console.log(`stored ${storedLen} bytes, instructions: ${stored.instructions.map((ix) => ix.name).join(", ")}`);
