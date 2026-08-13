export interface Market {
  id: string;
  question: string;
  description?: string;
  outcomes: MarketOutcome[];
  closesAt: string; // ISO timestamp
  liquidity: number;
}

export interface MarketOutcome {
  id: string;
  label: string;
  currentPrice: number; // implied probability, 0-1
}

export interface Estimate {
  marketId: string;
  outcomeId: string;
  probability: number; // model's calibrated probability, 0-1
  confidence: number; // 0-1, model's self-reported confidence
  reasoning: string;
  agreedWithSecondPass: boolean;
}

export interface EdgeSignal {
  marketId: string;
  outcomeId: string;
  edge: number; // estimate.probability - outcome.currentPrice
  direction: "buy" | "skip";
  estimate: Estimate;
  market: Market;
}

export interface SizedTrade {
  marketId: string;
  outcomeId: string;
  sizeInTokens: number;
  edge: number;
  kellyFractionUsed: number;
}

export interface TradeLogEntry {
  timestamp: string;
  marketId: string;
  outcomeId: string;
  question: string;
  estimateProbability: number;
  marketPriceAtTrade: number;
  edge: number;
  sizeInTokens: number;
  reasoning: string;
  txHash?: string;
  status: "placed" | "skipped" | "failed";
  skipReason?: string;
}
