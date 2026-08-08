// Phase 2: agent-side execution. Gets a real swap transaction from OKX's DEX Aggregator
// and submits it through PolicyVault.executeTrade, so every trade still passes through
// the vault's on-chain constraint checks (allowlist, per-trade cap, holding cap) before
// it can happen — this script has no power to bypass them, it just triggers the call.
//
// Config via environment variables (see contracts/.env):
//   VAULT_ADDRESS      - the PolicyVault contract to trade through
//   FROM_TOKEN_ADDRESS, FROM_TOKEN_DECIMALS
//   TO_TOKEN_ADDRESS
//   AMOUNT_HUMAN       - trade size in fromToken's human units, e.g. "20" for 20 USDG
require("dotenv").config();
require("dotenv").config({ path: require("node:path").join(__dirname, "..", "..", ".env") });
const { ethers } = require("hardhat");

async function main() {
  const { buildSwapTx } = await import("../../lib/swapBuilder.js");
  const { toBaseUnits } = await import("../../lib/okxClient.js");

  const vaultAddress = process.env.VAULT_ADDRESS;
  const fromTokenAddress = process.env.FROM_TOKEN_ADDRESS;
  const fromTokenDecimals = Number(process.env.FROM_TOKEN_DECIMALS);
  const toTokenAddress = process.env.TO_TOKEN_ADDRESS;
  const amountHuman = process.env.AMOUNT_HUMAN;

  if (!vaultAddress || !fromTokenAddress || !fromTokenDecimals || !toTokenAddress || !amountHuman) {
    throw new Error(
      "Missing required env vars: VAULT_ADDRESS, FROM_TOKEN_ADDRESS, FROM_TOKEN_DECIMALS, TO_TOKEN_ADDRESS, AMOUNT_HUMAN"
    );
  }

  const amount = toBaseUnits(Number(amountHuman), fromTokenDecimals);

  console.log("Building swap via OKX DEX Aggregator...");
  const swap = await buildSwapTx({ vaultAddress, fromTokenAddress, toTokenAddress, amount });
  console.log("approveTarget:", swap.approveTarget);
  console.log("swapTarget:", swap.swapTarget);
  console.log("estimated toAmount:", swap.estimatedToAmount);
  console.log("min receive (slippage floor):", swap.minReceiveAmount);
  console.log("price impact:", swap.priceImpactPercent + "%");

  const [, agentSigner] = await ethers.getSigners();
  if (!agentSigner) {
    throw new Error(
      "No agent signer configured. Run `npm run generate-agent-wallet` first so AGENT_PRIVATE_KEY is set in .env."
    );
  }
  const vault = await ethers.getContractAt("PolicyVault", vaultAddress, agentSigner);
  console.log("\nSubmitting executeTrade as agent:", agentSigner.address);

  const onChainAgent = await vault.agent();
  if (onChainAgent.toLowerCase() !== agentSigner.address.toLowerCase()) {
    throw new Error(
      `Signer ${agentSigner.address} is not this vault's authorized agent (${onChainAgent}). Refusing to send a transaction that would just revert.`
    );
  }

  const tx = await vault.executeTrade(
    fromTokenAddress,
    toTokenAddress,
    amount,
    swap.approveTarget,
    swap.swapTarget,
    swap.swapCalldata
  );
  console.log("tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("status:", receipt.status === 1 ? "success" : "FAILED");
  console.log("gas used:", receipt.gasUsed.toString());

  const event = receipt.logs
    .map((log) => {
      try {
        return vault.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "TradeExecuted");
  if (event) {
    console.log("TradeExecuted: amountIn =", event.args.amountIn.toString(), "amountOut =", event.args.amountOut.toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
