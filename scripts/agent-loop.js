// Phase 3: the agent loop. On each cycle: read the vault's real on-chain state (via
// reliableRpc), compute drift against policy, get a plain-English proposal (LLM prose,
// deterministic decision), and — if it's an actual rebalance — require a typed "yes" at
// the terminal before executing anything. Nothing executes without that approval.
import "dotenv/config";
import readline from "node:readline/promises";
import { generateRebalanceProposal } from "../lib/rebalanceProposal.js";
import { executeTrade } from "../lib/executeTrade.js";

const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";
const INTERVAL_MS = Number(process.env.AGENT_LOOP_INTERVAL_MS || 2 * 60 * 1000);
const DRIFT_THRESHOLD_PCT = Number(process.env.DRIFT_THRESHOLD_PCT || 5);
const MAX_CYCLES = process.env.AGENT_LOOP_MAX_CYCLES ? Number(process.env.AGENT_LOOP_MAX_CYCLES) : Infinity;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function promptApproval(proposal) {
  const answer = await rl.question(
    `\nExecute this trade? Sell ${proposal.trade.amountHuman.toFixed(6)} ${proposal.trade.fromSymbol} for ${proposal.trade.toSymbol}. (yes/no): `
  );
  return answer.trim().toLowerCase() === "yes";
}

async function runCycle(cycleNum) {
  const timestamp = new Date().toISOString();
  console.log(`\n=== Cycle ${cycleNum} — ${timestamp} ===`);

  let proposal;
  try {
    proposal = await generateRebalanceProposal(VAULT_ADDRESS, { driftThresholdPct: DRIFT_THRESHOLD_PCT });
  } catch (err) {
    console.error("Cycle failed (reliable reads did not converge or another error occurred):", err.message);
    console.error("Skipping this cycle rather than acting on uncertain data.");
    return;
  }

  console.log(`Portfolio value: ${proposal.drift.totalValueUSDG.toFixed(4)} USDG-equivalent`);
  console.table(
    proposal.drift.holdings.map((h) => ({
      symbol: h.symbol,
      balance: h.balance,
      actualPct: h.actualPct.toFixed(2) + "%",
      targetPct: h.targetPct.toFixed(2) + "%",
      driftPct: h.driftPct.toFixed(2) + "%",
    }))
  );
  const navEntries = Object.entries(proposal.navStatus);
  if (navEntries.length) {
    console.log("\nNAV Sentinel:");
    for (const [address, nav] of navEntries) {
      const holding = proposal.drift.holdings.find((h) => h.address === address);
      const label = `[${nav.status.toUpperCase()}] ${holding?.symbol ?? address}`;
      console.log(`  ${label} — ${nav.reason}`);
    }
  }

  console.log(`\n[${proposal.explanationSource}] ${proposal.explanation}`);
  if (proposal.llmError) console.log(`(LLM unavailable this cycle: ${proposal.llmError})`);

  if (proposal.action === "nav_blocked") {
    console.log(`Action: nav_blocked — trade identified but not proposed for approval (see NAV Sentinel above).`);
    return;
  }
  if (proposal.action !== "rebalance") {
    console.log(`Action: ${proposal.action} — nothing to approve.`);
    return;
  }

  const approved = await promptApproval(proposal);
  if (!approved) {
    console.log("Not approved. Skipping execution.");
    return;
  }

  console.log("Approved. Executing...");
  try {
    const result = await executeTrade({
      vaultAddress: VAULT_ADDRESS,
      fromTokenAddress: proposal.trade.fromAddress,
      fromDecimals: proposal.trade.fromDecimals,
      toTokenAddress: proposal.trade.toAddress,
      amountHuman: proposal.trade.amountHuman,
    });
    console.log("Executed. tx hash:", result.txHash);
    console.log("amountIn:", result.amountIn?.toString(), "amountOut:", result.amountOut?.toString());
  } catch (err) {
    console.error("Execution failed:", err.message);
  }
}

async function main() {
  console.log(`Agent loop starting. Vault: ${VAULT_ADDRESS}`);
  console.log(`Interval: ${INTERVAL_MS}ms | drift threshold: ${DRIFT_THRESHOLD_PCT}% | max cycles: ${MAX_CYCLES}`);

  let cycle = 0;
  while (cycle < MAX_CYCLES) {
    cycle += 1;
    await runCycle(cycle);
    if (cycle >= MAX_CYCLES) break;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  console.log("\nAgent loop finished (max cycles reached).");
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exitCode = 1;
});
