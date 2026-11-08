/**
 * Content Security Policy, built per request with a fresh nonce.
 *
 * Scripts run only if they carry this request's nonce (Next.js adds it to its
 * own scripts automatically when it sees the policy on the request), so an
 * injected <script> or inline event handler is refused. 'strict-dynamic' lets
 * those trusted scripts load the app's code-split chunks.
 */

/** The Supabase origins the browser may talk to. */
export function supabaseOrigins(raw: string | undefined): string[] {
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

export function buildCsp(
  nonce: string,
  { isDev, supabaseUrl }: { isDev: boolean; supabaseUrl: string | undefined },
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React and Tailwind set inline styles; styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigins(supabaseUrl).join(" ")}${isDev ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
