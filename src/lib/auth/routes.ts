/** Route groups used by proxy.ts and the app shell. */
export const PROTECTED_PREFIXES = [
  "/overview",
  "/settings",
  "/money",
  "/intelligence",
  "/planning",
  "/nudges",
  "/wellbeing",
] as const;
export const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthPage(pathname: string): boolean {
  return (AUTH_PAGES as readonly string[]).includes(pathname);
}
