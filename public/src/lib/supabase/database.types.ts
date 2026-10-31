/* Row types are `type` aliases (not interfaces) because supabase-js requires
 * them to be assignable to Record<string, unknown>. */

/**
 * TypeScript types for the AVEN database (public schema).
 *
 * Written to match supabase/migrations/*. After you connect the Supabase CLI
 * you can regenerate them with:
 *   npx supabase gen types typescript --project-id <your-project-ref> > src/lib/supabase/database.types.ts
 * (Only tables, columns and functions that the app uses are typed here.)
 */

type Timestamp = string;

type Table<Row, Insert = never, Update = never> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ThemePreference = "system" | "light" | "dark";
export type DateFormatPreference = "locale" | "dmy" | "mdy" | "ymd";
export type NumberFormatPreference = "locale" | "comma_dot" | "dot_comma" | "space_comma";
export type MeasurementSystem = "metric" | "imperial";
export type ConsentCategory =
  | "ai_processing"
  | "wellbeing_data"
  | "memory_financial"
  | "memory_shared_expenses"
  | "memory_wellbeing"
  | "memory_planning"
  | "memory_interactions";
export type NotificationCategory =
  | "subscriptions"
  | "shared_expenses"
  | "budgets"
  | "savings"
  | "routines"
  | "wellbeing"
  | "planning"
  | "account_security";
export type NotificationFrequency = "immediate" | "daily_digest" | "weekly_digest" | "off";
export type SecurityEventAction =
  | "auth.signed_in"
  | "auth.signed_out"
  | "auth.signed_out_everywhere"
  | "auth.password_changed"
  | "auth.password_reset_completed"
  | "auth.email_confirmed";

export type AccountType = "cash" | "bank" | "savings" | "credit_card" | "digital_wallet" | "other";
export type TransactionKind = "income" | "expense" | "transfer";
export type CategoryKind = "income" | "expense";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type FinanceEntity =
  | "transaction"
  | "financial_account"
  | "category"
  | "budget"
  | "savings_goal"
  | "savings_goal_entry";

/* Amount columns: per-row amounts are capped at 9e15 minor units, so they are exact as
 * JSON numbers. Aggregates from views/functions are TEXT. Convert with BigInt(). */
