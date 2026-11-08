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
  "task_categories",
  "tasks",
  "calendar_events",
  "calendar_event_exceptions",
  "habits",
  "habit_check_ins",
  "reviews",
  "planning_preferences",
  "wellbeing_preferences",
  "sleep_logs",
  "water_logs",
  "meal_logs",
  "activity_logs",
  "mood_logs",
  "life_events",
  "notifications",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/**
 * Each table's primary key, used to page through it in a stable order.
 * Supabase returns at most 1,000 rows per request, so without paging a long
 * history would be cut off silently.
 */
export const EXPORT_ORDER: Record<ExportTable, readonly string[]> = {
  profiles: ["id"],
  user_preferences: ["user_id"],
  notification_preferences: ["user_id"],
  notification_category_preferences: ["user_id", "category"],
  consent_state: ["user_id", "category"],
  consent_records: ["id"],
  audit_log: ["id"],
  ai_usage_limits: ["user_id"],
  ai_usage_daily: ["user_id", "usage_date"],
  user_devices: ["id"],
  sync_receipts: ["user_id", "client_mutation_id"],
  data_export_log: ["id"],
  financial_accounts: ["id"],
  transaction_categories: ["id"],
  transactions: ["id"],
  budgets: ["id"],
  savings_goals: ["id"],
  savings_goal_entries: ["id"],
  finance_events: ["id"],
  memory_records: ["id"],
  recommendations: ["id"],
  sui_wallets: ["id"],
  chain_imports: ["id"],
  task_categories: ["id"],
  tasks: ["id"],
  calendar_events: ["id"],
  calendar_event_exceptions: ["id"],
  habits: ["id"],
  habit_check_ins: ["id"],
  reviews: ["id"],
  planning_preferences: ["user_id"],
  wellbeing_preferences: ["user_id"],
  sleep_logs: ["id"],
  water_logs: ["id"],
  meal_logs: ["id"],
  activity_logs: ["id"],
  mood_logs: ["id"],
  life_events: ["id"],
  notifications: ["id"],
};

/** Rows per request: Supabase's default response cap. */
export const EXPORT_PAGE_SIZE = 1000;

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
    EXPORT_TABLES.map(async (table) => [table, await readAllRows(supabase, table)] as const),
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

/** Every row of one table, page by page, in primary-key order. */
async function readAllRows(supabase: ServerSupabase, table: ExportTable): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    let query = supabase.from(table).select("*");
    for (const column of EXPORT_ORDER[table]) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error) throw new Error(`Export failed while reading ${table}.`);
    rows.push(...(data ?? []));
    if (!data || data.length < EXPORT_PAGE_SIZE) return rows;
  }
}
