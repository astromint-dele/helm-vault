// Single source of truth for who owns this vault. /api/approve enforces it server-side
// (never trust the client on who can execute); /api/state exposes it read-only so the UI
// can tell a connected non-owner wallet that up front, before they attempt a signature that
// the server would reject anyway.
export const OWNER_ADDRESS = process.env.OWNER_ADDRESS || "0x6eDFf2BC9D55dfe839bA2666e6D4653dE21875AB";
