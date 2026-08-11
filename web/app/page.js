import { Suspense } from "react";
import PanelsSkeleton from "./components/PanelsSkeleton.jsx";
import WalletButton from "./components/WalletButton.jsx";
import WalletError from "./components/WalletError.jsx";
import CreateVaultPanel from "./components/CreateVaultPanel.jsx";
import VaultSwitcher from "./components/VaultSwitcher.jsx";
import VaultDataServer from "./VaultDataServer.jsx";
import { WalletProvider } from "./WalletProvider.jsx";
import { resolveVaultAddress } from "./server/vaultState.js";

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

        <VaultSwitcher currentVaultAddress={vaultAddress} />

        <CreateVaultPanel />

        <Suspense fallback={<PanelsSkeleton />}>
          <VaultDataServer searchParams={sp} />
        </Suspense>

        <p className="footnote">
          Helm refuses to trade whenever the onchain price drifts too far from the real one.
          <span className="footnote-vault mono">vault {truncate(vaultAddress)}</span>
        </p>
      </div>
    </WalletProvider>
  );
}
