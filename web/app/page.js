import { Suspense } from "react";
import PanelsSkeleton from "./components/PanelsSkeleton.jsx";
import WalletButton from "./components/WalletButton.jsx";
import WalletError from "./components/WalletError.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import CreateVaultPanel from "./components/CreateVaultPanel.jsx";
import VaultSwitcher from "./components/VaultSwitcher.jsx";
import PublicPriceCheck from "./components/PublicPriceCheck.jsx";
import ExecutionSavings from "./components/ExecutionSavings.jsx";
import InstructBox from "./components/InstructBox.jsx";
import VaultDataServer from "./VaultDataServer.jsx";
import { WalletProvider } from "./WalletProvider.jsx";
import { resolveVaultAddress } from "./server/vaultState.js";
import { BACKED_XSTOCK_COUNT } from "../../lib/navSentinel.js";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// The topbar, identity block, and disclosure box are plain server-rendered markup with no
// data dependency (vaultAddress is resolved synchronously from the URL, no chain read
// needed for it) — they render in the very first flush of HTML. The slow part (real
// OKX/Gemini work, 4-9s observed) is isolated behind the Suspense boundary below.
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((vv) => [k, vv]) : [[k, v]]))
  );
  const vaultAddress = resolveVaultAddress(params);

  return (
    <WalletProvider>
      <div className="shell">
        <div className="topbar">
          <div className="chain-chip">
            <span className="chain-dot" />X Layer mainnet
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>

        <WalletError />

        <div className="identity-block">
          <h1 className="identity-name">Helm</h1>
          <p className="identity-tagline">An AI agent at the wheel of a tokenized stock vault</p>
          <p className="identity-description">
            Helm holds a target allocation, watches the vault onchain, writes each rebalance in plain English,
            and waits for the owner to approve before anything moves.
          </p>
        </div>

        <div className="disclosure-box">
          <p className="disclosure-line">
            This page opens on the builder&apos;s own vault on X Layer mainnet by default. Anyone can create
            their own vault below, owned by whichever wallet creates it, never by Helm or its builder.
            Connecting checks whether you&apos;re the owner of the vault currently shown, to enable approving
            its trades.
          </p>
          <p className="disclosure-line">
            Funds always stay inside a vault contract its own owner controls, because Helm&apos;s rules, like
            allocation limits and price checks, can only be enforced on funds a contract actually holds. Every
            vault shares the same agent wallet, which can propose trades but never move funds without that
            vault&apos;s owner signing first.
          </p>
        </div>

        <HowItWorks />

        <VaultSwitcher currentVaultAddress={vaultAddress} />

        <Suspense fallback={<PanelsSkeleton />}>
          <VaultDataServer searchParams={sp} />
        </Suspense>

        <CreateVaultPanel />

        <div className="even-grid">
          <ExecutionSavings />
          <div className="panel">
            <PublicPriceCheck xstockCount={BACKED_XSTOCK_COUNT} />
          </div>
        </div>

        <InstructBox />

        <p className="footnote">
          Helm refuses to trade whenever the onchain price drifts too far from the real one.
          <span className="footnote-right">
            <span className="footnote-vault mono">vault {truncate(vaultAddress)}</span>
            <a
              href="https://x.com/helm_vault"
              target="_blank"
              rel="noopener noreferrer"
              className="footnote-x-link"
              aria-label="Helm on X, @helm_vault"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.5-7.2L4.3 22H1.2l8.1-9.3L1 2h7.3l5 6.6L18.9 2Zm-1.2 18h1.9L6.4 3.9H4.4L17.7 20Z" />
              </svg>
            </a>
          </span>
        </p>
      </div>
    </WalletProvider>
  );
}
