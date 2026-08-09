"use client";

import { useState, useEffect } from "react";

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

// Ticks purely off the client's own clock against a fixed `since` timestamp — no network
// calls, no re-fetching. This is what makes the page read as continuously watching without
// reintroducing the polling load that was removed earlier.
export default function LiveElapsed({ since }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="mono">{formatElapsed(now - new Date(since).getTime())}</span>;
}
