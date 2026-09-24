/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Django URLs end with "/" — don't let Next strip it (would loop with APPEND_SLASH).
  skipTrailingSlashRedirect: true,
  // Separate build dirs let several dev servers run side by side (local QA only).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
  // Local development: proxy /api and /ws to a Django dev server (API_PROXY=http://127.0.0.1:8000).
  async rewrites() {
    const target = process.env.API_PROXY;
    return target
      ? [
          { source: "/api/:path*/", destination: `${target}/api/:path*/` },
          { source: "/api/:path*", destination: `${target}/api/:path*` },
        ]
      : [];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",        value: "nosniff"      },
          { key: "X-Frame-Options",               value: "DENY"         },
          { key: "Referrer-Policy",               value: "no-referrer"  },
          // Required for MediaPipe Tasks Vision WASM (SharedArrayBuffer / GPU delegate).
          // "credentialless" is less restrictive than "require-corp" — cross-origin
          // resources (RPM CDN, googleapis, jsDelivr) load without extra CORP headers.
          { key: "Cross-Origin-Opener-Policy",    value: "same-origin"  },
          { key: "Cross-Origin-Embedder-Policy",  value: "credentialless" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
