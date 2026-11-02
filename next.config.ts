import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Built as a static site for Cloudflare Pages: every page renders in the
// browser from the encrypted local database. In development, /api and /proxy
// go to `wrangler pages dev` on port 8788, which runs functions/ against a
// local D1, so the browser sees one origin as it will in production.
const API = "http://127.0.0.1:8788";

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    ...(dev
      ? {
          rewrites: async () => [
            { source: "/api/:path*", destination: `${API}/api/:path*` },
            { source: "/proxy/:path*", destination: `${API}/proxy/:path*` },
          ],
        }
      : { output: "export" }),
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
