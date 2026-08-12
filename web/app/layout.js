import localFont from "next/font/local";
import "./globals.css";

const instrumentSerif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
});

const publicSans = localFont({
  src: "./fonts/PublicSans-Variable.woff2",
  weight: "400 700",
  variable: "--font-body",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/PlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/PlexMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/PlexMono-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-data",
  display: "swap",
});

export const metadata = {
  title: "Helm",
  description: "AI portfolio desk for tokenized assets on X Layer",
};

// Runs before first paint, not in a useEffect, since a client-side theme switch after
// hydration would show a flash of the wrong theme first. Dark is the real default (no
// attribute at all matches :root, no light-specific rule needed), this only ever adds
// data-theme="light" when that's what was actually saved, never removes anything.
const THEME_INIT_SCRIPT = `try {
  var t = localStorage.getItem("helm-theme");
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
} catch (e) {}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
