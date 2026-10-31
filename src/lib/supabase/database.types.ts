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
      account_deletion_log: Table<
        AccountDeletionLogRow,
        Pick<AccountDeletionLogRow, "subject_hash"> & Partial<AccountDeletionLogRow>,
        Partial<AccountDeletionLogRow>
      >;
    };
    Views: Record<string, never>;
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
      record_ai_usage: {
        Args: { p_user_id: string; p_input_tokens: number; p_output_tokens: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
