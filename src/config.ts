import "dotenv/config";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function numEnv(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? Number(val) : fallback;
}

export const config = {
  delphi: {
    network: requireEnv("DELPHI_NETWORK"),
    signerType: requireEnv("DELPHI_SIGNER_TYPE"),
    walletPrivateKey: requireEnv("WALLET_PRIVATE_KEY"),
    apiAccessKey: requireEnv("DELPHI_API_ACCESS_KEY"),
  },
  strategy: {
    // Minimum |estimate - marketPrice| required to act at all.
    minEdgeThreshold: numEnv("MIN_EDGE_THRESHOLD", 0.08),
    // Caps the fraction of full-Kelly sizing we ever actually bet.
    maxKellyFraction: numEnv("MAX_KELLY_FRACTION", 0.25),
    // Hard ceilings, independent of Kelly math
    maxExposurePerMarket: numEnv("MAX_EXPOSURE_PER_MARKET", 50),
    maxDailyExposure: numEnv("MAX_DAILY_EXPOSURE", 200),
  },
};
