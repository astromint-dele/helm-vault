"use client";

import { useState, useEffect } from "react";

function formatUtc(date) {
  return date.toISOString().slice(11, 19) + " utc";
}

// The literal current time, ticking every second off the client's own clock. Unlike a
// fabricated "next check in Ns" countdown, this makes no claim about Helm's behavior at
// all, it's just genuinely always-true, which is what makes it safe to show as part of a
// "standing watch" status line without implying a polling loop that doesn't exist.
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="mono">{formatUtc(now)}</span>;
}
