import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memwalConfig } from "@/lib/integrations/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createMemwalClient } from "./client";
import { deriveUserNamespace } from "./namespace";
import type { MemoryPolicyContext } from "./policy";
import { supabaseMemoryRepository } from "./repository";
import type { MemoryServiceDeps } from "./service";
import { MEMORY_CATEGORIES } from "./types";

export type MemoryRuntime =
  | { available: true; deps: MemoryServiceDeps; ctx: MemoryPolicyContext }
  | {
      available: false;
      reason: "not_configured" | "invalid_config";
      ctx: MemoryPolicyContext;
    };

/** Reads consent and pause state for the signed-in user (RLS-scoped client). */
export async function loadMemoryPolicyContext(
  supabase: SupabaseClient<Database>,
  backendAvailable: boolean,
): Promise<MemoryPolicyContext> {
  const [{ data: consents }, { data: prefs }] = await Promise.all([
    supabase.from("consent_state").select("category, granted"),
    supabase.from("user_preferences").select("memory_paused").maybeSingle(),
  ]);
  const granted = new Set(
    (consents ?? [])
      .filter((c) => c.granted && (MEMORY_CATEGORIES as readonly string[]).includes(c.category))
      .map((c) => c.category as string),
  );
  return {
    grantedCategories: granted,
    // Fail closed: if preferences can't be read, treat memory as paused.
    memoryPaused: prefs ? prefs.memory_paused : true,
    backendAvailable,
  };
}

/**
 * Everything needed to use Walrus Memory for ONE authenticated user.
 * `userId` must come from the verified session (getAppContext / getUser).
 */
export async function memoryRuntimeFor(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MemoryRuntime> {
  const config = memwalConfig();
  if (config.status !== "configured") {
    const ctx = await loadMemoryPolicyContext(supabase, false);
    return {
      available: false,
      reason: config.status === "invalid" ? "invalid_config" : "not_configured",
      ctx,
    };
  }
  const ctx = await loadMemoryPolicyContext(supabase, true);
  return {
    available: true,
    ctx,
    deps: {
      client: createMemwalClient(config.config),
      repo: supabaseMemoryRepository(createAdminClient()),
      namespace: deriveUserNamespace(
        config.config.namespace,
        config.config.namespaceSecret,
        userId,
      ),
    },
  };
}
