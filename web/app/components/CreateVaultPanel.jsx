"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider } from "ethers";
import { useWalletContext } from "../WalletProvider.jsx";
import { PRESETS, getVaultsForOwner } from "../lib/vaultFactory.js";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// A real, full page navigation, not next/navigation's client router. That was tried first
// and diagnosed as unreliable on this Next.js version specifically for a searchParams-only
// change behind this page's Suspense boundary: the RSC fetch genuinely fired (confirmed via
// a real browser's network log) and the server genuinely returned the right vault's data
// (confirmed by inspecting the raw RSC payload directly), but the client never applied it,
// the address bar and rendered content both stayed on the old vault. A full navigation is
// the one path independently verified, repeatedly, end to end. useWallet's silent
// eth_accounts restore on mount is what keeps this from costing a manual reconnect click.
// The suggested alternative below (useRouter().push()) is the exact mechanism proven broken above.
function goToVault(address) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `?vault=${address}`;
}

// A plain read-only RPC connection, not the wallet's own injected provider - this lookup
// runs the moment a wallet connects, and reading it the same way every other chain read in
// this app happens (a known-good RPC, not whatever the extension provides) keeps it
// consistent rather than introducing a second, less predictable read path.
const READ_PROVIDER = new JsonRpcProvider("https://xlayerrpc.okx.com", 196);

// The one place in this app that sends a real on-chain transaction from a connected
// wallet rather than an off-chain signature or a server-side call. Deliberately in the
// instant shell (see page.js), not behind the Suspense boundary, since creating a vault
// has no dependency on which vault (if any) is currently being viewed.
export default function CreateVaultPanel() {
  const wallet = useWalletContext();
  const [selected, setSelected] = useState(1); // Balanced, a reasonable default
  const [result, setResult] = useState(null); // { vaultAddress, txHash }
  const [error, setError] = useState(null);
  const [ownedVaults, setOwnedVaults] = useState(null); // null = not checked yet, [] = checked, none found
  // Derived, not its own state: still null while the lookup is in flight, so "checking"
  // is just "connected, and we don't have an answer yet" rather than a duplicated flag
  // that could drift out of sync with ownedVaults itself.
  const lookingUpVaults = Boolean(wallet.address) && ownedVaults === null;

  // Reconstructed straight from the factory's own registry every time a wallet connects,
  // not from anything stored in the browser - this is what answers "I closed the tab, can
  // I find my vault again" without needing to remember a URL. Several sequential real RPC
  // reads (a count, then one per vault), so this genuinely takes a few seconds, hence the
  // explicit loading state above rather than a silent gap that looks like nothing is
  // happening.
  useEffect(() => {
    if (!wallet.address) return; // stale data from a prior connection is harmless, the render below is gated on wallet.address too
    let cancelled = false;
    getVaultsForOwner(wallet.address, READ_PROVIDER)
      .then((vaults) => {
        if (!cancelled) setOwnedVaults(vaults);
      })
      .catch(() => {
        if (!cancelled) setOwnedVaults([]); // fail quiet here, this is a convenience lookup, not an enforcement path
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  async function handleCreate() {
    setError(null);
    setResult(null);
    if (!wallet.address) {
      await wallet.connect();
      return; // let them press Create again once connected, rather than chaining a second wallet prompt automatically
    }
    try {
      const outcome = await wallet.createVault(selected);
      setResult(outcome);
    } catch (err) {
      setError(err.message || "Could not create the vault.");
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Create your own vault</p>
      </div>

      <p className="disclosure-line" style={{ marginBottom: 16 }}>
        Deploys a new vault you own, with the same token allowlist as the vault above and
        one of three fixed starting policies. Caps and targets are yours to change after
        creation, the same way this vault&apos;s owner can, this just picks a sensible
        starting point instead of a blank form.
      </p>

      {wallet.address && lookingUpVaults && (
        <p className="disclosure-line" style={{ marginBottom: 16 }}>
          Checking the factory for vaults this wallet already owns...
        </p>
      )}

      {wallet.address && !lookingUpVaults && ownedVaults && ownedVaults.length > 0 && (
        <div className="disclosure-box" style={{ marginBottom: 16 }}>
          <p className="disclosure-line">
            This wallet already owns {ownedVaults.length === 1 ? "a vault" : `${ownedVaults.length} vaults`}, found
            directly from the factory&apos;s own record, not anything stored in this browser, so it works from any
            device.
          </p>
          <ul className="owned-vault-list">
            {ownedVaults.map((addr) => (
              <li key={addr}>
                <button type="button" className="link-button mono" onClick={() => goToVault(addr)}>
                  {truncate(addr)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset-card${selected === preset.id ? " preset-card-selected" : ""}`}
            onClick={() => setSelected(preset.id)}
            disabled={wallet.creatingVault}
          >
            <p className="preset-name">{preset.name}</p>
            <ul className="preset-allocations">
              {Object.entries(preset.allocations).map(([symbol, pct]) => (
                <li key={symbol}>
                  <span className="mono">{pct}%</span> {symbol}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <button className="btn-approve" onClick={handleCreate} disabled={wallet.creatingVault || wallet.connecting}>
        {wallet.creatingVault
          ? "Creating vault"
          : wallet.address
            ? `Create ${PRESETS[selected].name} vault`
            : "Connect wallet to create a vault"}
      </button>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="disclosure-box" style={{ marginTop: 16 }}>
          <p className="disclosure-line">
            Vault created at <span className="mono">{truncate(result.vaultAddress)}</span>.
          </p>
          <button
            type="button"
            className="btn-approve"
            style={{ marginTop: 8 }}
            onClick={() => goToVault(result.vaultAddress)}
          >
            View your vault
          </button>
        </div>
      )}
    </div>
  );
}
