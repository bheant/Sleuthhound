import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const DESCRIPTION = "Finds new clients and reviews each one against your ideal client.";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE}`),
  title: { default: "Sleuthhound", template: "%s, Sleuthhound" },
  description: DESCRIPTION,
  // Link previews in WhatsApp, LinkedIn, iMessage and the like.
  openGraph: {
    type: "website",
    siteName: "Sleuthhound",
    title: "Sleuthhound",
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sleuthhound’s grey crosshair on black" }],
  },
  twitter: { card: "summary_large_image", title: "Sleuthhound", description: DESCRIPTION, images: ["/og.png"] },
  // Installable: the web app manifest, and what Safari reads for Add to Dock
  // and Add to Home Screen.
  manifest: "/manifest.webmanifest",
  // Listed here in full: an icons field replaces the links Next would make
  // from app/icon files, which is how the tab lost its icon before.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  appleWebApp: { capable: true, title: "Sleuthhound", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
