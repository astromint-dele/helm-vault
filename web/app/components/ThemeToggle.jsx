"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "helm-theme";

// Reads the real current state off the DOM attribute layout.js's inline script already set
// before paint, not from localStorage again here, those two could theoretically disagree
// (a different tab changed it) and the DOM is the one thing actually true on screen right
// now. useEffect, not useState's initializer, since document isn't available during SSR.
export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Syncing from an external system (the DOM attribute layout.js's pre-hydration script
    // set) on mount, not deriving from props/state, there is no synchronous alternative,
    // document isn't available before this component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem(STORAGE_KEY, "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(STORAGE_KEY, "dark");
    }
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label="Switch color theme">
      {isLight ? "Dark mode" : "Light mode"}
    </button>
  );
}
