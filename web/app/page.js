import HomeClient from "./HomeClient.jsx";
import { getVaultState, resolveVaultAddress, navThresholdOverrideFrom } from "./server/vaultState.js";

// Server-rendered on every request (searchParams makes this dynamic automatically): the
// initial HTML already contains real vault data, or an honest error, before any client JS
// runs. A visitor whose client-side fetch later stalls still saw a real page on first paint,
// instead of a "Reading vault state" spinner with nothing behind it.
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((vv) => [k, vv]) : [[k, v]]))
  );
  const vaultAddress = resolveVaultAddress(params);
  const { navThresholdOverride, demoBlockThreshold, demoWarnThreshold } = navThresholdOverrideFrom(params);

  const body = await getVaultState({ vaultAddress, navThresholdOverride, demoBlockThreshold, demoWarnThreshold });

  return <HomeClient initialState={body.ok ? body : null} initialError={body.ok ? null : body.error} />;
}
