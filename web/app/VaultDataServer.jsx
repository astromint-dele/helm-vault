import { getVaultState, resolveVaultAddress, navThresholdOverrideFrom } from "./server/vaultState.js";
import HomeClient from "./HomeClient.jsx";

// This is the slow part (real OKX/Gemini work) that page.js used to await directly before
// sending any HTML at all. Wrapping it in <Suspense> (see page.js) lets Next.js stream the
// shell first and this component's output in once it resolves — same data, same fallback
// behavior (getVaultState, unchanged), just no longer blocking the rest of the page.
export default async function VaultDataServer({ searchParams }) {
  const params = new URLSearchParams(
    Object.entries(searchParams || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((vv) => [k, vv]) : [[k, v]]))
  );
  const vaultAddress = resolveVaultAddress(params);
  const { navThresholdOverride, demoBlockThreshold, demoWarnThreshold } = navThresholdOverrideFrom(params);

  const body = await getVaultState({ vaultAddress, navThresholdOverride, demoBlockThreshold, demoWarnThreshold });

  return <HomeClient initialState={body.ok ? body : null} initialError={body.ok ? null : body.error} />;
}
