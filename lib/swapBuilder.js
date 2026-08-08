// Builds an executable swap transaction via OKX's DEX Aggregator "swap" endpoint
// (distinct from "quote" — quote is estimate-only, swap returns real tx.to/tx.data),
// plus the separate "approve-transaction" endpoint for the correct allowance target.
//
// Critical detail #1: the contract you approve (approveTarget) and the contract you call
// to execute the swap (swapTarget) are DIFFERENT addresses on OKX's aggregator. Approving
// swapTarget directly looks reasonable and compiles fine, but silently fails every trade —
// found this only by testing a real mainnet trade and tracing the revert by hand.
//
// Critical detail #2: OKX encodes the recipient wallet into the returned calldata via
// userWalletAddress. Since PolicyVault (not the agent's own EOA) holds the funds and
// must receive the swap's output, userWalletAddress must always be the VAULT's address,
// not the agent's address — otherwise swap proceeds would land in the agent's wallet
// instead of the vault, silently breaking the whole policy-enforcement model.
import { okxGet } from "./okxClient.js";

const CHAIN_INDEX = "196"; // X Layer mainnet — OKX's aggregator only indexes mainnet liquidity.

export async function buildSwapTx({ vaultAddress, fromTokenAddress, toTokenAddress, amount, slippagePercent = "0.5" }) {
  const res = await okxGet("/api/v6/dex/aggregator/swap", {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress,
    toTokenAddress,
    amount,
    slippagePercent,
    userWalletAddress: vaultAddress,
  });

  const entry = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!entry?.tx) {
    throw new Error("OKX swap response missing tx data: " + JSON.stringify(res));
  }

  // OKX uses a separate allowance-holding contract from the one that executes the swap
  // (tx.to). Approving tx.to directly silently fails the trade — confirmed the hard way.
  // The correct address to approve comes from a distinct endpoint.
  const approveRes = await okxGet("/api/v6/dex/aggregator/approve-transaction", {
    chainIndex: CHAIN_INDEX,
    tokenContractAddress: fromTokenAddress,
    approveAmount: amount,
  });
  const approveEntry = Array.isArray(approveRes.data) ? approveRes.data[0] : approveRes.data;
  if (!approveEntry?.dexContractAddress) {
    throw new Error("OKX approve-transaction response missing dexContractAddress: " + JSON.stringify(approveRes));
  }

  // Recipient guard: don't trust that the request was built correctly — check OKX's
  // response, not our own request, for evidence it really was built for vaultAddress.
  // Checked independently of how the request above was constructed, so it still catches
  // a future edit that accidentally passes the wrong address into userWalletAddress (e.g.
  // the agent's own address instead of the vault's).
  //
  // Two independent signals, either is sufficient:
  //  1. entry.tx.data contains vaultAddress as a raw hex substring — true for routes where
  //     the recipient is an explicit parameter (e.g. Uniswap V3 exactInput's `recipient`).
  //  2. entry.tx.from equals vaultAddress — OKX's own server-returned field stating which
  //     wallet this transaction was built for. True for routes that default to paying out
  //     to msg.sender rather than taking an explicit recipient param (confirmed empirically:
  //     requesting a swap with the wrong address as userWalletAddress comes back with that
  //     same wrong address in tx.from, so this field is a real, independent signal, not an
  //     echo of something we assert ourselves).
  // If NEITHER holds, we abort before returning anything a caller could broadcast.
  const vaultAddressHex = vaultAddress.slice(2).toLowerCase();
  const calldataContainsVault = entry.tx.data.toLowerCase().includes(vaultAddressHex);
  const txFromIsVault = (entry.tx.from || "").toLowerCase() === vaultAddress.toLowerCase();
  if (!calldataContainsVault && !txFromIsVault) {
    throw new Error(
      `Recipient guard failed: neither swap calldata nor tx.from confirm vaultAddress (${vaultAddress}) as recipient. ` +
        "Refusing to return this swap — broadcasting it could send funds to the wrong address."
    );
  }

  return {
    swapTarget: entry.tx.to,
    swapCalldata: entry.tx.data,
    approveTarget: approveEntry.dexContractAddress,
    minReceiveAmount: entry.tx.minReceiveAmount,
    estimatedToAmount: entry.routerResult?.toTokenAmount,
    priceImpactPercent: entry.routerResult?.priceImpactPercent,
    raw: entry,
  };
}
