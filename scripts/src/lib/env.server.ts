import "server-only";
import { z } from "zod";
import { EnvError, formatIssues } from "./env";

/**
 * Server-only secrets. Importing this file from a Client Component fails the
 * build (because of "server-only"), so secrets can never be bundled for the browser.
 */
export const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .min(20, "looks too short to be a Supabase secret (or legacy service_role) key")
    .refine((v) => !v.startsWith("sb_publishable_"), {
      message: "is the PUBLISHABLE key. Use the secret key (Supabase → Settings → API Keys).",
    }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) throw new EnvError(formatIssues(result.error));
  return result.data;
}

export function serverEnv(): ServerEnv {
  return parseServerEnv({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
}
