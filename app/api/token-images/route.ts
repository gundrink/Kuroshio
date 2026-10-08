import { Connection, PublicKey } from "@solana/web3.js";
import { bookTokens, publicEnv } from "@/lib/env";
import { fetchSolImage, fetchTokenImage } from "@/lib/kuroshio";

export async function GET() {
  const connection = new Connection(publicEnv.rpcUrl, "confirmed");
  const entries = await Promise.all(
    bookTokens.map(async (token) => {
      if (!token.mint) return [token.symbol, null] as const;
      try {
        const image = await fetchTokenImage(connection, new PublicKey(token.mint));
        return [token.symbol, image] as const;
      } catch {
        return [token.symbol, null] as const;
      }
    }),
  );
  let sol: string | null = null;
  try {
    sol = await fetchSolImage(connection);
  } catch {
    sol = null;
  }
  return Response.json(
    { images: { ...Object.fromEntries(entries), SOL: sol } },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
