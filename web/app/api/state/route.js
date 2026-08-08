import { loadRootEnv } from "../../server/env.js";

loadRootEnv();

const { generateRebalanceProposal } = await import("../../../../lib/rebalanceProposal.js");

const DEFAULT_VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";

function jsonSafe(data) {
  // drift.holdings entries carry a raw BigInt balance (from reliableRpc's balanceOf) —
  // JSON.stringify throws on BigInt without an explicit replacer, this is that replacer.
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export async function GET(request) {
  const url = new URL(request.url);
  const vaultAddress = url.searchParams.get("vault") || process.env.VAULT_ADDRESS || DEFAULT_VAULT_ADDRESS;

  // Demo trigger for the refusal state (see README): tightening the threshold via query
  // param uses the exact same checkNavDeviation code path as a naturally occurring block,
  // just with a different number — nothing downstream can tell "induced" from "natural,"
  // because there is no such distinction in the data this produces.
  const demoBlockThreshold = url.searchParams.get("demoBlockThreshold");
  const demoWarnThreshold = url.searchParams.get("demoWarnThreshold");
  const navThresholdOverride =
    demoBlockThreshold || demoWarnThreshold
      ? {
          ...(demoBlockThreshold ? { blockThresholdPct: Number(demoBlockThreshold) } : {}),
          ...(demoWarnThreshold ? { warnThresholdPct: Number(demoWarnThreshold) } : {}),
        }
      : undefined;

  try {
    const proposal = await generateRebalanceProposal(vaultAddress, { navThresholdOverride });
    return new Response(jsonSafe({ ok: true, vaultAddress, proposal }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GET /api/state failed:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