export type FinancialAccountRow = {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  currency_code: string;
  opening_balance_minor: number;
  description: string | null;
  archived_at: Timestamp | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type TransactionCategoryRow = {
  id: string;
  user_id: string;
  kind: CategoryKind;
  name: string;
  is_default: boolean;
  archived_at: Timestamp | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type TransactionRow = {
  id: string;
  user_id: string;
  kind: TransactionKind;
  account_id: string;
  transfer_account_id: string | null;
  amount_minor: number;
  currency_code: string;
  category_id: string | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  occurred_on: string;
  attachment_ref: string | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type BudgetRow = {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  currency_code: string;
  limit_minor: number;
  alert_threshold_pct: number;
  starts_on: string;
  archived_at: Timestamp | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type SavingsGoalRow = {
  id: string;
  user_id: string;
  name: string;
  currency_code: string;
  target_minor: number;
  target_date: string | null;
  description: string | null;
  status: GoalStatus;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type SavingsGoalEntryRow = {
  id: string;
  user_id: string;
  goal_id: string;
  kind: "contribution" | "withdrawal";
  amount_minor: number;
  occurred_on: string;
  note: string | null;
  created_at: Timestamp;
};

export type FinanceEventRow = {
  id: number;
  user_id: string;
  kind:
    | "budget_threshold_reached"
    | "budget_exceeded"
    | "savings_milestone_reached"
    | "sync_failed"
    | "sync_completed";
  dedupe_key: string;
  payload: Record<string, unknown>;
  occurred_at: Timestamp;
  processed_at: Timestamp | null;
};

export type AccountBalanceRow = {
  account_id: string;
  user_id: string;
  currency_code: string;
  balance_minor: string;
  transaction_count: number;
  last_activity_on: string | null;
};

export type SavingsGoalProgressRow = {
  goal_id: string;
  user_id: string;
  saved_minor: string;
  entry_count: number;
};

export type ListedTransaction = Omit<TransactionRow, "user_id" | "attachment_ref"> & {
  account_name: string;
  transfer_account_name: string | null;
  category_name: string | null;
  total_count: number;
};

export type BudgetProgressRow = {
  budget_id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  currency_code: string;
  limit_minor: string;
  spent_minor: string;
  alert_threshold_pct: number;
  starts_on: string;
  archived: boolean;
  version: number;
};

export type MutationResult = {
  status: "applied" | "conflict" | "rejected";
  replayed?: boolean;
  reason?: "version" | "not_found" | "exists";
  message?: string;
  note?: string;
  server_version?: number;
  record?: Record<string, unknown>;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  country_code: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type UserPreferencesRow = {
  user_id: string;
  currency_code: string;
  locale: string;
  time_zone: string;
  week_start: number;
  date_format: DateFormatPreference;
  number_format: NumberFormatPreference;
  measurement_system: MeasurementSystem;
  theme: ThemePreference;
  ai_enabled: boolean;
  memory_paused: boolean;
  updated_at: Timestamp;
};

export type NotificationPreferencesRow = {
  user_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_enabled: boolean;
  weekly_digest_day: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  pause_nonessential: boolean;
  max_nudges_per_day: number;
  updated_at: Timestamp;
};

export type NotificationCategoryPreferenceRow = {
  user_id: string;
  category: NotificationCategory;
  frequency: NotificationFrequency;
  updated_at: Timestamp;
};

export type ConsentCategoryRow = {
  category: ConsentCategory;
  is_sensitive: boolean;
  is_available: boolean;
  policy_version: string;
};

export type ConsentRecordRow = {
  id: string;
  user_id: string;
  category: ConsentCategory;
  granted: boolean;
  policy_version: string;
  source: "settings" | "onboarding" | "feature_prompt";
  created_at: Timestamp;
};

export type ConsentStateRow = {
  user_id: string;
  category: ConsentCategory;
  granted: boolean;
  policy_version: string;
  updated_at: Timestamp;
};

export type AuditLogRow = {
  id: number;
  user_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
};

export type AiUsageLimitsRow = {
  user_id: string;
  daily_request_limit: number;
  monthly_token_limit: number;
  updated_at: Timestamp;
};

export type AiUsageDailyRow = {
  user_id: string;
  usage_date: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
};

export type UserDeviceRow = {
  id: string;
  user_id: string;
  label: string | null;
  platform: string | null;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  last_sync_at: Timestamp | null;
};

export type SyncReceiptRow = {
  user_id: string;
  client_mutation_id: string;
  device_id: string | null;
  entity: string;
  record_id: string;
  operation: "create" | "update" | "delete";
  result: "applied" | "conflict" | "rejected";
  server_version: number | null;
  received_at: Timestamp;
};

export type DataExportLogRow = {
  id: string;
  user_id: string;
  format: "json";
  byte_size: number;
  created_at: Timestamp;
};

export type AccountDeletionLogRow = {
  id: string;
  subject_hash: string;
  started_at: Timestamp;
  completed_at: Timestamp | null;
  outcome: "started" | "completed" | "failed";
  external_cleanup: Record<string, unknown>;
};

export type CurrencyRow = {
  code: string;
  minor_units: number;
  name: string;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      currencies: Table<CurrencyRow>;
      profiles: Table<
        ProfileRow,
        never,
        Partial<Pick<ProfileRow, "display_name" | "country_code">>
      >;
      user_preferences: Table<
        UserPreferencesRow,
        never,
        Partial<Omit<UserPreferencesRow, "user_id" | "updated_at">>
      >;
      notification_preferences: Table<
        NotificationPreferencesRow,
        never,
        Partial<
          Omit<
            NotificationPreferencesRow,
            "user_id" | "updated_at" | "email_enabled" | "push_enabled"
          >
        >
      >;
      notification_category_preferences: Table<
        NotificationCategoryPreferenceRow,
        never,
        Partial<Pick<NotificationCategoryPreferenceRow, "frequency">>
      >;
      consent_categories: Table<ConsentCategoryRow>;
      consent_records: Table<ConsentRecordRow>;
      consent_state: Table<ConsentStateRow>;
      audit_log: Table<AuditLogRow>;
      ai_usage_limits: Table<AiUsageLimitsRow>;
      ai_usage_daily: Table<AiUsageDailyRow>;
      user_devices: Table<
        UserDeviceRow,
        Pick<UserDeviceRow, "id" | "user_id"> & Partial<Pick<UserDeviceRow, "label" | "platform">>,
        Partial<Pick<UserDeviceRow, "label" | "last_seen_at" | "last_sync_at">>
      >;
      sync_receipts: Table<
        SyncReceiptRow,
        Omit<SyncReceiptRow, "received_at" | "server_version" | "device_id"> &
          Partial<Pick<SyncReceiptRow, "server_version" | "device_id">>
      >;
      data_export_log: Table<DataExportLogRow>;
      financial_accounts: Table<FinancialAccountRow>;
      transaction_categories: Table<TransactionCategoryRow>;
      transactions: Table<TransactionRow>;
      budgets: Table<BudgetRow>;
      savings_goals: Table<SavingsGoalRow>;
      savings_goal_entries: Table<SavingsGoalEntryRow>;
      finance_events: Table<FinanceEventRow>;
      account_deletion_log: Table<
        AccountDeletionLogRow,
        Pick<AccountDeletionLogRow, "subject_hash"> & Partial<AccountDeletionLogRow>,
        Partial<AccountDeletionLogRow>
      >;
    };
    Views: {
      account_balances: { Row: AccountBalanceRow; Relationships: [] };
      savings_goal_progress: { Row: SavingsGoalProgressRow; Relationships: [] };
    };
    Functions: {
      log_security_event: { Args: { p_action: SecurityEventAction }; Returns: undefined };
      set_consent: {
        Args: {
          p_category: ConsentCategory;
          p_granted: boolean;
          p_source: "settings" | "onboarding" | "feature_prompt";
        };
        Returns: undefined;
      };
      consume_rate_limit: {
        Args: { p_action: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      record_data_export: { Args: { p_format: "json"; p_byte_size: number }; Returns: undefined };
      ai_quota_status: {
        Args: Record<string, never>;
        Returns: {
          ai_enabled: boolean;
          ai_consent: boolean;
          requests_today: number;
          daily_request_limit: number;
          tokens_this_month: number;
          monthly_token_limit: number;
          allowed: boolean;
        }[];
      };
      apply_finance_mutation: {
        Args: {
          p_mutation_id: string;
          p_entity: FinanceEntity;
          p_operation: "create" | "update" | "delete";
          p_record_id: string;
          p_payload: Record<string, unknown>;
          p_base_version?: number | null;
          p_device_id?: string | null;
        };
        Returns: MutationResult;
      };
      record_sync_completed: {
        Args: { p_batch_id: string; p_applied: number };
        Returns: undefined;
      };
      finance_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          currency_code: string;
          income_minor: string;
          expense_minor: string;
          net_minor: string;
          transaction_count: number;
        }[];
      };
      spending_by_category: {
        Args: { p_from: string; p_to: string };
        Returns: {
          currency_code: string;
          category_id: string | null;
          category_name: string;
          expense_minor: string;
        }[];
      };
      monthly_cashflow: {
        Args: { p_months: number; p_today: string };
        Returns: {
          month: string;
          currency_code: string;
          income_minor: string;
          expense_minor: string;
        }[];
      };
      budget_progress: {
        Args: { p_month: string; p_include_archived?: boolean };
        Returns: BudgetProgressRow[];
      };
      budget_history: {
        Args: { p_budget_id: string; p_months: number; p_today: string };
        Returns: { month: string; spent_minor: string; limit_minor: string }[];
      };
      list_transactions: {
        Args: {
          p_q?: string | null;
          p_kind?: TransactionKind | null;
          p_account_id?: string | null;
          p_category_id?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ListedTransaction[];
      };
      record_ai_usage: {
        Args: { p_user_id: string; p_input_tokens: number; p_output_tokens: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
