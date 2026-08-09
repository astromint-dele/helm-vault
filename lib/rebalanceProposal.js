// Turns drift data into a concrete rebalance proposal. Trade direction and sizing are
// entirely deterministic (computed from on-chain balances/targets, capped by the vault's
// own maxTradeSize policy) — the LLM is only ever asked to phrase an already-decided
// proposal in plain English. If the LLM is unavailable, a templated explanation is used
// instead; the proposal itself (what would actually execute) is identical either way.
import { ethers } from "ethers";
import { computeDrift } from "./driftCalculator.js";
import { reliableRead } from "./reliableRpc.js";
import { generateProposalText } from "./llmClient.js";
import { checkPortfolioNav } from "./navSentinel.js";

const VAULT_ABI = ["function maxTradeSize(address) view returns (uint256)"];
const CORRECTION_FACTOR = 0.5; // correct half the gap per proposal — conservative, avoids overshoot

function fallbackText(proposal) {
  if (proposal.action === "none") {
    return `Portfolio is within the ${proposal.driftThresholdPct}% drift threshold. No rebalance needed.`;
  }
  if (proposal.action === "insufficient_funds") {
    return `Portfolio has drifted from target, but no asset has a spendable balance to rebalance from. The vault needs a deposit before a rebalance can execute.`;
  }
  if (proposal.action === "nav_blocked") {
    return `A rebalance was identified (sell ${proposal.trade.amountHuman.toFixed(6)} ${proposal.trade.fromSymbol} for ${proposal.trade.toSymbol}), but NAV Sentinel blocked it. ${proposal.navBlockReason}`;
  }
  const t = proposal.trade;
  return (
    `${t.fromSymbol} is ${t.fromDriftPct.toFixed(1)} points overweight ` +
    `(${t.fromActualPct.toFixed(1)}% vs ${t.fromTargetPct.toFixed(1)}% target), and ${t.toSymbol} is ` +
    `${Math.abs(t.toDriftPct).toFixed(1)} points underweight (${t.toActualPct.toFixed(1)}% vs ${t.toTargetPct.toFixed(1)}% target). ` +
    `Proposing to sell ${t.amountHuman.toFixed(6)} ${t.fromSymbol} for ${t.toSymbol} to move toward target.`
  );
}

/// Pure function, no I/O: given already-fetched drift data, decides whether to propose a
/// rebalance and how to size it. Factored out from generateRebalanceProposal specifically
/// so this logic can be unit-tested with synthetic inputs, independent of live chain state —
/// the real vault won't always be in a state that exercises every branch.
export function decideRebalanceAction(holdings, totalValueUSDG, maxTradeSizeHuman, { driftThresholdPct = 5 } = {}) {
  const maxAbsDrift = holdings.length ? Math.max(...holdings.map((h) => Math.abs(h.driftPct))) : 0;
  if (maxAbsDrift < driftThresholdPct) {
    return { action: "none", driftThresholdPct };
  }

  const overweight = holdings
    .filter((h) => h.driftPct > driftThresholdPct && h.balance > 0)
    .sort((a, b) => b.driftPct - a.driftPct)[0];
  const underweight = holdings
    .filter((h) => h.driftPct < -driftThresholdPct)
    .sort((a, b) => a.driftPct - b.driftPct)[0];

  if (!overweight || !underweight) {
    return { action: "insufficient_funds", driftThresholdPct };
  }

  const excessValueUSDG = (overweight.driftPct / 100) * totalValueUSDG;
  const deficitValueUSDG = (Math.abs(underweight.driftPct) / 100) * totalValueUSDG;
  const targetMoveValueUSDG = Math.min(excessValueUSDG, deficitValueUSDG) * CORRECTION_FACTOR;

  const amountHuman = Math.min(targetMoveValueUSDG / overweight.priceUSDG, overweight.balance, maxTradeSizeHuman);

  return {
    action: "rebalance",
    driftThresholdPct,
    trade: {
      fromSymbol: overweight.symbol,
      fromAddress: overweight.address,
      fromDecimals: overweight.decimals,
      fromDriftPct: overweight.driftPct,
      fromActualPct: overweight.actualPct,
      fromTargetPct: overweight.targetPct,
      toSymbol: underweight.symbol,
      toAddress: underweight.address,
      toDecimals: underweight.decimals,
      toDriftPct: underweight.driftPct,
      toActualPct: underweight.actualPct,
      toTargetPct: underweight.targetPct,
      amountHuman,
    },
  };
}

