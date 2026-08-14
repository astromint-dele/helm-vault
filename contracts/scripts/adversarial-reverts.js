// Deliberately triggers four on-chain reverts against a disposable throwaway vault, to prove
// PolicyVault's guardrails hold on mainnet, not just in tests or in the code that describes
// them. Each call sets an explicit gasLimit to skip ethers' automatic preflight gas
// estimation, which would throw locally on a call guaranteed to revert and never broadcast
// anything at all — every attempt here is a real transaction, mined, that fails on-chain,
// with a real hash a judge can open in the explorer and watch revert.
//
// Order matters: scenarios 1 and 2 need a complete (100%) policy to isolate the allowlist and
// cap checks specifically, so they run before the policy is deliberately broken for scenario
// 3. Scenario 4 (unauthorized caller) reverts on PolicyVault's onlyAgent modifier before the
// function body runs at all, so it's unaffected by policy state and can run anytime.
const { ethers } = require("hardhat");

const FACTORY_ADDRESS = "0x0e276CC211F6e25a8Ec00222737C2e4D50145cb4";
const USDG = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"; // 6 decimals
const XBTC = "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f"; // one of the vault's own four, disallowed mid-script to break the 100% invariant for scenario 3
const NVDAX = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d"; // one of the vault's own four, used as scenario 2's toToken so that trade fails ONLY on the cap check, not also on an allowlist check
const NOT_ALLOWLISTED = "0xf758e87ca18824b767aa4f3ed58c188d3babe428"; // BANKCx, a real Backed xStock on X Layer, just not one of this vault's four
const AGENT_ADDRESS = "0x24e8FBe180128528DE6242cb7cC2618b7dbc4862";
const PRESET_CONSERVATIVE = 0;

const FACTORY_ABI = [
  "function createVault(uint8 preset) external returns (address)",
  "event VaultCreated(address indexed owner, address indexed vault, uint8 preset)",
];
const VAULT_ABI = [
  "function setTokenAllowed(address token, bool allowed) external",
  "function executeTrade(address,address,uint256,address,address,bytes) external returns (uint256)",
  "function totalTargetBps() view returns (uint256)",
];

const REVERT_GAS_LIMIT = 200_000n; // generous ceiling; every one of these reverts on an early require, actual gas consumed is small, and unused gas is refunded regardless

async function attemptRevert(label, contract, method, args) {
  console.log(`\n--- ${label} ---`);
  let tx;
  try {
    tx = await contract[method](...args, { gasLimit: REVERT_GAS_LIMIT });
  } catch (err) {
    console.log("Node refused to broadcast:", err.shortMessage || err.message);
    return { label, hash: null, broadcast: false };
  }
  console.log("tx hash:", tx.hash);
  try {
    const receipt = await tx.wait();
    console.log("UNEXPECTED: transaction succeeded, status", receipt.status);
    return { label, hash: tx.hash, broadcast: true, status: receipt.status };
  } catch (err) {
    const receipt = err.receipt;
    console.log("status:", receipt ? receipt.status : "unknown", "(0 = reverted, as expected)");
    console.log("reason:", err.reason || err.shortMessage || err.message);
    return { label, hash: tx.hash, broadcast: true, status: receipt?.status ?? null, reason: err.reason };
  }
}

async function main() {
  const signers = await ethers.getSigners();
  const agent = signers.find((s) => s.address.toLowerCase() === AGENT_ADDRESS.toLowerCase());
  if (!agent) throw new Error(`Agent signer ${AGENT_ADDRESS} not found among configured accounts.`);
  console.log("Agent wallet:", agent.address);

  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, agent);

  console.log("\n=== Step 0: create throwaway vault ===");
  const createTx = await factory.createVault(PRESET_CONSERVATIVE);
  console.log("create tx hash:", createTx.hash);
  const createReceipt = await createTx.wait();
  const event = createReceipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "VaultCreated");
  const vaultAddress = event.args.vault;
  console.log("throwaway vault:", vaultAddress);

  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, agent);
  const results = [];

  results.push(
    await attemptRevert("Scenario 1: token not on the allowlist", vault, "executeTrade", [
      NOT_ALLOWLISTED,
      USDG,
      ethers.parseUnits("1", 18),
      USDG,
      USDG,
      "0x",
    ])
  );

  results.push(
    await attemptRevert("Scenario 2: trade above the per-trade size cap", vault, "executeTrade", [
      USDG,
      NVDAX, // allowlisted, so this trade passes both allowlist checks and fails only on the cap
      ethers.parseUnits("2001", 6), // cap is 2000 USDG, see VaultFactory.USDG_MAX_TRADE
      USDG,
      USDG,
      "0x",
    ])
  );

  console.log("\n=== Step: deliberately break the policy for scenario 3 ===");
  const breakTx = await vault.setTokenAllowed(XBTC, false);
  console.log("break-policy tx hash:", breakTx.hash);
  await breakTx.wait();

  const total = await vault.totalTargetBps();
  console.log("totalTargetBps after break:", total.toString());

  results.push(
    await attemptRevert("Scenario 3: policy targets do not sum to 100%", vault, "executeTrade", [
      USDG,
      NOT_ALLOWLISTED,
      ethers.parseUnits("1", 6),
      USDG,
      USDG,
      "0x",
    ])
  );

  console.log("\n=== Step: fund a burner wallet for scenario 4 ===");
  const burner = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log("burner wallet:", burner.address);
  const fundTx = await agent.sendTransaction({ to: burner.address, value: ethers.parseEther("0.0003") });
  await fundTx.wait();
  console.log("funded burner with 0.0003 OKB, tx:", fundTx.hash);

  const vaultAsBurner = vault.connect(burner);
  results.push(
    await attemptRevert("Scenario 4: unauthorized wallet calls executeTrade directly", vaultAsBurner, "executeTrade", [
      USDG,
      NOT_ALLOWLISTED,
      ethers.parseUnits("1", 6),
      USDG,
      USDG,
      "0x",
    ])
  );

  console.log("\n\n=== SUMMARY ===");
  console.log("throwaway vault:", vaultAddress);
  console.log("burner wallet:", burner.address);
  for (const r of results) {
    console.log(`${r.label}: hash=${r.hash} status=${r.status} reason=${r.reason || "n/a"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
