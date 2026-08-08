// Configures the mainnet PolicyVault for the $20 USDG -> NVDAx test swap only.
// Caps are deliberately small, matching test scale, not the eventual full portfolio.
const { ethers } = require("hardhat");

const VAULT_ADDRESS = "0x6bD23c1a2d2f4165aBC981eF773A75fd96124522";
const USDG = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
const NVDAx_wrapper = "0xa8ddb5cd96b5222afe198316e9a57caa642850d5"; // wNVDAx, the AMM-liquid version (Phase 0 finding)

async function main() {
  const vault = await ethers.getContractAt("PolicyVault", VAULT_ADDRESS);

  console.log("Allowlisting USDG...");
  await (await vault.setTokenAllowed(USDG, true)).wait();
  console.log("Allowlisting wNVDAx...");
  await (await vault.setTokenAllowed(NVDAx_wrapper, true)).wait();

  console.log("Setting USDG policy (cash leg, max trade 25 USDG)...");
  await (
    await vault.setPolicy(USDG, 2000, 0, ethers.parseUnits("25", 6))
  ).wait();

  console.log("Setting wNVDAx policy (equity sleeve, max holding 1 share)...");
  await (
    await vault.setPolicy(NVDAx_wrapper, 1500, ethers.parseUnits("1", 18), 0)
  ).wait();

  console.log("\nDone. Current policy:");
  console.log("USDG allowed:", await vault.isAllowedToken(USDG));
  console.log("wNVDAx allowed:", await vault.isAllowedToken(NVDAx_wrapper));
  console.log("USDG max trade size:", ethers.formatUnits(await vault.maxTradeSize(USDG), 6));
  console.log("wNVDAx max holding:", ethers.formatUnits(await vault.maxHoldingAmount(NVDAx_wrapper), 18));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
