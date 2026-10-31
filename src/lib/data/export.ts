import "server-only";
import type { User } from "@supabase/supabase-js";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Builds a complete JSON export of everything AVEN stores about the user in
 * Supabase. Every query runs with the USER'S session, so Row Level Security
 * guarantees nothing belonging to anyone else can be included.
 *
 * When a stage adds a new table, add it to EXPORT_TABLES (a unit test
 * cross-checks this list against the tables the database tests know about).
 */
export const EXPORT_TABLES = [
  "profiles",
  "user_preferences",
  "notification_preferences",
  "notification_category_preferences",
  "consent_state",
  "consent_records",
  "audit_log",
  "ai_usage_limits",
  "ai_usage_daily",
  "user_devices",
  "sync_receipts",
  "data_export_log",
  "financial_accounts",
  "transaction_categories",
  "transactions",
  "budgets",
  "savings_goals",
  "savings_goal_entries",
  "finance_events",
  "memory_records",
  "recommendations",
  "sui_wallets",
  "chain_imports",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

export const EXPORT_FORMAT_VERSION = "aven-export/1";

export interface AvenExport {
  format: typeof EXPORT_FORMAT_VERSION;
  generated_at: string;
  account: {
    id: string;
    email: string | null;
    created_at: string;
    email_confirmed_at: string | null;
  };
  data: Record<ExportTable, unknown[]>;
  external_stores: Record<string, string>;
  notes: string[];
}

export async function buildUserExport(supabase: ServerSupabase, user: User): Promise<AvenExport> {
  const results = await Promise.all(
    EXPORT_TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw new Error(`Export failed while reading ${table}.`);
      return [table, data ?? []] as const;
    }),
  );

  return {
    format: EXPORT_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at ?? null,
    },
    data: Object.fromEntries(results) as Record<ExportTable, unknown[]>,
    external_stores: {
      walrus_memory:
        'Memory TEXT is stored encrypted on Walrus (Mainnet) via the MemWal relayer, in a namespace private to your account. memory_records above lists every memory with its Walrus blob id; Intelligence → Walrus Memory → "Read memories back from Walrus" shows their content. The MemWal SDK cannot delete from Walrus; forgotten memories are never used again.',
      sui_mainnet:
        "AVEN stores only the public wallet addresses you added (sui_wallets) and links to on-chain transactions you imported (chain_imports). On-chain data itself lives on Sui and is read through Tatum.",
      ai_provider: "not_in_use — AVEN has not sent any data to an AI provider.",
    },
    notes: [
      "Amounts and timestamps are exported exactly as stored.",
      "Password and session data are managed by Supabase Auth and are never exported.",
      "memory_records.pending_text is only present for memories still being written; it is erased once Walrus confirms them.",
    ],
  };
}
