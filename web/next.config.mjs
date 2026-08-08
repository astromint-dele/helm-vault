import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silences a real warning, not a cosmetic one: this project sits inside a monorepo-lite
  // layout with sibling package-lock.json files (helm/, helm/web/), and Next.js otherwise
  // guesses the wrong workspace root, which affects font/asset resolution. Root is set to
  // the parent (helm/), not this app's own directory (helm/web/) — the API routes import
  // directly from ../../../../lib, which lives outside helm/web, and scoping root too
  // narrowly here broke that resolution entirely (confirmed: "Module not found" on every
  // lib import until this was corrected one level up).
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
