"use client";

import { useWalletContext } from "../WalletProvider.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletButton() {
  const wallet = useWalletContext();
  if (wallet.address) {
    return (
      <div className="wallet-connected">
        <button className="wallet-btn mono">{truncate(wallet.address)}</button>
        <button className="wallet-disconnect" onClick={wallet.disconnect}>
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <button className="wallet-btn disconnected" onClick={wallet.connect} disabled={wallet.connecting}>
      {wallet.connecting ? "Connecting" : "Connect owner wallet"}
    </button>
  );
}
