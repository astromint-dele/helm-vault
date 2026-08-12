// Answers exactly one question, honestly and in the right order: can the server trust
// anything about this vault address at all, and if so, who does it actually belong to
// right now. This is the mechanism the fail-closed guarantee depends on for a
// multi-vault world, so every read here goes through the same reliable RPC cross-check
// used for every other decision-driving read in this project, never a single unchecked
// call, and never cached on the path that gates approval.
import { ethers } from "ethers";
import { reliableRead } from "../../../lib/reliableRpc.js";
import { noopTimer } from "../../../lib/timing.js";
import { VAULT_FACTORY_ADDRESS } from "../lib/vaultFactory.js";

const FACTORY_ISVAULT_ABI = ["function isVault(address) view returns (bool)"];
const VAULT_OWNER_ABI = ["function owner() view returns (address)"];

// The one vault that predates VaultFactory entirely, hand-deployed and hand-configured
// before the factory existed, so it will never appear in the factory's own registry no
// matter how long the factory runs. This is a single, explicit, named exception, not a
// general bypass, everything else must pass the real isVault check below. If this vault
// is ever retired, delete this constant and its one carve-out below, nothing else changes.
export const LEGACY_VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";

/// True only if vaultAddress is either the legacy vault, or genuinely registered by
/// VaultFactory. Deliberately does NOT trust anything else about the address, in
/// particular never reads owner() on an address that fails this check, since an
/// arbitrary contract someone deployed themselves can implement owner() to return
/// whatever they like.
export async function isKnownVault(vaultAddress, timer = noopTimer()) {
  if (vaultAddress.toLowerCase() === LEGACY_VAULT_ADDRESS.toLowerCase()) {
    return true;
  }
  const result = await timer.time(`registry:isVault:${vaultAddress}`, () =>
    reliableRead(
      (provider) => new ethers.Contract(VAULT_FACTORY_ADDRESS, FACTORY_ISVAULT_ABI, provider).isVault(vaultAddress),
      { label: `isVault(${vaultAddress})` }
    )
  );
  return result === "true";
}

/// Fresh owner() for a vault already confirmed known by isKnownVault. Never cached, this
/// is called at the moment it's needed, every time, by design, the same discipline
/// already applied to re-deriving the trade itself fresh in /api/approve.
export async function getVaultOwner(vaultAddress, timer = noopTimer()) {
  return timer.time(`registry:owner:${vaultAddress}`, () =>
    reliableRead((provider) => new ethers.Contract(vaultAddress, VAULT_OWNER_ABI, provider).owner(), {
      label: `owner(${vaultAddress})`,
    })
  );
}
