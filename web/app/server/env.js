// Bootstraps environment variables for local dev by loading the existing root .env and
// contracts/.env files directly, rather than duplicating secrets into a third
// web/.env.local. In production on Vercel, neither file exists (both gitignored, never
// deployed), so dotenv.config() silently no-ops on both calls — process.env is expected
// to already be populated by Vercel's own dashboard-configured environment variables.
// This file is plumbing, not business logic, so it isn't part of "no logic duplicated."
import dotenv from "dotenv";
import path from "node:path";

let loaded = false;

export function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  dotenv.config({ path: path.join(process.cwd(), "..", ".env") });
  dotenv.config({ path: path.join(process.cwd(), "..", "contracts", ".env") });
}
