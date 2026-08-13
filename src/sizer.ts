import { config } from "./config.js";
import type { EdgeSignal, SizedTrade } from "./types.js";

/**
 * Standard Kelly fraction for a binary bet:
 *   f* = (p * b - q) / b
 * where p = probability of winning, q = 1-p, b = net odds received.
 * For a share priced at `price` that pays 1 token if correct, b = (1-price)/price.
 *
 * We never bet full Kelly - a single LLM estimate isn't trustworthy enough
 * for that. maxKellyFraction scales it down hard, and the absolute caps
 * below are the real backstop against a bad estimate blowing up the account.
 */
function kellyFraction(probability: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  const f = (probability * b - (1 - probability)) / b;
  return Math.max(0, f);
}

export function sizeTrade(
  signal: EdgeSignal,
  bankrollTokens: number,
  dailyExposureUsed: number
): SizedTrade | null {
  if (signal.direction !== "buy") return null;

  const marketPrice = signal.market.outcomes.find((o) => o.id === signal.outcomeId)!.currentPrice;
  const rawKelly = kellyFraction(signal.estimate.probability, marketPrice);
  const scaledKelly = rawKelly * config.strategy.maxKellyFraction;

  let sizeInTokens = scaledKelly * bankrollTokens;

  // Hard ceilings win regardless of what Kelly math says.
  sizeInTokens = Math.min(
    sizeInTokens,
    config.strategy.maxExposurePerMarket,
    Math.max(0, config.strategy.maxDailyExposure - dailyExposureUsed)
  );

  if (sizeInTokens < 1) return null; // not worth the gas for a dust-sized trade

  return {
    marketId: signal.marketId,
    outcomeId: signal.outcomeId,
    sizeInTokens: Math.floor(sizeInTokens),
    edge: signal.edge,
    kellyFractionUsed: scaledKelly,
  };
}
