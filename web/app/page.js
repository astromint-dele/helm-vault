import { Suspense } from "react";
import PanelsSkeleton from "./components/PanelsSkeleton.jsx";
import WalletButton from "./components/WalletButton.jsx";
import WalletError from "./components/WalletError.jsx";
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
            This page shows one vault on X Layer mainnet, owned and operated by Helm&apos;s builder, not your
            personal wallet. Connecting only checks whether you&apos;re that vault&apos;s owner, to enable
            approving trades.
          </p>
          <p className="disclosure-line">
            Funds live inside this vault contract because Helm&apos;s rules, like allocation limits and price
            checks, can only be enforced on funds the contract actually holds. Multi user vaults and retail
            usage are both coming soon.
          </p>
        </div>

        <Suspense fallback={<PanelsSkeleton />}>
          <VaultDataServer searchParams={sp} />
        </Suspense>

        <p className="footnote">
          Helm never executes without a confirmed fair price.
          <span className="footnote-vault mono">vault {truncate(vaultAddress)}</span>
        </p>
      </div>
    </WalletProvider>
  );
}
