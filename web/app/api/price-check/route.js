import { loadRootEnv } from "../../server/env.js";
import { createOkxClient } from "../../../../lib/okxClient.js";

loadRootEnv();

const USDG_ADDRESS = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";

// Deliberately separate from OKX_API_KEY etc (the vault's own credentials): this endpoint
// is fully public and unauthenticated, so its call volume is not bounded by how many people
// visit the vault page. A shared client would mean a burst of public traffic could exhaust
// the same rate budget the vault's own drift/NAV checks depend on. createOkxClient gives
// this its own pacing gate as well as its own credentials, so isolation holds even within
// one warm serverless instance, not just on OKX's side. See lib/okxClient.js.
const publicOkxClient = createOkxClient(
  {
    apiKey: process.env.OKX_PUBLIC_API_KEY,
    secretKey: process.env.OKX_PUBLIC_SECRET_KEY,
    passphrase: process.env.OKX_PUBLIC_API_PASSPHRASE,
    projectId: process.env.OKX_PUBLIC_PROJECT_ID,
  },
  { label: "public-price-check" }
);

function isConfigured() {
  return Boolean(
    process.env.OKX_PUBLIC_API_KEY &&
      process.env.OKX_PUBLIC_SECRET_KEY &&
      process.env.OKX_PUBLIC_API_PASSPHRASE &&
      process.env.OKX_PUBLIC_PROJECT_ID
  );
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// GET /api/price-check?symbol=NVDAx  or  ?address=0x...
// Public, read-only, no wallet, no deposit. Returns the same real check NAV Sentinel runs
// on the vault's own holdings (lib/navSentinel.js's checkNavDeviation, unmodified), for any
// of Backed's xStocks on X Layer, not just the vault's four.
export async function GET(request) {
  // Refuses to run rather than silently falling back to the vault's own credentials — the
  // isolation this endpoint exists for has to be a hard requirement, not a convention that
  // a missing env var could quietly violate.
  if (!isConfigured()) {
    return jsonError(
      503,
      "This endpoint needs its own OKX_PUBLIC_API_KEY, OKX_PUBLIC_SECRET_KEY, OKX_PUBLIC_API_PASSPHRASE, and OKX_PUBLIC_PROJECT_ID, separate from the vault's, and they are not configured yet."
    );
  }

  const url = new URL(request.url);
  const input = url.searchParams.get("symbol") || url.searchParams.get("address");
  if (!input) {
    return jsonError(400, "Pass an xStock symbol (for example NVDAx) or an X Layer token address as ?symbol= or ?address=.");
  }

  try {
    const { resolveXStockAddress, checkNavDeviation } = await import("../../../../lib/navSentinel.js");

    const address = await resolveXStockAddress(input);
    if (!address) {
      return jsonError(404, `Could not find an xStock matching "${input}" on X Layer.`);
    }

    const result = await checkNavDeviation(address, USDG_ADDRESS, {
      symbolHint: input,
      okxGetFn: publicOkxClient.okxGet,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        input,
        address,
        checkedAt: new Date().toISOString(),
        ...result,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("GET /api/price-check failed:", err);
    return jsonError(500, err.message);
  }
}
