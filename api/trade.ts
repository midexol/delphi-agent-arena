import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runOnce } from "../src/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log("=== Vercel 24/7 Cron Trading Trigger ===");
    await runOnce();
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: "Delphi Agent Arena trading run completed successfully.",
    });
  } catch (err: any) {
    console.error("Vercel Cron Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
    });
  }
}
