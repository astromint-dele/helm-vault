// Refreshes lib/data/backed-xlayer-assets.json from Backed Finance's public registry.
// This registry only changes when Backed lists/delists an xStock, so it does not belong on
// the request path (it was costing 9.4s of every cold hit before this). Run this manually
// whenever a new xStock needs to be recognized: `npm run refresh-backed-assets` (from web/)
// or `node scripts/refresh-backed-assets.js` (from repo root).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKED_ASSETS_API = "https://api.backed.fi/api/v2/public/assets";
const OUTPUT_PATH = path.join(__dirname, "..", "lib", "data", "backed-xlayer-assets.json");

async function fetchAllPages() {
  const all = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${BACKED_ASSETS_API}?page=${page}`);
    const data = await res.json();
    all.push(...(data.nodes || []));
    if (!data.page?.hasNextPage) break;
    page += 1;
    if (page > 20) break; // safety cap, matches Phase 0's script
  }
  return all;
}

const raw = await fetchAllPages();

// Flattened to X Layer only, and only the fields lib/navSentinel.js actually consumes -
// matches the shape of the original Phase 0 snapshot (output/backed-xlayer-assets.json) so
// this is a drop-in refresh of that same data, not a new format.
const flattened = raw
  .map((a) => {
    const xlayer = (a.deployments || []).find((d) => d.network === "XLayer");
    if (!xlayer) return null;
    return {
      symbol: a.symbol,
      name: a.name,
      underlying: a.underlyingSymbol,
      halted: Boolean(a.halted),
      xlayerAddress: xlayer.address,
      wrapperAddressV2: xlayer.wrapperAddressV2,
    };
  })
  .filter(Boolean);

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(flattened, null, 2));
console.log(`Wrote ${flattened.length} X Layer xStocks to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
