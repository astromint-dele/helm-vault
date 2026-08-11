// Step 2 of the vault factory build: prove VaultFactory works over a real RPC connection
// with real transaction propagation, not just Hardhat's local network. Follows the same
// precedent as testnet-dry-run.js (Phase 2's equivalent check for PolicyVault itself) -
// real xStock tokens don't exist on X Layer testnet, so fresh MockERC20 tokens stand in
// for USDG/NVDAx/SPYx/xBTC here. Real mainnet token addresses get wired in at mainnet
// deploy (step 3), not here.
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer, agentSigner] = await ethers.getSigners();
  if (!agentSigner) {
    throw new Error(
      "No agent signer configured. Run `npm run generate-agent-wallet` first so AGENT_PRIVATE_KEY is set in .env."
    );
  }

  console.log("Network:", network.name);
  console.log("Deployer/caller:", deployer.address);
  console.log("Agent:", agentSigner.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdg = await MockERC20.deploy("Testnet USDG", "tUSDG");
  await usdg.waitForDeployment();
  const nvdax = await MockERC20.deploy("Testnet NVDAx", "tNVDAx");
  await nvdax.waitForDeployment();
  const spyx = await MockERC20.deploy("Testnet SPYx", "tSPYx");
  await spyx.waitForDeployment();
  const xbtc = await MockERC20.deploy("Testnet xBTC", "txBTC");
  await xbtc.waitForDeployment();

  console.log("\nMock tokens deployed:");
  console.log("  USDG:", await usdg.getAddress());
  console.log("  NVDAx:", await nvdax.getAddress());
  console.log("  SPYx:", await spyx.getAddress());
  console.log("  xBTC:", await xbtc.getAddress());

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    agentSigner.address,
    await usdg.getAddress(),
    await nvdax.getAddress(),
    await spyx.getAddress(),
    await xbtc.getAddress()
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const factoryDeployTx = factory.deploymentTransaction();

  console.log("\nVaultFactory deployed to:", factoryAddress);
  console.log("Deployment tx hash:", factoryDeployTx.hash);

  console.log("\nCalling createVault(Balanced) for real, on testnet...");
  const tx = await factory.createVault(1); // Balanced
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("status:", receipt.status === 1 ? "success" : "FAILED");
  console.log("gas used:", receipt.gasUsed.toString());

  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "VaultCreated");
  if (!event) throw new Error("VaultCreated event not found in receipt");

  const vaultAddress = event.args.vault;
  console.log("\nVault created at:", vaultAddress);

  const vault = await ethers.getContractAt("PolicyVault", vaultAddress);
  console.log("\nVerifying vault state directly from chain, not trusting the event alone:");
  console.log("  owner:", await vault.owner(), "(expect deployer", deployer.address + ")");
  console.log("  agent:", await vault.agent(), "(expect agent", agentSigner.address + ")");
  console.log("  totalTargetBps:", (await vault.totalTargetBps()).toString(), "(expect 10000)");

  const tokens = [
    ["USDG", usdg],
    ["NVDAx", nvdax],
    ["SPYx", spyx],
    ["xBTC", xbtc],
  ];
  for (const [symbol, token] of tokens) {
    const addr = await token.getAddress();
    const allowed = await vault.isAllowedToken(addr);
    const target = await vault.targetAllocationBps(addr);
    const maxHolding = await vault.maxHoldingAmount(addr);
    const maxTrade = await vault.maxTradeSize(addr);
    console.log(`  ${symbol}: allowed=${allowed} target=${target}bps maxHolding=${maxHolding} maxTrade=${maxTrade}`);
  }

  console.log("\nFactory registry:");
  console.log("  isVault(vault):", await factory.isVault(vaultAddress), "(expect true)");
  console.log("  allVaultsCount:", (await factory.allVaultsCount()).toString(), "(expect 1)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
