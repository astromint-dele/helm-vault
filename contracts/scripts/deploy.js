// Deploys PolicyVault to X Layer. Owner and agent are two separate wallets:
// - owner (signers[0], the deployer wallet): can change policy/allowlist/agent, can withdraw.
// - agent (signers[1], a dedicated wallet with no owner privileges): can only call executeTrade.
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer, agentSigner] = await ethers.getSigners();
  if (!agentSigner) {
    throw new Error(
      "No agent signer configured. Run `npm run generate-agent-wallet` first so AGENT_PRIVATE_KEY is set in .env."
    );
  }

  console.log("Network:", network.name);
  console.log("Owner (deployer):", deployer.address);
  console.log("Agent:", agentSigner.address);

  const ownerBalance = await ethers.provider.getBalance(deployer.address);
  const agentBalance = await ethers.provider.getBalance(agentSigner.address);
  console.log("Owner OKB balance:", ethers.formatEther(ownerBalance));
  console.log("Agent OKB balance:", ethers.formatEther(agentBalance));

  const PolicyVault = await ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(deployer.address, agentSigner.address);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const deployTx = vault.deploymentTransaction();

  console.log("\nPolicyVault deployed to:", address);
  console.log("Deployment tx hash:", deployTx.hash);
  console.log("Owner:", await vault.owner());
  console.log("Agent:", await vault.agent());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
