// Tests the one adversarial scenario that never touches the chain at all: an approval for a
// vault this wallet doesn't own. Unlike the other four (contracts/scripts/adversarial-reverts.js),
// this exercises web/app/api/approve/route.js's own signature verification and factory
// registry check directly, against the live production endpoint, not a simulated call. Costs
// nothing, no gas, no transaction is ever sent, both checks below reject before the route
// reaches executeTrade at all.
const { ethers } = require("ethers");

const VAULT = "0x74ad2C85EB829c0045F3177bb980Aa3C21e0f517"; // same throwaway vault as adversarial-reverts.js
const OWNER = "0x24e8FBe180128528DE6242cb7cC2618b7dbc4862"; // this vault's real owner() onchain
const API = "https://helmfi-agent.vercel.app/api/approve";

async function postApproval(label, signerAddress, signer, message, timestamp) {
  const signature = await signer.signMessage(message);
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vaultAddress: VAULT, signerAddress, signature, timestamp }),
  });
  const body = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log("signerAddress sent:", signerAddress);
  console.log("actually signed by:", signer.address);
  console.log("HTTP status:", res.status);
  console.log("response body:", JSON.stringify(body));
  return { status: res.status, body };
}

async function main() {
  const burner = ethers.Wallet.createRandom();
  console.log("burner (non-owner) wallet:", burner.address);

  // Case A: the literal scenario, a non-owner wallet honestly signs its own approval.
  const t1 = Date.now();
  await postApproval(
    "Case A: honest non-owner signature",
    burner.address,
    burner,
    `Approve Helm trade for vault ${VAULT} at ${t1}`,
    t1
  );

  // Case B: signerAddress claims to be the real owner, but the signature actually comes from
  // the burner wallet. This is the deeper check, the route recovers the real signer with
  // ethers.verifyMessage and compares that against onchain owner(), not the client-supplied
  // signerAddress field, so a spoofed claim alone should not be enough to pass.
  const t2 = Date.now();
  await postApproval(
    "Case B: spoofed owner claim, signature actually from the burner",
    OWNER,
    burner,
    `Approve Helm trade for vault ${VAULT} at ${t2}`,
    t2
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
