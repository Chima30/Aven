import { createHmac } from "node:crypto";

/**
 * Every AVEN user gets their own Walrus Memory namespace:
 *
 *   `${MEMWAL_NAMESPACE}-u-<first 32 hex chars of HMAC-SHA256(secret, userId)>`
 *
 * - It is derived on the server from the AUTHENTICATED user id only; no
 *   request can choose or influence the namespace it reads or writes.
 * - The HMAC means Supabase user ids never appear in Walrus/Sui metadata, and
 *   nobody without MEMWAL_NAMESPACE_SECRET can link a namespace to a user.
 * - MemWal matches namespaces exactly (no prefixes or hierarchy), so one
 *   user's recall can never return another user's memories.
 *
 * Changing MEMWAL_NAMESPACE_SECRET makes every existing memory unreachable,
 * so treat it like a database password: set it once and keep it.
 */
export function deriveUserNamespace(base: string, secret: string, userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("A valid user id is required");
  if (secret.length < 32) throw new Error("Namespace secret is too short");
  const digest = createHmac("sha256", secret)
    .update(`aven-user:${userId.toLowerCase()}`)
    .digest("hex");
  return `${base}-u-${digest.slice(0, 32)}`;
}
