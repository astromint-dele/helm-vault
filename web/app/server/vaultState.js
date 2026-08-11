// Single place that computes vault state and falls back to the last successful result when
// a fresh computation fails. Used by both /api/state (client-triggered refresh) and page.js
// (the initial server-rendered load), so the fallback behavior and cache are identical for
// both instead of duplicated. This is a display-only cache: /api/approve never imports this
// module and always calls generateRebalanceProposal itself, fresh, which is what the
// fail-closed guarantee actually depends on.
import { loadRootEnv } from "./env.js";
import { isKnownVault, getVaultOwner, LEGACY_VAULT_ADDRESS } from "./vaultRegistry.js";
import { createTimer } from "../../../lib/timing.js";

loadRootEnv();

const DEFAULT_VAULT_ADDRESS = LEGACY_VAULT_ADDRESS;

let lastGood = null; // { key, body }

export function resolveVaultAddress(searchParams) {
  return searchParams.get("vault") || process.env.VAULT_ADDRESS || DEFAULT_VAULT_ADDRESS;
}

export function navThresholdOverrideFrom(searchParams) {
  const demoBlockThreshold = searchParams.get("demoBlockThreshold");
  const demoWarnThreshold = searchParams.get("demoWarnThreshold");
  const navThresholdOverride =
    demoBlockThreshold || demoWarnThreshold
      ? {
          ...(demoBlockThreshold ? { blockThresholdPct: Number(demoBlockThreshold) } : {}),
          ...(demoWarnThreshold ? { warnThresholdPct: Number(demoWarnThreshold) } : {}),
        }
      : undefined;
  return { navThresholdOverride, demoBlockThreshold, demoWarnThreshold };
}

// drift.holdings entries carry a raw BigInt balance (from reliableRpc's balanceOf). Both
// JSON.stringify (the API route) and React's server/client boundary serialization (the SSR
// page) choke on BigInt without this.
export function toPlainJson(data) {
  return JSON.parse(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
}

export async function getVaultState({ vaultAddress, navThresholdOverride, demoBlockThreshold, demoWarnThreshold }) {
  const { generateRebalanceProposal } = await import("../../../lib/rebalanceProposal.js");
  const { getVaultMeta } = await import("../../../lib/driftCalculator.js");
  const { DEFAULT_BLOCK_THRESHOLD_PCT, BACKED_XSTOCK_COUNT } = await import("../../../lib/navSentinel.js");
  const cacheKey = `${vaultAddress}:${demoBlockThreshold || ""}:${demoWarnThreshold || ""}`;
  const isDemoRequest = Boolean(navThresholdOverride);

  // One shared timer across both parallel branches, so the report below reflects the whole
  // request, not just generateRebalanceProposal's half of it - getVaultMeta's RPC calls
  // happen concurrently with drift/NAV/LLM, and a timer only shows that overlap correctly
  // if both branches record into the same one.
  const timer = createTimer();

  // Best-effort, display-only owner resolution, gated behind the same registry check the
  // enforcement path uses, so this never shows an owner for an address /api/approve would
  // actually refuse to trust. Failure here degrades to no displayed owner rather than
  // failing the whole page, this is read-only UX, not the mechanism keeping funds safe.
  const ownerAddressPromise = (async () => {
    try {
      const known = await isKnownVault(vaultAddress, timer);
      if (!known) return null;
      return await getVaultOwner(vaultAddress, timer);
    } catch {
      return null;
    }
  })();

  try {
    const [proposal, meta, ownerAddress] = await Promise.all([
      generateRebalanceProposal(vaultAddress, { navThresholdOverride, timer }),
      getVaultMeta(vaultAddress, { timer }),
      ownerAddressPromise,
    ]);

    // generateRebalanceProposal can itself fall back to templated explanation text (its own
    // self-imposed LLM rate gate, tripped by a concurrent request on a *different* warm
    // serverless instance that this process has no way to coordinate with) even though this
    // computation otherwise succeeded. If the last cached response for this exact key already
    // has a real LLM explanation for what is, numerically, the identical decision, reuse that
    // sentence instead of showing generic template text. Gated on an exact match of action,
    // trade direction, and the already-rounded amount, so this can only ever attach a
    // previously real sentence to an identical decision, never a stale number to today's.
    if (proposal.explanationSource === "fallback" && lastGood?.key === cacheKey) {
      const prior = lastGood.body.proposal;
      const sameDecision =
        prior.explanationSource !== "fallback" &&
        prior.action === proposal.action &&
        (proposal.action !== "rebalance" ||
          (prior.trade?.fromSymbol === proposal.trade?.fromSymbol &&
            prior.trade?.toSymbol === proposal.trade?.toSymbol &&
            prior.trade?.amountHuman === proposal.trade?.amountHuman));
      if (sameDecision) {
        proposal.explanation = prior.explanation;
        proposal.explanationSource = "cache";
      }
    }

    // The displayed "limit" is read from a real check result, not a static constant, since
    // the effective threshold now depends on whether that asset's market is open or closed
    // (see lib/navSentinel.js). Falls back to the default only when nothing in the portfolio
    // has an applicable check (e.g. only cash and xBTC, both "na").
    const checkedNav = Object.values(proposal.navStatus).find(
      (n) => n.status !== "na" && typeof n.blockThresholdPct === "number"
    );
    const navBlockThresholdPct = checkedNav?.blockThresholdPct ?? navThresholdOverride?.blockThresholdPct ?? DEFAULT_BLOCK_THRESHOLD_PCT;

    // Logged plainly (not just returned in the JSON) so it shows up directly in Vercel's
    // function logs on a real cold hit, without needing to parse the response body by hand.
    const timing = timer.report();
    console.log(
      `[timing] totalMs=${timing.totalMs} ` +
        timing.events.map((e) => `${e.label}=${e.durationMs}ms@${e.startMs}ms`).join(" ")
    );

    const body = toPlainJson({
      ok: true,
      vaultAddress,
      ownerAddress,
      agentAddress: meta.agentAddress,
      currentBlock: meta.blockNumber,
      navBlockThresholdPct,
      xstockCount: BACKED_XSTOCK_COUNT,
      isDemo: isDemoRequest,
      generatedAt: new Date().toISOString(),
      stale: false,
      proposal,
    });
    lastGood = { key: cacheKey, body };
    return body;
  } catch (err) {
    console.error("getVaultState failed:", err);
    // Demo requests (recording the refusal state) skip the fallback deliberately: that's a
    // deliberate, attended check, and silently serving an unrelated cached snapshot there
    // would make the demo trigger look broken instead of just failing honestly.
    if (!isDemoRequest && lastGood?.key === cacheKey) {
      return { ...lastGood.body, stale: true };
    }
    return { ok: false, error: err.message };
  }
}
