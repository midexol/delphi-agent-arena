import { config } from "./config.js";
import type { Market, MarketOutcome } from "./types.js";

import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

let client: DelphiClient | null = null;

export function getDelphiClient(): DelphiClient {
  if (client) return client;
  client = new DelphiClient({
    network: config.delphi.network as any,
    signerType: config.delphi.signerType as any,
    privateKey: config.delphi.walletPrivateKey as `0x${string}`,
    apiKey: config.delphi.apiAccessKey,
  });
  return client;
}

/**
 * Scans open Delphi competition markets and parses metadata & implied probabilities.
 */
export async function scanMarkets(): Promise<Market[]> {
  const c = getDelphiClient();
  
  // Official SDK REST method to query markets
  const { markets: raw } = await c.listMarkets({ status: "open", limit: 50 });

  const markets: Market[] = [];

  for (const m of raw || []) {
    const meta = m.metadata as {
      question?: string;
      description?: string;
      outcomes?: string[];
    } | null;

    const question = meta?.question || m.appMarketId || m.id;
    const outcomeLabels = meta?.outcomes || ["YES", "NO"];

    const outcomes: MarketOutcome[] = [];

    // Construct outcome list matching indices
    for (let idx = 0; idx < outcomeLabels.length; idx++) {
      let currentPrice = 0.5;
      try {
        // Query quote or spot price if available, defaulting to 0.5 for binary
        const marketAddress = m.id as `0x${string}`;
        const { tokensIn } = await c.quoteBuy({
          marketAddress,
          outcomeIdx: idx,
          sharesOut: 1000000000000000000n, // 1 share (18 dec)
        });
        currentPrice = Number(tokensIn) / 1e6; // cost per 1 share
      } catch {
        currentPrice = 0.5;
      }

      outcomes.push({
        id: idx.toString(),
        label: outcomeLabels[idx],
        currentPrice,
      });
    }

    markets.push({
      id: m.id, // On-chain market proxy address
      question,
      description: meta?.description,
      outcomes,
      closesAt: m.resolvesAt || m.settlesAt || new Date().toISOString(),
      liquidity: 100,
    });
  }

  return markets;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scanMarkets()
    .then((markets) => {
      console.log(`Found ${markets.length} tradeable markets:\n`);
      for (const m of markets) {
        console.log(`- [${m.id}] ${m.question}`);
        for (const o of m.outcomes) {
          console.log(`    ${o.label}: ${(o.currentPrice * 100).toFixed(1)}%`);
        }
      }
    })
    .catch((err) => {
      console.error("Scan failed:", err);
      process.exit(1);
    });
}