export async function generateRebalanceProposal(vaultAddress, { driftThresholdPct = 5, navThresholdOverride } = {}) {
  const drift = await computeDrift(vaultAddress);

  let maxTradeSizeHuman = Infinity;
  const candidateOverweight = drift.holdings
    .filter((h) => h.driftPct > driftThresholdPct && h.balance > 0)
    .sort((a, b) => b.driftPct - a.driftPct)[0];
  if (candidateOverweight) {
    // reliableRead returns a string (it stringifies values to compare across endpoints) —
    // must convert before comparing to 0n, or the "0 means unlimited" case silently fails
    // (confirmed: this exact bug capped a real trade at zero instead of leaving it uncapped).
    const maxTradeSizeRaw = BigInt(
      await reliableRead(
        (p) => new ethers.Contract(vaultAddress, VAULT_ABI, p).maxTradeSize(candidateOverweight.address),
        { label: `maxTradeSize(${candidateOverweight.address})` }
      )
    );
    maxTradeSizeHuman =
      maxTradeSizeRaw === 0n ? Infinity : Number(ethers.formatUnits(maxTradeSizeRaw, candidateOverweight.decimals));
  }

  const decision = decideRebalanceAction(drift.holdings, drift.totalValueUSDG, maxTradeSizeHuman, { driftThresholdPct });
  const proposal = { ...decision, drift };

  // NAV Sentinel: checks every xStock holding against its real-world price, independent of
  // whether a rebalance was even proposed — this is meant to be a standalone status too,
  // not just a trade gate. If the specific trade about to execute involves an xStock whose
  // price has deviated too far from reality, override the decision and refuse to execute,
  // regardless of what the drift math alone would have proposed.
  proposal.navStatus = Object.fromEntries(await checkPortfolioNav(drift.holdings, navThresholdOverride));
  if (proposal.action === "rebalance") {
    const blockedEntry = [
      { symbol: proposal.trade.fromSymbol, nav: proposal.navStatus[proposal.trade.fromAddress] },
      { symbol: proposal.trade.toSymbol, nav: proposal.navStatus[proposal.trade.toAddress] },
    ].find((e) => e.nav?.status === "block");
    if (blockedEntry) {
      // proposal.trade stays populated (what WOULD have executed) for transparency —
      // agent-loop.js only shows the approval prompt for action === "rebalance", so this
      // can't accidentally be executed just because the trade details are still visible.
      proposal.navBlockReason = blockedEntry.nav.reason;
      // First-person, for the refusal screen's headline — deterministic, built directly
      // from the real symbol that actually failed the check, not phrased by the LLM (a
      // refusal is the one moment this product exists to prove, so it doesn't go through
      // anything that could fall back to different wording).
      proposal.navBlockHeadline = `I cannot confirm a fair price for ${blockedEntry.symbol}, so I will not trade.`;
      proposal.action = "nav_blocked";
    }
  }

  // Always include the real holdings/drift numbers, even for non-rebalance actions — an
  // LLM given only a bare action label ("insufficient_funds", trade: null) has nothing
  // concrete to ground its explanation in and will fill the gap with plausible-sounding
  // but false claims (confirmed: it once said the portfolio was "balanced within target
  // range" when it was actually -20%/-15% drifted with zero funds to fix it).
  // Round every number handed to the LLM to display precision before it ever reaches the
  // prompt — the LLM only ever repeats numbers it's given, so an unrounded value here (e.g.
  // an 18-decimal token balance straight out of ethers.formatUnits) shows up verbatim in
  // prose otherwise. Rounding downstream, after the LLM has already phrased it, would be too
  // late.
  // Rounding here does double duty: it's also what lets llmClient's cache actually hit.
  // Two calls a few seconds apart, computing the same real-world proposal off a price that
  // ticked by a fraction of a cent, previously produced *different* unrounded floats in this
  // object — a different cache key every time, so the client's own cache almost never hit in
  // practice and this fell through to the rate gate far more often than it looked like it
  // should. Rounded to the same precision the UI displays, two calls describing the same
  // real proposal now produce byte-identical input, so the cache does what it's for.
  const llmInput = {
    action: proposal.action,
    trade: proposal.trade
      ? {
          ...proposal.trade,
          amountHuman: Number(proposal.trade.amountHuman.toFixed(6)),
          fromDriftPct: Number(proposal.trade.fromDriftPct.toFixed(1)),
          toDriftPct: Number(proposal.trade.toDriftPct.toFixed(1)),
          fromActualPct: Number(proposal.trade.fromActualPct.toFixed(1)),
          toActualPct: Number(proposal.trade.toActualPct.toFixed(1)),
        }
      : null,
    navBlockReason: proposal.navBlockReason ?? null,
    navWarnings: Object.values(proposal.navStatus)
      .filter((n) => n.status === "warn")
      .map((n) => n.reason),
    driftThresholdPct,
    totalValueUSDG: Number(drift.totalValueUSDG.toFixed(2)),
    holdings: drift.holdings.map((h) => ({
      symbol: h.symbol,
      balance: Number(h.balance.toFixed(6)),
      actualPct: Number(h.actualPct.toFixed(2)),
      targetPct: h.targetPct,
      driftPct: Number(h.driftPct.toFixed(2)),
    })),
  };
  const llmResult = await generateProposalText({
    systemPrompt:
      "You are Helm, an AI portfolio desk. Explain the following already-decided rebalance " +
      "decision in 2-3 plain-English sentences for a non-technical user, using ONLY the " +
      "numbers given below — do not state or imply anything about the portfolio's balance, " +
      "value, or holdings that isn't directly supported by this data. If navBlockReason is " +
      "set, explain clearly that the trade was blocked for price-fairness reasons, not " +
      "executed. If navWarnings is non-empty, mention the warning briefly. Do not suggest a " +
      "different trade or amount than what's given — you're explaining a decision that's " +
      "already been made deterministically, not making one. Numbers given below are " +
      "already rounded to sensible display precision — repeat them as given, don't add " +
      "digits. Do not use an em dash, a semicolon, or a colon anywhere in your response. " +
      "Write in sentence case, not title case.",
    userPrompt: JSON.stringify(llmInput, null, 2),
    input: llmInput,
  });

  proposal.explanation = llmResult.text ?? fallbackText(proposal);
  proposal.explanationSource = llmResult.text ? llmResult.source : "fallback";
  if (llmResult.error) proposal.llmError = llmResult.error;

  return proposal;
}
