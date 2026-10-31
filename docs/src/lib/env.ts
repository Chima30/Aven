import { z } from "zod";

/**
 * Environment validation.
 *
 * Public variables (NEXT_PUBLIC_*) are embedded in browser code at build time,
 * so they must never contain secrets. Server-only variables live in
 * src/lib/env.server.ts, which cannot be imported by client components.
 */

const supabasePublicKey = z
  .string()
  .min(20, "looks too short to be a Supabase publishable (or legacy anon) key")
  .refine((v) => !v.startsWith("sb_secret_"), {
    message:
      "is a SECRET key. Use the publishable key here; secret keys must never reach the browser.",
  });

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url("must be a full URL such as https://abcd1234.supabase.co")
    .refine((v) => /^https:\/\//.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(v), {
      message: "must use https:// (http is only allowed for localhost)",
    }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublicKey,
  NEXT_PUBLIC_SITE_URL: z
    .url("must be the full address of the site, e.g. https://aven.vercel.app")
    .transform((v) => v.replace(/\/+$/, "")),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class EnvError extends Error {
  constructor(issues: string[]) {
    super(
      `AVEN is missing or has invalid environment variables:\n${issues
        .map((i) => `  • ${i}`)
        .join("\n")}\nSee docs/ENVIRONMENT.md for where to find each value.`,
    );
    this.name = "EnvError";
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`);
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) throw new EnvError(formatIssues(result.error));
  return result.data;
}

let cached: PublicEnv | undefined;

/**
 * Read public env. Next.js only inlines NEXT_PUBLIC_* values when they are
 * referenced literally, so each one is listed explicitly here.
 */
export function publicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cached;
}
