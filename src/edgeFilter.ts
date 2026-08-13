import { config } from "./config.js";
import type { Market, MarketOutcome, Estimate, EdgeSignal } from "./types.js";

/**
 * Converts a raw estimate into a buy/skip signal. This is the layer that
 * keeps the agent from trading on noise: most markets you estimate should
 * come out "skip" here. Only acts when:
 *   1. The two estimator passes agreed (see estimator.ts)
 *   2. Confidence clears a floor
 *   3. |estimate - market price| clears minEdgeThreshold
 */
export function evaluateEdge(
  market: Market,
  outcome: MarketOutcome,
  estimate: Estimate,
  minConfidence = 0.4
): EdgeSignal {
  const edge = estimate.probability - outcome.currentPrice;
  const clearsConfidence = estimate.agreedWithSecondPass && estimate.confidence >= minConfidence;
  const clearsEdge = Math.abs(edge) >= config.strategy.minEdgeThreshold;

  const direction = clearsConfidence && clearsEdge && edge > 0 ? "buy" : "skip";

  return { marketId: market.id, outcomeId: outcome.id, edge, direction, estimate, market };
}
