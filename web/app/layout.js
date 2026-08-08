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

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
