// Single source of truth for the factory's address and the minimal ABI needed to call it,
// shared between server code (vaultRegistry.js, checking isVault) and client code
// (useWallet.js, actually calling createVault from the browser). One definition, not two
// copies that could drift out of sync, the same discipline applied to every other address
// in this project after the mainnet deploy read real token addresses from chain instead of
// letting them be retyped by hand.
import { Contract } from "ethers";

export const VAULT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS || "0x0e276CC211F6e25a8Ec00222737C2e4D50145cb4";

export const VAULT_FACTORY_ABI = [
  "function createVault(uint8 preset) external returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, uint8 preset)",
  "function vaultsByOwnerCount(address ownerAddress) view returns (uint256)",
  "function vaultsByOwner(address ownerAddress, uint256 index) view returns (address)",
];

// Reconstructs an owner's vaults straight from the factory's own onchain registry, not
// from any client-side storage, so "find my vault again" works from any device or browser
// just by connecting the same wallet, closing the tab loses nothing. Read-only, no signer
// or wallet prompt needed, callers pass any ethers Provider (a JsonRpcProvider works fine,
// this never needs the connected wallet's own provider specifically).
export async function getVaultsForOwner(ownerAddress, provider) {
  const factory = new Contract(VAULT_FACTORY_ADDRESS, VAULT_FACTORY_ABI, provider);
  const count = Number(await factory.vaultsByOwnerCount(ownerAddress));
  const vaults = [];
  for (let i = 0; i < count; i++) {
    vaults.push(await factory.vaultsByOwner(ownerAddress, i));
  }
  return vaults;
}

// Mirrors VaultFactory.sol's Preset enum exactly, order matters.
export const PRESETS = [
  { id: 0, name: "Conservative", allocations: { USDG: 60, NVDAx: 15, SPYx: 15, xBTC: 10 } },
  { id: 1, name: "Balanced", allocations: { USDG: 40, NVDAx: 25, SPYx: 20, xBTC: 15 } },
  { id: 2, name: "Growth", allocations: { USDG: 15, NVDAx: 35, SPYx: 25, xBTC: 25 } },
];
