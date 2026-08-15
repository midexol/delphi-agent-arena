import { runOnce } from "./index.js";

const LOOP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function startContinuousLoop() {
  console.log("==================================================");
  console.log("⚡ Starting Delphi Agent Arena 15-Minute Loop ⚡");
  console.log("Interval: Every 15 minutes (24/7 Automated Execution)");
  console.log("==================================================\n");

  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error("[Loop Warning] Execution encountered an error, keeping loop alive:", err);
    }

    console.log(`\nSleeping for 15 minutes... Next run at ${new Date(Date.now() + LOOP_INTERVAL_MS).toLocaleTimeString()}\n`);
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS));
  }
}

startContinuousLoop().catch((err) => {
  console.error("Fatal loop crash:", err);
  process.exit(1);
});
