import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { Market, MarketOutcome, Estimate } from "./types.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const ESTIMATE_SYSTEM_PROMPT = `You are a calibrated forecaster estimating the probability of real-world events.

Rules:
- Output ONLY valid JSON, no preamble, no markdown fences.
- Your probability must reflect genuine uncertainty. Do not default to round numbers
  (50%, 70%) out of habit - use precise values like 0.34 or 0.62 when that's what the
  evidence supports.
- If you don't have enough current information to estimate confidently, say so via a
  low confidence score rather than guessing and reporting high confidence.
- Confidence reflects how much you trust YOUR OWN estimate, not how likely the event is.

Respond with exactly this JSON shape:
{"probability": number (0-1), "confidence": number (0-1), "reasoning": string (2-4 sentences)}`;

function buildUserPrompt(market: Market, outcome: MarketOutcome, searchContext: string): string {
  return `Market question: ${market.question}
${market.description ? `Context: ${market.description}\n` : ""}
Outcome being estimated: "${outcome.label}"
Market closes at: ${market.closesAt}
Current market-implied probability for this outcome: ${(outcome.currentPrice * 100).toFixed(1)}%

Recent relevant information gathered via search:
${searchContext || "(no search results available)"}

Estimate the true probability that this outcome occurs, independent of what the market currently thinks.`;
}

async function runEstimatePass(
  market: Market,
  outcome: MarketOutcome,
  searchContext: string
): Promise<{ probability: number; confidence: number; reasoning: string }> {
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 500,
    system: ESTIMATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(market, outcome, searchContext) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from estimator");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Produces a calibrated probability estimate for a single market outcome.
 * Runs two independent passes and only trusts the result if they roughly
 * agree - large disagreement between passes means the question is outside
 * what the model can confidently reason about, and the caller should skip it
 * rather than average the two into a false-confident number.
 */
export async function estimateOutcome(
  market: Market,
  outcome: MarketOutcome,
  searchContext = "",
  agreementThreshold = 0.1
): Promise<Estimate> {
  const [pass1, pass2] = await Promise.all([
    runEstimatePass(market, outcome, searchContext),
    runEstimatePass(market, outcome, searchContext),
  ]);

  const disagreement = Math.abs(pass1.probability - pass2.probability);
  const agreedWithSecondPass = disagreement <= agreementThreshold;

  // Average the two passes, but confidence collapses to near-zero on disagreement
  // so the edge filter downstream naturally discards it.
  const probability = (pass1.probability + pass2.probability) / 2;
  const confidence = agreedWithSecondPass
    ? Math.min(pass1.confidence, pass2.confidence)
    : 0.05;

  return {
    marketId: market.id,
    outcomeId: outcome.id,
    probability,
    confidence,
    reasoning: agreedWithSecondPass
      ? pass1.reasoning
      : `Passes disagreed (${pass1.probability.toFixed(2)} vs ${pass2.probability.toFixed(2)}) - treating as low-confidence.`,
    agreedWithSecondPass,
  };
}
