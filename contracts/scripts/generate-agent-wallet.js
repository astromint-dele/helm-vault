// Generates a second, separate wallet dedicated to the "agent" role, distinct from the
// deployer wallet (which stays as the vault's owner). Same safety pattern as
// generate-wallet.js: private key goes straight into .env, only the public address
// is ever printed.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const envPath = path.join(__dirname, "..", ".env");
const wallet = ethers.Wallet.createRandom();

const existing = fs.readFileSync(envPath, "utf8");
const lines = existing.split(/\r?\n/).filter((l) => !l.startsWith("AGENT_PRIVATE_KEY="));
lines.push(`AGENT_PRIVATE_KEY="${wallet.privateKey}"`);
fs.writeFileSync(envPath, lines.join("\n"));

console.log("New agent-only wallet generated (separate from the deployer/owner wallet).");
console.log("Address (public, safe to share/fund):", wallet.address);
console.log("Private key written directly to .env — not printed here.");
