// Generates a fresh deployer/agent wallet for the hackathon, writes the private key
// straight into .env (never printed to the terminal), and prints only the public address
// so it can be funded from the X Layer testnet faucet.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const envPath = path.join(__dirname, "..", ".env");
const wallet = ethers.Wallet.createRandom();

let existing = "";
try {
  existing = fs.readFileSync(envPath, "utf8");
} catch {
  existing = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
}

const lines = existing.split(/\r?\n/).filter((l) => !l.startsWith("DEPLOYER_PRIVATE_KEY="));
lines.push(`DEPLOYER_PRIVATE_KEY="${wallet.privateKey}"`);
fs.writeFileSync(envPath, lines.join("\n"));

console.log("New deployer/agent wallet generated.");
console.log("Address (public, safe to share/fund):", wallet.address);
console.log("Private key written directly to .env — not printed here.");
