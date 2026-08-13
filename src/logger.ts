import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TradeLogEntry } from "./types.js";

const LOG_PATH = "logs/trades.jsonl";

/**
 * Appends one entry per decision, traded or skipped. Skipped entries matter
 * as much as traded ones - when P&L looks off mid-competition, this log is
 * what tells you whether the estimator or the sizing was the problem.
 */
export async function logDecision(entry: TradeLogEntry): Promise<void> {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}
