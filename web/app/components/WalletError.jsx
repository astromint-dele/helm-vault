"use client";

import { useWalletContext } from "../WalletProvider.jsx";

export default function WalletError() {
  const wallet = useWalletContext();
  if (!wallet.error) return null;
  return <div className="error-banner" style={{ marginTop: 16 }}>{wallet.error}</div>;
}
