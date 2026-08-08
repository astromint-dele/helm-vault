// Configures vault #5 with the corrected 4-asset policy: USDG (cash), NVDAx (equity),
// SPYx (index), xBTC (crypto), targets summing to exactly 100%. Using raw NVDAx/SPYx, not
// their wrapper tokens — see README for why.
const { ethers } = require("hardhat");

const VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";

const TOKENS = {
  USDG: { address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6, targetBps: 4000, maxHolding: "0", maxTrade: "25" },
  NVDAx: { address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", decimals: 18, targetBps: 2500, maxHolding: "1", maxTrade: "0" },
  SPYx: { address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", decimals: 18, targetBps: 2000, maxHolding: "1", maxTrade: "0" },
  xBTC: { address: "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", decimals: 8, targetBps: 1500, maxHolding: "0.01", maxTrade: "0" },
};

async function main() {
  const vault = await ethers.getContractAt("PolicyVault", VAULT_ADDRESS);

  for (const [symbol, t] of Object.entries(TOKENS)) {
    console.log(`Allowlisting ${symbol}...`);
    await (await vault.setTokenAllowed(t.address, true)).wait();
  }

  for (const [symbol, t] of Object.entries(TOKENS)) {
    console.log(`Setting ${symbol} policy: ${t.targetBps / 100}% target, maxHolding=${t.maxHolding}, maxTrade=${t.maxTrade}...`);
    await (
      await vault.setPolicy(
        t.address,
        t.targetBps,
        ethers.parseUnits(t.maxHolding, t.decimals),
        ethers.parseUnits(t.maxTrade, t.decimals)
      )
    ).wait();
  }

  console.log("\nDone. totalTargetBps:", (await vault.totalTargetBps()).toString(), "(should be 10000)");
  for (const [symbol, t] of Object.entries(TOKENS)) {
    console.log(symbol, "allowed:", await vault.isAllowedToken(t.address), "| target:", (await vault.targetAllocationBps(t.address)).toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
