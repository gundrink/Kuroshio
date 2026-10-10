import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKENS = [
  ["nUSDe", "Pool Ninja USDe", "AtKin6p4ecibN42YPBN1gdgBwwU69cWqdWewj7x4tphR", "kfrax"],
  ["nUSDC", "Pool Ninja USDC", "AogEbswqviQNztUJJZziERHt2SbZMEFBqxj7wQfQLyg5", "kusdc"],
  ["nPYUSD", "Pool Ninja PYUSD", "6EVpJryaSzY29qyJQwWQbMt8AbtBSQrZcMkAdHMMbZMn", "kdai"],
  ["nUSDT", "Pool Ninja USDT", "FNEBoyu8SpihwkA5ApDii13MHwK1scKmrGsefXPkC1ru", "kusdt"],
];

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("keys/deployer.json", "utf8"))));
const connection = new Connection(RPC, "confirmed");

function metadataAddress(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

function pushStr(data, value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  data.push(length, bytes);
}

function updateData(name, symbol, uri) {
  const parts = [Buffer.from([15, 1])];
  pushStr(parts, name);
  pushStr(parts, symbol);
  pushStr(parts, uri);
  parts.push(Buffer.alloc(8));
  return Buffer.concat(parts);
}

const imageUrl = "https://raw.githubusercontent.com/gundrink/pool-ninja/main/public/poolninja.png";
console.log("image", imageUrl);

for (const [symbol, name, mintAddress, file] of TOKENS) {
  const json = {
    name,
    symbol,
    description: "Pool Ninja book token on Solana devnet.",
    image: imageUrl,
  };
  fs.writeFileSync(`public/tokens/${file}.json`, `${JSON.stringify(json, null, 2)}\n`);
  const uri = `https://raw.githubusercontent.com/gundrink/pool-ninja/main/public/tokens/${file}.json`;
  const mint = new PublicKey(mintAddress);
  const metadata = metadataAddress(mint);
  const info = await connection.getAccountInfo(metadata);
  if (!info) throw new Error(`${symbol} has no metadata account`);
  const authority = new PublicKey(info.data.subarray(1, 33));
  if (!authority.equals(deployer.publicKey)) {
    throw new Error(`${symbol} update authority is ${authority.toBase58()}`);
  }
  const instruction = new TransactionInstruction({
    programId: METADATA_PROGRAM_ID,
    data: updateData(name, symbol, uri),
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
    ],
  });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [deployer], {
    commitment: "confirmed",
  });
  console.log(symbol, signature, uri);
}
