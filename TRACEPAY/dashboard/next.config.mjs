// The browser only ever talks to this app. Sign-in and metrics are proxied to the FastAPI backend,
// so the backend needs no CORS settings and its address never reaches the browser.
const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Loading every table can be slow on a poor connection; the default proxy limit is 30 s.
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: "/api/metrics", destination: `${backend}/superadmin/api/metrics` },
      { source: "/api/session", destination: `${backend}/superadmin/api/session` },
      { source: "/api/accounts/:id", destination: `${backend}/superadmin/api/accounts/:id` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
