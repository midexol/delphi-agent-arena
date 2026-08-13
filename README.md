# Delphi Agent Arena — Trading Agent

A hybrid rules + LLM trading agent for Gensyn's Delphi Agent Arena competition.
Scored purely on P&L, so the design goal is calibration and survival, not
cleverness: skip most markets, only act on real edge, size small enough that
one bad estimate can't wipe the account.

## Pipeline

```
scanner.ts    -> pulls open markets, filters by liquidity
estimator.ts  -> LLM produces a calibrated probability, dual-pass cross-check
edgeFilter.ts -> only "buy" if edge + confidence clear thresholds; else "skip"
sizer.ts      -> capped fractional-Kelly sizing with hard exposure ceilings
executor.ts   -> quotes, checks slippage, trades, redeems settled positions
logger.ts     -> appends every decision (traded or skipped) to logs/trades.jsonl
index.ts      -> wires the above into one run of the loop
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - Your registered competition wallet's private key
   - Your Delphi testnet API key
   - Your Anthropic API key
3. Verify the SDK calls in `scanner.ts` and `executor.ts` against the actual
   `@gensyn-ai/gensyn-delphi-sdk` v2.1.0 docs
   (https://docs.gensyn.ai/tech/delphi-sdk) — those files are written from
   the competition brief's description of SDK capabilities (market
   discovery, quotes, trade execution, position tracking, redemption), so
   double-check exact method names once the package is installed.
4. `npm run scan` — sanity check that market data pulls correctly, no trading yet.
5. Wire up `gatherSearchContext()` in `index.ts` to real search (web_search
   or a news API) — this is currently a stub and the estimator is only as
   good as the context it gets.
6. `npm run trade` — runs one full pass: scan → estimate → filter → size → execute → log.

## Tuning

All strategy thresholds live in `.env` (and are read in `src/config.ts`):

- `MIN_EDGE_THRESHOLD` — minimum |estimate − market price| to act at all.
  Higher = fewer, higher-conviction trades.
- `MAX_KELLY_FRACTION` — how much of full-Kelly sizing to actually use.
  Keep this low (0.1–0.25) early on until you trust the estimator's calibration.
- `MAX_EXPOSURE_PER_MARKET` / `MAX_DAILY_EXPOSURE` — hard ceilings, independent
  of Kelly math. These are what actually protect you from a bad estimate.

## What's still a stub

- `gatherSearchContext()` in `index.ts` — needs real search wired in.
- `getBankroll()` in `index.ts` — needs to pull actual token balance from the SDK.
- SDK method names in `scanner.ts` / `executor.ts` — confirm against real docs.

## Running on a loop

The competition allows trading "as frequently or infrequently as your
strategy requires." A cron job or simple `setInterval` calling `runOnce()`
every few hours is enough — there's no advantage to hammering it constantly,
and doing so just burns gas and gives the estimator more chances to be
overconfident.
