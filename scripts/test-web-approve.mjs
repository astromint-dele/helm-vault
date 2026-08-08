// Verifies the real /api/approve route end to end by signing the exact message the
// browser wallet would sign (using the owner's real key, read the same way the frontend
// hook does) and POSTing it, rather than trusting the UI click alone.
import { ethers } from "ethers";
import fs from "node:fs";

const envRaw = fs.readFileSync("C:/Users/Dele David/my-crypto-lab/helm/contracts/.env", "utf8");
const privateKey = envRaw
  .split(/\r?\n/)
  .find((l) => l.startsWith("DEPLOYER_PRIVATE_KEY="))
  .slice("DEPLOYER_PRIVATE_KEY=".length)
  .replace(/^"|"$/g, "");

const wallet = new ethers.Wallet(privateKey);
const vaultAddress = "0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b";
const timestamp = Date.now();
const message = `Approve Helm trade for vault ${vaultAddress} at ${timestamp}`;
const signature = await wallet.signMessage(message);

console.log("Signer:", wallet.address);
console.log("Posting to /api/approve...");

const res = await fetch("http://localhost:3000/api/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ vaultAddress, signerAddress: wallet.address, signature, timestamp }),
});
const data = await res.json();
console.log("Response:", JSON.stringify(data, null, 2));
