import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Build the Supabase origins allowed by the Content Security Policy.
 * Falls back to the generic Supabase domain if the URL is not set at build time.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (raw) {
      const url = new URL(raw);
      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      return [url.origin, `${wsProtocol}//${url.host}`];
    }
  } catch {
    // Invalid URL: environment validation reports this at runtime.
  }
  return ["https://*.supabase.co", "wss://*.supabase.co"];
}

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts. A nonce-based policy is planned for Stage 8 hardening.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins().join(" ")}${isDev ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be served stale, or users get stuck on old code.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
