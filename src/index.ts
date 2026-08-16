import { scanMarkets, getDelphiClient } from "./scanner.js";
import { estimateOutcome } from "./estimator.js";
import { evaluateEdge } from "./edgeFilter.js";
import { sizeTrade } from "./sizer.js";
import { executeTrade, redeemSettledPositions } from "./executor.js";
import { logDecision } from "./logger.js";
import { createPublicClient, http, parseAbi, formatEther } from "viem";
import type { EdgeSignal } from "./types.js";

const TST_TOKEN_ADDRESS = "0x8A2d75753362Eb5D5669a2c22cbf394b26a0571F";
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

/**
 * Gathers search context from live web results for a market question.
 */
async function gatherSearchContext(question: string): Promise<string> {
  try {
    const cleanQuery = encodeURIComponent(question.replace(/[^a-zA-Z0-9 ]/g, ""));
    const url = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const snippets: string[] = [];
    const matches = html.matchAll(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi);
    for (const match of matches) {
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      if (text) snippets.push(text);
      if (snippets.length >= 5) break;
    }

    if (snippets.length > 0) {
      return snippets.join("\n- ");
    }
  } catch {
    // Silent fallback
  }

  return `(No external news context found for: "${question}")`;
}

/**
 * Pulls actual collateral token balance (TST) and verifies ETH gas balance.
 */
async function getBankroll(): Promise<number> {
  try {
    const client = getDelphiClient();
    const { address } = await client.getSigner();

    const publicClient = createPublicClient({
      transport: http("https://gensyn-testnet.g.alchemy.com/public"),
    });

    // Check ETH gas balance
    const ethBalance = await publicClient.getBalance({ address });
    const ethNum = Number(formatEther(ethBalance));
    if (ethNum < 0.0005) {
      console.warn(`\n⚠️ [GAS WARNING] Wallet ETH gas is very low: ${ethNum.toFixed(4)} ETH. Please top up testnet ETH!\n`);
    } else {
      console.log(`Gas Balance: ${ethNum.toFixed(4)} ETH`);
    }

    // Check TST token balance
    const rawBalance = await publicClient.readContract({
      address: TST_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    const tokenBalance = Number(rawBalance) / 1e6; // 6 decimals for TST
    console.log(`Current wallet bankroll: ${tokenBalance.toFixed(2)} TST`);
    return tokenBalance > 0 ? tokenBalance : 1000;
  } catch (err) {
    console.warn("[Bankroll Warning] Could not query token balance on-chain, using 1000 fallback:", err);
    return 1000;
  }
}

export async function runOnce(): Promise<void> {
  console.log("=== Delphi Agent Arena — High-Precision Pure-Gain Run ===");
  console.log("Time:", new Date().toISOString());

  console.log("\n1. Sweeping & redeeming settled/expired positions...");
  const { redeemed } = await redeemSettledPositions();
  console.log(`Redeemed/Liquidated ${redeemed} position(s).\n`);

  console.log("2. Scanning open competition markets...");
  const markets = await scanMarkets();
  console.log(`Found ${markets.length} market(s) to evaluate.\n`);

  console.log("3. Fetching bankroll, gas, and existing open positions...");
  const bankroll = await getBankroll();
  let dailyExposureUsed = 0;

  const client = getDelphiClient();
  const { address: walletAddr } = await client.getSigner();
  const { positions: openPositions } = await client.listPositions({ wallet: walletAddr, redeemedOrLiquidated: false });

  // Map existing active position market proxy addresses
  const activeMarketProxies = new Set(
    (openPositions || [])
      .filter((p) => BigInt(p.shares || "0") > 0n)
      .map((p) => p.marketProxy.toLowerCase())
  );

  console.log("\n4. Evaluating markets (Strict Single-Outcome Max-Edge Execution)...");
  for (const market of markets) {
    try {
      console.log(`\nEvaluating Market: [${market.id}] "${market.question}"`);

      // Skip if we already hold an active position in this market to avoid duplicate over-exposure
      if (activeMarketProxies.has(market.id.toLowerCase())) {
        console.log(`  [SKIP MARKET] Already hold an active position in market ${market.id}.`);
        continue;
      }

      const signals: { signal: EdgeSignal; outcome: any }[] = [];

      // Step 1: Evaluate all outcomes for this market
      for (const outcome of market.outcomes) {
        const searchContext = await gatherSearchContext(market.question);
        const estimate = await estimateOutcome(market, outcome, searchContext);
        const signal = evaluateEdge(market, outcome, estimate);

        console.log(
          `  Outcome "${outcome.label}" | Mkt P: ${(outcome.currentPrice * 100).toFixed(1)}% | ` +
          `Est P: ${(estimate.probability * 100).toFixed(1)}% | Edge: ${(signal.edge * 100).toFixed(1)}% | ` +
          `Signal: ${signal.direction.toUpperCase()}`
        );

        if (signal.direction === "buy") {
          signals.push({ signal, outcome });
        }
      }

      // Step 2: Pick ONLY the SINGLE BEST outcome with the MAX positive edge
      if (signals.length === 0) continue;

      signals.sort((a, b) => b.signal.edge - a.signal.edge);
      const best = signals[0];

      console.log(`  -> Selected Best Single Outcome: "${best.outcome.label}" with Max Edge: ${(best.signal.edge * 100).toFixed(1)}%`);

      const sized = sizeTrade(best.signal, bankroll, dailyExposureUsed);
      if (!sized) {
        await logDecision({
          timestamp: new Date().toISOString(),
          marketId: market.id,
          outcomeId: best.outcome.id,
          question: market.question,
          estimateProbability: best.signal.estimate.probability,
          marketPriceAtTrade: best.outcome.currentPrice,
          edge: best.signal.edge,
          sizeInTokens: 0,
          reasoning: best.signal.estimate.reasoning,
          status: "skipped",
          skipReason: "sizing came out below minimum (exposure caps reached or edge too thin)",
        });
        continue;
      }

      console.log(`  Executing buy for ${sized.sizeInTokens} TST on best outcome "${best.outcome.label}"...`);
      const result = await executeTrade(sized);
      dailyExposureUsed += sized.sizeInTokens;

      await logDecision({
        timestamp: new Date().toISOString(),
        marketId: market.id,
        outcomeId: best.outcome.id,
        question: market.question,
        estimateProbability: best.signal.estimate.probability,
        marketPriceAtTrade: best.outcome.currentPrice,
        edge: best.signal.edge,
        sizeInTokens: sized.sizeInTokens,
        reasoning: best.signal.estimate.reasoning,
        txHash: result.txHash,
        status: result.skipped ? "skipped" : "placed",
        skipReason: result.reason,
      });

      console.log(
        `  [${result.skipped ? "SKIPPED" : "TRADED"}] ${market.question} -> ${best.outcome.label} | ` +
          `txHash=${result.txHash || "N/A"}`
      );
    } catch (marketErr) {
      console.error(`[Market Error] Skipping market ${market.id} due to unexpected error:`, marketErr);
    }
  }

  console.log("\n=== Run Complete ===");
}

runOnce().catch((err) => {
  console.error("Trade loop failed:", err);
  process.exit(1);
});
