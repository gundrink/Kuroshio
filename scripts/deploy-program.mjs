import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const PROGRAM_SIZE = 36;
const BUFFER_METADATA = 37;
const MAX_DATA_LEN = 400_000;
const CHUNK = 800;

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/deployer.json", "utf8"))));
const program = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/pool-ninja-program.json", "utf8"))));
const bytecode = fs.readFileSync("target/deploy/kuroshio.so");
const connection = new Connection(RPC, "confirmed");

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(instructions, signers) {
  let wait = 1500;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(...instructions),
        signers,
        { commitment: "confirmed", skipPreflight: true, maxRetries: 8 },
      );
      await sleep(700);
      return signature;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 12) throw error;
      console.log("retry", attempt, message.slice(0, 160));
      await sleep(wait);
      wait = Math.min(wait * 2, 20000);
    }
  }
  throw new Error("send failed");
}

const upgrading = process.env.UPGRADE === "1";
const existing = await connection.getAccountInfo(program.publicKey);
if (existing?.executable && !upgrading) {
  console.log("already deployed", program.publicKey.toBase58());
  process.exit(0);
}

const resumeBuffer = process.env.RESUME_BUFFER;
const buffer = resumeBuffer ? { publicKey: new PublicKey(resumeBuffer) } : Keypair.generate();
let start = Number(process.env.RESUME_OFFSET || 0);
if (!resumeBuffer) {
  const bufferSpace = BUFFER_METADATA + bytecode.length;
  const bufferRent = await connection.getMinimumBalanceForRentExemption(bufferSpace);
  console.log("buffer", buffer.publicKey.toBase58(), "bytes", bytecode.length);
  await send(
    [
      SystemProgram.createAccount({
        fromPubkey: deployer.publicKey,
        newAccountPubkey: buffer.publicKey,
        lamports: bufferRent,
        space: bufferSpace,
        programId: LOADER,
      }),
      new TransactionInstruction({
        programId: LOADER,
        keys: [
          { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
          { pubkey: deployer.publicKey, isSigner: false, isWritable: false },
        ],
        data: u32(0),
      }),
    ],
    [deployer, buffer],
  );
  console.log("buffer ready");
} else {
  console.log("resume", buffer.publicKey.toBase58(), "from", start);
}

for (let offset = start; offset < bytecode.length; offset += CHUNK) {
  const bytes = bytecode.subarray(offset, offset + CHUNK);
  const data = Buffer.concat([u32(1), u32(offset), u64(bytes.length), bytes]);
  await send(
    [
      new TransactionInstruction({
        programId: LOADER,
        keys: [
          { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
          { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
        ],
        data,
      }),
    ],
    [deployer],
  );
  if (offset % (CHUNK * 20) === 0) console.log("wrote", offset + bytes.length, "/", bytecode.length);
}

const [programData] = PublicKey.findProgramAddressSync([program.publicKey.toBuffer()], LOADER);
const programRent = await connection.getMinimumBalanceForRentExemption(PROGRAM_SIZE);
const finish = upgrading
  ? new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: program.publicKey, isSigner: false, isWritable: true },
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: deployer.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
      ],
      data: u32(3),
    })
  : new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: program.publicKey, isSigner: true, isWritable: true },
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.concat([u32(2), u64(MAX_DATA_LEN)]),
    });
const deploySig = await send(
  upgrading
    ? [finish]
    : [
        SystemProgram.createAccount({
          fromPubkey: deployer.publicKey,
          newAccountPubkey: program.publicKey,
          lamports: programRent,
          space: PROGRAM_SIZE,
          programId: LOADER,
        }),
        finish,
      ],
  upgrading ? [deployer] : [deployer, program],
);

const deployed = await connection.getAccountInfo(program.publicKey);
console.log("deployed", program.publicKey.toBase58(), "executable", deployed?.executable, deploySig);
