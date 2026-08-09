"use client";

import { createContext, useContext } from "react";
import { useWallet } from "./hooks/useWallet.js";

// A single useWallet() call, shared via context, so the topbar's connect button (part of
// the instant shell) and the deeper ProposalPanel's approve gate (streamed in behind
// Suspense) see the same connection state. Two independent useWallet() calls would hold
// two independent, unsynchronized states, so connecting in the topbar wouldn't unlock
// Approve below — this is what actually lets the button live in the topbar honestly.
const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  return useContext(WalletContext);
}
