import { loadRootEnv } from "../../server/env.js";
import { OWNER_ADDRESS } from "../../server/owner.js";

loadRootEnv();

const { generateRebalanceProposal } = await import("../../../../lib/rebalanceProposal.js");

const DEFAULT_VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";

function jsonSafe(data) {
  // drift.holdings entries carry a raw BigInt balance (from reliableRpc's balanceOf) —
  // JSON.stringify throws on BigInt without an explicit replacer, this is that replacer.
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

// Serves the last successful result, labeled stale, when a fresh computation fails (e.g. a
// transient OKX outage outlasting okxGet's own retries) — a judge sees slightly-old numbers
// with a visible timestamp instead of a blank error screen. This is a display-only fallback:
// it lives in this route alone and /api/approve never reads it, so it cannot let a stale
// price slip into an actual trade. /api/approve always calls generateRebalanceProposal
// itself, fresh, which is what the fail-closed guarantee actually depends on — that call is
// untouched by anything here. Keyed by vaultAddress + the demo threshold params, so a demo
// override request never silently falls back to a cached non-demo response (or vice versa).
let lastGood = null; // { key, body }

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
  const cacheKey = `${vaultAddress}:${demoBlockThreshold || ""}:${demoWarnThreshold || ""}`;
  const isDemoRequest = Boolean(navThresholdOverride);

  try {
    const proposal = await generateRebalanceProposal(vaultAddress, { navThresholdOverride });
    const body = { ok: true, vaultAddress, ownerAddress: OWNER_ADDRESS, generatedAt: new Date().toISOString(), stale: false, proposal };
    lastGood = { key: cacheKey, body };
    return new Response(jsonSafe(body), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("GET /api/state failed:", err);
    // Demo requests (recording the refusal state) skip the fallback deliberately: that's a
    // deliberate, attended check, and silently serving an unrelated cached snapshot there
    // would make the demo trigger look broken instead of just failing honestly.
    if (!isDemoRequest && lastGood?.key === cacheKey) {
      return new Response(jsonSafe({ ...lastGood.body, stale: true }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
