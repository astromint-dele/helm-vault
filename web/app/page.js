import { Suspense } from "react";
import HelmWheel from "./components/HelmWheel.jsx";
import PanelsSkeleton from "./components/PanelsSkeleton.jsx";
import VaultDataServer from "./VaultDataServer.jsx";

// The topbar and disclosure lines are plain server-rendered markup with no data dependency
// (no "use client" needed here at all) — they render in the very first flush of HTML. The
// slow part (real OKX/Gemini work, 4-9s observed) is isolated behind the Suspense boundary
// below, so it can't hold up the shell or the brand identity anymore.
export default async function Page({ searchParams }) {
  const sp = await searchParams;

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <HelmWheel size={22} drift />
          <span className="brand-name">Helm</span>
        </div>
        <div className="topbar-right">
          <div className="chain-chip">
            <span className="chain-dot" />
            X Layer
          </div>
        </div>
      </div>

      <p className="disclosure-line">
        This page shows one vault on X Layer mainnet, owned and operated by Helm&apos;s builder, not your personal
        wallet. Connecting only checks whether you&apos;re that vault&apos;s owner, to enable approving trades.
      </p>
      <p className="disclosure-line">
        Funds live inside this vault contract because Helm&apos;s rules, like allocation limits and price checks,
        can only be enforced on funds the contract actually holds.
      </p>

      <Suspense fallback={<PanelsSkeleton />}>
        <VaultDataServer searchParams={sp} />
      </Suspense>

      <p className="footnote">
        Reads and writes go directly through the existing drift, NAV Sentinel, and execution modules. Nothing here
        duplicates that logic.
      </p>
    </div>
  );
}
