import { getVaultState, resolveVaultAddress, navThresholdOverrideFrom } from "../../server/vaultState.js";

export async function GET(request) {
  const url = new URL(request.url);
  const vaultAddress = resolveVaultAddress(url.searchParams);
  // Demo trigger for the refusal state (see README): tightening the threshold via query
  // param uses the exact same checkNavDeviation code path as a naturally occurring block,
  // just with a different number — nothing downstream can tell "induced" from "natural,"
  // because there is no such distinction in the data this produces.
  const { navThresholdOverride, demoBlockThreshold, demoWarnThreshold } = navThresholdOverrideFrom(url.searchParams);

  const body = await getVaultState({ vaultAddress, navThresholdOverride, demoBlockThreshold, demoWarnThreshold });
  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}
