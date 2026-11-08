import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Password-recovery proof.
 *
 * When a user arrives from a password-reset email, /auth/confirm sets a short-
 * lived, HttpOnly cookie signed with a server-only key. /reset-password only
 * lets someone choose a new password WITHOUT their current one if that cookie
 * is valid for the signed-in user. Everyone else must use Settings → Security,
 * which asks for the current password.
 */
export const RECOVERY_COOKIE = "aven-recovery";
export const RECOVERY_TTL_SECONDS = 15 * 60;

function sign(payload: string, key: string): string {
  return createHmac("sha256", `aven-recovery:${key}`).update(payload).digest("base64url");
}

export function createRecoveryToken(userId: string, key: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + RECOVERY_TTL_SECONDS}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyRecoveryToken(
  token: string | undefined,
  userId: string,
  key: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, exp, signature] = parts as [string, string, string];
  const expected = sign(`${uid}.${exp}`, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (uid !== userId) return false;
  return Number(exp) * 1000 > now;
}

export const RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: RECOVERY_TTL_SECONDS,
};

/**
 * Did this /auth/confirm visit come from a PASSWORD-RESET email?
 *
 * Only then may the browser skip the current password. The `next` address in
 * the link is not proof (any email link can carry next=/reset-password), so:
 *   • token_hash links: the verified type must be "recovery";
 *   • code (PKCE) links: the new session's most recent sign-in method, which
 *     Supabase records in the token's `amr` claim, must be "recovery".
 */
export function isRecoveryLanding(input: {
  type: string | null;
  usedCode: boolean;
  amr: unknown;
}): boolean {
  if (!input.usedCode) return input.type === "recovery";
  if (!Array.isArray(input.amr) || input.amr.length === 0) return false;
  const latest = [...input.amr]
    .filter(
      (e): e is { method: string; timestamp?: number } =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { method?: unknown }).method === "string",
    )
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
  return latest?.method === "recovery";
}
