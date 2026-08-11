// Step 3 of the vault factory build: deploy VaultFactory to X Layer mainnet with real
// xStock addresses, then run one real createVault call and verify every value from chain.
//
// Token addresses are read live from the already-deployed, already-proven vault's own
// allowedTokenList, not retyped by hand. That vault's addresses are themselves the ones
// used in real, confirmed mainnet trades (see README's Verified results), the most
// authoritative source available, more authoritative than re-copying from a deploy script
// or the static Backed registry (which doesn't even contain xBTC, OKX's own wrapped BTC,
// not a Backed xStock). A wrong address here would misconfigure every vault the factory
// ever creates and need a redeploy to fix, so this is read from chain, not pasted.
const { ethers, network } = require("hardhat");

const LIVE_VAULT_ADDRESS = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";
const LIVE_VAULT_ABI = [
  "function allowedTokenCount() view returns (uint256)",
  "function allowedTokenList(uint256) view returns (address)",
];
const ERC20_ABI = ["function symbol() view returns (string)"];

async function resolveLiveTokenAddresses() {
  const vault = await ethers.getContractAt(LIVE_VAULT_ABI, LIVE_VAULT_ADDRESS);
  const count = Number(await vault.allowedTokenCount());
  const bySymbol = {};
  for (let i = 0; i < count; i++) {
    const addr = await vault.allowedTokenList(i);
    const erc20 = await ethers.getContractAt(ERC20_ABI, addr);
    const symbol = await erc20.symbol();
    bySymbol[symbol] = addr;
  }
  for (const required of ["USDG", "NVDAx", "SPYx", "xBTC"]) {
    if (!bySymbol[required]) {
      throw new Error(`Live vault's allowlist is missing ${required}, refusing to deploy with an incomplete set.`);
    }
  }
  return bySymbol;
}

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

  console.log("\nResolving real token addresses from the live vault's own allowlist...");
  const tokens = await resolveLiveTokenAddresses();
  for (const [symbol, addr] of Object.entries(tokens)) {
    console.log(`  ${symbol}: ${addr}`);
  }

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    agentSigner.address,
    tokens.USDG,
    tokens.NVDAx,
    tokens.SPYx,
    tokens.xBTC
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const factoryDeployTx = factory.deploymentTransaction();
  const factoryDeployReceipt = await factoryDeployTx.wait();

  console.log("\nVaultFactory deployed to:", factoryAddress);
  console.log("Deployment tx hash:", factoryDeployTx.hash);
  console.log("Deployment gas used:", factoryDeployReceipt.gasUsed.toString());

  console.log("\nCalling createVault(Balanced) for real, on mainnet...");
  const tx = await factory.createVault(1); // Balanced
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("status:", receipt.status === 1 ? "success" : "FAILED");
  console.log("gas used:", receipt.gasUsed.toString());
  console.log("gas price:", ethers.formatUnits(receipt.gasPrice, "gwei"), "gwei");
  const costWei = receipt.gasUsed * receipt.gasPrice;
  console.log("cost:", ethers.formatEther(costWei), "OKB");

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

  for (const [symbol, addr] of Object.entries(tokens)) {
    const allowed = await vault.isAllowedToken(addr);
    const target = await vault.targetAllocationBps(addr);
    const maxHolding = await vault.maxHoldingAmount(addr);
    const maxTrade = await vault.maxTradeSize(addr);
    console.log(`  ${symbol}: allowed=${allowed} target=${target}bps maxHolding=${maxHolding} maxTrade=${maxTrade}`);
  }

  console.log("\nFactory registry:");
  console.log("  isVault(vault):", await factory.isVault(vaultAddress), "(expect true)");
  console.log("  allVaultsCount:", (await factory.allVaultsCount()).toString(), "(expect 1)");

  console.log("\n--- Summary ---");
  console.log("Factory address:", factoryAddress);
  console.log("Factory deploy tx:", factoryDeployTx.hash);
  console.log("createVault tx:", tx.hash);
  console.log("Created vault address:", vaultAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
