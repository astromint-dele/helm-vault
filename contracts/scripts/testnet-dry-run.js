// One-off Phase 2 derisking check: proves executeTrade works over a real RPC connection
// (not just Hardhat's local test network) before we spend real gas on mainnet. Deploys
// fresh mock tokens + a mock router to testnet, configures the already-deployed testnet
// PolicyVault to trade between them, and runs one real executeTrade call.
const { ethers } = require("hardhat");

async function main() {
  const vaultAddress = "0x945d7A962A2095b479ae41c79d901AFc234402a6"; // Phase 1 testnet deployment
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdg = await MockERC20.deploy("Dry Run USDG", "drUSDG");
  await usdg.waitForDeployment();
  const nvdax = await MockERC20.deploy("Dry Run NVDAx", "drNVDAx");
  await nvdax.waitForDeployment();
  console.log("mock USDG:", await usdg.getAddress());
  console.log("mock NVDAx:", await nvdax.getAddress());

  const MockRouter = await ethers.getContractFactory("MockRouter");
  const router = await MockRouter.deploy();
  await router.waitForDeployment();
  console.log("mock router:", await router.getAddress());

  const vault = await ethers.getContractAt("PolicyVault", vaultAddress);
  await (await vault.setTokenAllowed(await usdg.getAddress(), true)).wait();
  await (await vault.setTokenAllowed(await nvdax.getAddress(), true)).wait();
  await (await vault.setPolicy(await usdg.getAddress(), 4000, 0, ethers.parseUnits("1000", 18))).wait();
  await (await vault.setPolicy(await nvdax.getAddress(), 6000, ethers.parseUnits("100", 18), 0)).wait();
  console.log("policy configured on live testnet vault");

  await (await usdg.mint(vaultAddress, ethers.parseUnits("1000", 18))).wait();
  await (await nvdax.mint(await router.getAddress(), ethers.parseUnits("100", 18))).wait();
  console.log("vault funded with mock USDG, router funded with mock NVDAx");

  const amountIn = ethers.parseUnits("100", 18);
  const amountOut = ethers.parseUnits("2", 18);
  const calldata = router.interface.encodeFunctionData("execute", [
    await usdg.getAddress(),
    amountIn,
    await nvdax.getAddress(),
    amountOut,
  ]);

  console.log("\nsubmitting executeTrade on live testnet...");
  const tx = await vault.executeTrade(
    await usdg.getAddress(),
    await nvdax.getAddress(),
    amountIn,
    await router.getAddress(),
    calldata
  );
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("status:", receipt.status === 1 ? "success" : "FAILED");
  console.log("vault NVDAx balance after:", ethers.formatUnits(await nvdax.balanceOf(vaultAddress), 18));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
