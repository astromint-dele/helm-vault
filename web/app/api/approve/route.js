import { ethers } from "ethers";
import { loadRootEnv } from "../../server/env.js";
import { OWNER_ADDRESS } from "../../server/owner.js";

loadRootEnv();

const { generateRebalanceProposal } = await import("../../../../lib/rebalanceProposal.js");
const { executeTrade } = await import("../../../../lib/executeTrade.js");

const DEFAULT_VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";
const SIGNATURE_MAX_AGE_MS = 2 * 60 * 1000;

function buildMessage(vaultAddress, timestamp) {
  return `Approve Helm trade for vault ${vaultAddress} at ${timestamp}`;
}

// Real money moves from this route, so the server trusts nothing the client says about
// WHAT to trade — it only trusts a fresh, server-verified signature proving WHO is asking,
// then re-derives the trade itself from a fresh call to the existing proposal logic. A
// tampered or stale trade payload from the client has no path to affecting execution,
// because the client's trade details are never read at all.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }

  const { vaultAddress: requestedVault, signerAddress, signature, timestamp } = body || {};
  const vaultAddress = requestedVault || DEFAULT_VAULT_ADDRESS;

  if (!signerAddress || !signature || !timestamp) {
    return jsonError(400, "Missing signerAddress, signature, or timestamp.");
  }

  if (signerAddress.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) {
    return jsonError(403, "Connected wallet is not authorized to approve trades for this vault.");
  }

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > SIGNATURE_MAX_AGE_MS) {
    return jsonError(403, "Approval signature has expired. Sign again.");
  }

  const message = buildMessage(vaultAddress, timestamp);
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return jsonError(403, "Could not verify the approval signature.");
  }
  if (recovered.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) {
    return jsonError(403, "Approval signature does not match the authorized wallet.");
  }

  // Re-derive the trade fresh, server-side — never trust a trade description from the
  // client. Also naturally covers the case where something changed between the user
  // viewing the proposal and clicking approve (e.g. NAV Sentinel now blocks it).
  let proposal;
  try {
    proposal = await generateRebalanceProposal(vaultAddress);
  } catch (err) {
    return jsonError(500, `Could not recompute the proposal before executing: ${err.message}`);
  }

  if (proposal.action !== "rebalance") {
    return jsonError(409, `No approvable trade right now (current state: ${proposal.action}). Refresh and try again.`);
  }

  try {
    const result = await executeTrade({
      vaultAddress,
      fromTokenAddress: proposal.trade.fromAddress,
      fromDecimals: proposal.trade.fromDecimals,
      toTokenAddress: proposal.trade.toAddress,
      amountHuman: proposal.trade.amountHuman,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        txHash: result.txHash,
        amountIn: result.amountIn?.toString(),
        amountOut: result.amountOut?.toString(),
        trade: proposal.trade,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("POST /api/approve execution failed:", err);
    return jsonError(500, `Execution failed: ${err.message}`);
  }
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
