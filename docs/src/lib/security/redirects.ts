/**
 * Open-redirect protection. Only same-site relative paths are allowed as a
 * post-login destination (e.g. "/settings/security"). Anything else — full
 * URLs, protocol-relative "//evil.com", backslash tricks, control characters —
 * falls back to the default.
 */
export const DEFAULT_AFTER_SIGN_IN = "/overview";

export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_AFTER_SIGN_IN,
): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  if (candidate.length > 512) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  // Reject encoded tricks too (e.g. "%0d%0a" header injection, "%2F%2Fevil.com").
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith("//")) return fallback;

  // Parse against a dummy origin; if the origin changes, it was not a relative path.
  try {
    const base = "https://aven.invalid";
    const url = new URL(candidate, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Never bounce back into the auth callback itself.
    if (url.pathname.startsWith("/auth/")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
