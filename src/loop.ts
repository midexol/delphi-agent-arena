import { runOnce } from "./index.js";
import http from "node:http";

const LOOP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const PORT = process.env.PORT || 3000;

// Lightweight HTTP Health Check Server so Render/Railway keep-alive pings keep it awake 24/7
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Delphi Agent Arena Trading Bot Active 24/7\n");
}).listen(PORT, () => {
  console.log(`Keep-alive health server listening on port ${PORT}`);
});

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
