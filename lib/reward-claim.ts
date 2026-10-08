const CLAIM_KEY = "kuroshio.reward.kusdc";

export function hasClaimedReward(storage: Storage, wallet: string) {
  return readClaims(storage).includes(wallet);
}

export function saveClaimedReward(storage: Storage, wallet: string) {
  const claims = new Set(readClaims(storage));
  claims.add(wallet);
  storage.setItem(CLAIM_KEY, JSON.stringify([...claims]));
}

function readClaims(storage: Storage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(CLAIM_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
