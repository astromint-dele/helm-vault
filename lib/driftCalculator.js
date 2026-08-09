// Phase 3: reads the vault's actual holdings + policy from chain, gets live prices from
// OKX, and computes how far the current portfolio has drifted from its target allocation.
// Every read that feeds this computation goes through reliableRpc — a rebalance decision
// is exactly the kind of thing that must not be based on a stale/wrong balance.
import { ethers } from "ethers";
import { reliableRead, reliableBalanceOf, reliablePrice } from "./reliableRpc.js";
import { okxGet, toBaseUnits } from "./okxClient.js";

const VAULT_ABI = [
  "function allowedTokenCount() view returns (uint256)",
  "function allowedTokenList(uint256) view returns (address)",
  "function targetAllocationBps(address) view returns (uint256)",
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const USDG_ADDRESS = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
const REFERENCE_RPC = "https://xlayerrpc.okx.com"; // fine for read-only metadata (symbol/decimals never disagree across nodes)

// Short-TTL price cache, checked before reliablePrice's own OKX round trip. This sits above
// reliablePrice, not inside okxGet, deliberately: reliablePrice's own convergence check
// (two live reads that must agree within tolerance) is a real cross-check and would become
// a no-op if a cache sat underneath it and fed both attempts the same cached number. Caching
// here instead means the first read within the TTL window still pays for a real,
// convergence-checked fetch; only repeat computeDrift calls within the window (the page's
// 30s auto-refresh, multiple viewers, or NAV Sentinel reusing this price) get a free hit.
// Set comfortably above the frontend's 30s poll interval so most polls land inside the same
// window instead of missing it by a few seconds and paying full price every single time.
const PRICE_CACHE_TTL_MS = Number(process.env.PRICE_CACHE_TTL_MS || 45_000);
const priceCache = new Map(); // tokenAddress (lowercase) -> { price, expiresAt }

function getCachedPrice(tokenAddress) {
  const entry = priceCache.get(tokenAddress.toLowerCase());
  if (entry && entry.expiresAt > Date.now()) return entry.price;
  return null;
}

function setCachedPrice(tokenAddress, price) {
  priceCache.set(tokenAddress.toLowerCase(), { price, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
}

async function getAllowedTokens(vaultAddress) {
  const provider = new ethers.JsonRpcProvider(REFERENCE_RPC, 196);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
  const count = Number(
    await reliableRead((p) => new ethers.Contract(vaultAddress, VAULT_ABI, p).allowedTokenCount(), {
      label: "allowedTokenCount",
    })
  );

  const tokens = [];
  for (let i = 0; i < count; i++) {
    const address = await reliableRead((p) => new ethers.Contract(vaultAddress, VAULT_ABI, p).allowedTokenList(i), {
      label: `allowedTokenList(${i})`,
    });
    const erc20 = new ethers.Contract(address, ERC20_ABI, provider);
    const [decimals, symbol, targetBps] = await Promise.all([
      erc20.decimals(),
      erc20.symbol(),
      reliableRead((p) => new ethers.Contract(vaultAddress, VAULT_ABI, p).targetAllocationBps(address), {
        label: `targetAllocationBps(${address})`,
      }),
    ]);
    tokens.push({ address, decimals: Number(decimals), symbol, targetBps: Number(targetBps) });
  }
  return tokens;
}

async function getPriceInUSDG(tokenAddress, tokenDecimals) {
  if (tokenAddress.toLowerCase() === USDG_ADDRESS.toLowerCase()) return 1;

  const cached = getCachedPrice(tokenAddress);
  if (cached !== null) return cached;

  const price = await reliablePrice(
    async () => {
      const res = await okxGet("/api/v6/dex/aggregator/quote", {
        chainIndex: "196",
        fromTokenAddress: USDG_ADDRESS,
        toTokenAddress: tokenAddress,
        amount: toBaseUnits(10, 6), // reference $10 quote, small enough not to move price
        slippagePercent: "0.5",
      });
      // A failed OKX call (rate limit, downtime) returns {msg, code} with no `data` at
      // all — accessing q.toToken on that crashes with a confusing property-access error
      // deep in this function instead of a clear one. Surfaced the hard way: hit OKX's
      // rate limit from repeated testing in this session, which turned into an unrelated-
      // looking TypeError three frames away from the actual cause.
      if (res.code !== "0" || !res.data) {
        throw new Error(`OKX quote failed for ${tokenAddress}: ${res.msg || "unknown error"} (code ${res.code})`);
      }
      const q = Array.isArray(res.data) ? res.data[0] : res.data;
      return Number(q.toToken.tokenUnitPrice);
    },
    { label: `price(${tokenAddress})`, tolerancePercent: 1 }
  );
  setCachedPrice(tokenAddress, price);
  return price;
}

/// Returns { totalValueUSDG, holdings: [{ symbol, address, balance, decimals, priceUSDG,
/// valueUSDG, actualPct, targetPct, driftPct }] }, sorted by |driftPct| descending.
export async function computeDrift(vaultAddress) {
  const tokens = await getAllowedTokens(vaultAddress);

  const holdings = await Promise.all(
    tokens.map(async (t) => {
      const balanceRaw = await reliableBalanceOf(t.address, vaultAddress);
      const balance = Number(ethers.formatUnits(balanceRaw, t.decimals));
      const priceUSDG = await getPriceInUSDG(t.address, t.decimals);
      const valueUSDG = balance * priceUSDG;
      return { ...t, balanceRaw, balance, priceUSDG, valueUSDG };
    })
  );

  const totalValueUSDG = holdings.reduce((sum, h) => sum + h.valueUSDG, 0);

  const withPct = holdings.map((h) => {
    const actualPct = totalValueUSDG > 0 ? (h.valueUSDG / totalValueUSDG) * 100 : 0;
    const targetPct = h.targetBps / 100;
    return { ...h, actualPct, targetPct, driftPct: actualPct - targetPct };
  });

  withPct.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));

  return { totalValueUSDG, holdings: withPct };
}
