// Phase 3 design requirement, not an optimization: any on-chain read that drives an
// autonomous decision (balance, allowance) must be cross-checked across independent RPC
// endpoints before the agent acts on it. Discovered the hard way in Phase 1/2 — the same
// X Layer RPC hostname gave stale/wrong reads three separate times in one session (a
// balance read showing 0 right after a confirmed transfer, a gas estimate off by ~1000x,
// both resolved by a simple retry). An agent acting on a stale balance is a real failure
// mode for this product, not a hypothetical one.
//
// Two independent policies, because the two kinds of reads have different failure shapes:
//  - Balance/allowance reads are deterministic on-chain state. Two honest, near-simultaneous
//    reads of the same chain should always agree exactly. If they don't, that's a bad read,
//    not real state — retry, and hard-fail (throw) rather than silently act on it.
//  - Price reads (OKX quotes) are inherently live and legitimately move between calls. Two
//    reads that differ slightly aren't necessarily wrong. Retry toward convergence within a
//    tolerance, but don't hard-fail — fall back to the latest reading with a loud warning.
import { ethers } from "ethers";

const CHAIN_ID = 196;
export const RPC_ENDPOINTS = ["https://xlayerrpc.okx.com", "https://rpc.xlayer.tech"];

function providers() {
  return RPC_ENDPOINTS.map((url) => new ethers.JsonRpcProvider(url, CHAIN_ID));
}

/// Calls readFn(provider) against every configured endpoint and requires all results to
/// match exactly (as strings). Retries with backoff on mismatch/error; throws if the
/// endpoints never converge — callers must treat that as "don't act," not "guess."
export async function reliableRead(readFn, { maxAttempts = 3, label = "read" } = {}) {
  const eps = providers();
  let lastResults = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const results = await Promise.all(
      eps.map((p) =>
        readFn(p)
          .then((v) => ({ ok: true, value: String(v) }))
          .catch((e) => ({ ok: false, error: e.message }))
      )
    );
    lastResults = results;

    const allOk = results.every((r) => r.ok);
    const allAgree = allOk && new Set(results.map((r) => r.value)).size === 1;
    if (allAgree) {
      return results[0].value;
    }

    console.warn(
      `[reliableRpc] ${label}: attempt ${attempt}/${maxAttempts} did not converge — ${JSON.stringify(
        results
      )}`
    );
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  throw new Error(
    `[reliableRpc] ${label}: RPC endpoints did not agree after ${maxAttempts} attempts (${JSON.stringify(
      lastResults
    )}). Refusing to act on unreliable data.`
  );
}

export async function reliableBalanceOf(tokenAddress, holderAddress) {
  const abi = ["function balanceOf(address) view returns (uint256)"];
  const raw = await reliableRead(
    async (provider) => {
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      return contract.balanceOf(holderAddress);
    },
    { label: `balanceOf(token=${tokenAddress}, holder=${holderAddress})` }
  );
  return BigInt(raw);
}

export async function reliableNativeBalance(address) {
  const raw = await reliableRead((provider) => provider.getBalance(address), {
    label: `nativeBalance(${address})`,
  });
  return BigInt(raw);
}

export async function reliableAllowance(tokenAddress, ownerAddress, spenderAddress) {
  const abi = ["function allowance(address,address) view returns (uint256)"];
  const raw = await reliableRead(
    async (provider) => {
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      return contract.allowance(ownerAddress, spenderAddress);
    },
    { label: `allowance(token=${tokenAddress}, owner=${ownerAddress}, spender=${spenderAddress})` }
  );
  return BigInt(raw);
}

/// For live prices (not on-chain state): retries toward convergence within tolerance,
/// but falls back to the latest reading with a warning rather than hard-failing, since
/// genuine price movement between calls is expected, not a sign of a bad read.
///
/// Also retries on a thrown error (e.g. OKX rate limiting under heavy use, confirmed to
/// happen for real during testing) with backoff, rather than propagating the first
/// transient failure immediately — only throws once every attempt has failed.
export async function reliablePrice(fetchPriceFn, { maxAttempts = 3, tolerancePercent = 1, label = "price" } = {}) {
  let prev = null;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let value;
    try {
      value = await fetchPriceFn();
    } catch (err) {
      lastError = err;
      console.warn(`[reliableRpc] ${label}: attempt ${attempt}/${maxAttempts} failed (${err.message}), retrying...`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw new Error(`[reliableRpc] ${label}: failed after ${maxAttempts} attempts: ${lastError.message}`);
    }
    if (prev !== null) {
      const diff = (Math.abs(value - prev) / prev) * 100;
      if (diff <= tolerancePercent) {
        return value;
      }
      console.warn(
        `[reliableRpc] ${label}: price diverged ${diff.toFixed(2)}% between attempt ${attempt - 1} and ${attempt} (tolerance ${tolerancePercent}%), retrying...`
      );
    }
    prev = value;
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  console.warn(`[reliableRpc] ${label}: did not converge within tolerance after ${maxAttempts} attempts, using latest reading (${prev})`);
  return prev;
}
