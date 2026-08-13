import { getDelphiClient } from "./scanner.js";
import type { SizedTrade } from "./types.js";

const MAX_SLIPPAGE_BPS = 300n; // 300 bps = 3% max slippage cap

/**
 * Quotes the cost of shares on-chain, verifies slippage, approves token spending if needed,
 * and executes buyShares against the Delphi Gateway contract.
 */
export async function executeTrade(trade: SizedTrade): Promise<{ txHash?: string; skipped?: boolean; reason?: string }> {
  const client = getDelphiClient();
  const marketAddress = trade.marketId as `0x${string}`;
  const outcomeIdx = parseInt(trade.outcomeId, 10);

  if (isNaN(outcomeIdx) || trade.sizeInTokens <= 0) {
    return { skipped: true, reason: "Invalid outcome index or token size" };
  }

  // Convert target token trade size to 18-decimal shares representation
  const sharesOut = BigInt(Math.round(trade.sizeInTokens * 1e18));

  try {
    // 1. Quote the collateral tokens cost for sharesOut
    const { tokensIn } = await client.quoteBuy({
      marketAddress,
      outcomeIdx,
      sharesOut,
    });

    // Calculate maximum allowable spend based on slippage tolerance
    const maxTokensIn = (tokensIn * (10000n + MAX_SLIPPAGE_BPS)) / 10000n;

    // 2. Ensure ERC-20 collateral token approval for the market
    await client.ensureTokenApproval({
      marketAddress,
      minimumAmount: maxTokensIn,
    });

    // 3. Execute buyShares on-chain
    const { transactionHash } = await client.buyShares({
      marketAddress,
      outcomeIdx,
      sharesOut,
      maxTokensIn,
    });

    return { txHash: transactionHash };
  } catch (err: any) {
    return { skipped: true, reason: err?.message || String(err) };
  }
}

/**
 * Sweeps settled, expired, and failed positions for the wallet and converts them into realized P&L.
 */
export async function redeemSettledPositions(): Promise<{ redeemed: number }> {
  const client = getDelphiClient();

  try {
    const { address } = await client.getSigner();
    const { positions } = await client.listPositions({
      wallet: address,
      redeemedOrLiquidated: false,
    });

    const settledProxies: `0x${string}`[] = [];
    let count = 0;

    for (const p of positions || []) {
      if (!p.shares || BigInt(p.shares) === 0n) continue;

      try {
        const market = await client.getMarket({ id: p.marketProxy });
        if (market.status === "settled") {
          settledProxies.push(p.marketProxy as `0x${string}`);
        } else if (market.status === "expired" || market.status === "failed") {
          // Liquidate expired/failed market positions
          await client.liquidate({
            marketAddress: p.marketProxy as `0x${string}`,
            outcomeIndices: [0, 1], // binary market default
          });
          count++;
        }
      } catch {
        // Individual market error shouldn't halt sweep
      }
    }

    if (settledProxies.length > 0) {
      const { results } = await client.redeemPositions({
        marketAddresses: settledProxies,
      });
      count += results.filter((r) => r.success).length;
    }

    return { redeemed: count };
  } catch (err) {
    console.error("Redeem & liquidation sweep failed:", err);
    return { redeemed: 0 };
  }
}
