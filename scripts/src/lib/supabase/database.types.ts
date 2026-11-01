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
  | "account_security"
  | "suggestions";
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
  /** Exact response of apply_finance_mutation(), replayed for duplicate deliveries (Stage 2). */
  response: MutationResult | null;
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

/** Server-internal; users have no access (RLS on, no policies). Typed for completeness. */
export type RateLimitBucketRow = {
  bucket_key: string;
  window_start: Timestamp;
  hit_count: number;
};

export type MemoryRecordCategory =
  | "memory_financial"
  | "memory_shared_expenses"
  | "memory_wellbeing"
  | "memory_planning"
  | "memory_interactions";
export type MemoryRecordKind =
  | "recurring_expense"
  | "budgeting_style"
  | "overspending_category"
  | "savings_target"
  | "savings_performance"
  | "goal_progress"
  | "income_pattern"
  | "subscription"
  | "recommendation"
  | "recommendation_outcome"
  | "preference"
  | "habit_pattern"
  | "routine_preference"
  | "scheduling_preference"
  | "notification_preference"
  | "sleep_pattern"
  | "activity_routine"
  | "water_pattern"
  | "meal_routine"
  | "mood_pattern"
  | "wellbeing_goal"
  | "review_reflection"
  | "correction";
export type MemoryRecordStatus = "queued" | "submitted" | "stored" | "failed" | "suppressed";
export type MemoryJobStatus = "pending" | "running" | "uploaded" | "done" | "failed" | "not_found";

/** Bookkeeping for a Walrus memory. The memory TEXT lives in Walrus, not here. */
export type MemoryRecordRow = {
  id: string;
  user_id: string;
  category: MemoryRecordCategory;
  kind: MemoryRecordKind;
  label: string;
  content_hash: string;
  source_refs: Array<{ table: string; id: string }>;
  supersedes: string | null;
  status: MemoryRecordStatus;
  job_id: string | null;
  job_status: MemoryJobStatus | null;
  blob_id: string | null;
  /** Outbox copy of the text while queued/in flight; null once stored or forgotten. */
  pending_text: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  submitted_at: Timestamp | null;
  stored_at: Timestamp | null;
  suppressed_at: Timestamp | null;
};

export type SuiWalletRow = {
  id: string;
  user_id: string;
  network: "mainnet";
  address: string;
  label: string | null;
  created_at: Timestamp;
};

export type ChainImportRow = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  network: "mainnet";
  tx_digest: string;
  transaction_id: string;
  created_at: Timestamp;
};

export type ChainImportResult =
  | { status: "imported"; transaction_id: string }
  | { status: "duplicate_digest"; transaction_id: string }
  | {
      status: "possible_duplicate";
      matches: Array<{
        id: string;
        occurred_on: string;
        amount_minor: number;
        description: string | null;
      }>;
    }
  | { status: "rejected"; message: string };

export type RecommendationKind =
  | "reduce_category_spend"
  | "set_category_budget"
  | "increase_savings"
  | "review_subscription"
  | "goal_contribution";
export type RecommendationStatus = "open" | "accepted" | "rejected" | "modified";

export type MemoryInfluence = {
  blob_id: string;
  memory: string;
  effect: string;
};

export type RecommendationRow = {
  id: string;
  user_id: string;
  kind: RecommendationKind;
  dedupe_key: string;
  period: string;
  title: string;
  explanation: string;
  currency_code: string;
  suggested_minor: number | null;
  category_id: string | null;
  goal_id: string | null;
  evidence: Record<string, unknown>;
  memory_influence: MemoryInfluence[];
  status: RecommendationStatus;
  response_minor: number | null;
  response_note: string | null;
  responded_at: Timestamp | null;
  outcome_memory_id: string | null;
  created_at: Timestamp;
};

/* ------------------------------------------------------------------ Stage 5 */

export type TaskStatus = "not_started" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type EventCategory =
  "personal" | "work" | "health" | "finance" | "social" | "learning" | "other";
export type Recurrence = "daily" | "weekly" | "monthly" | "yearly";
export type HabitCategory =
  | "health"
  | "fitness"
  | "mind"
  | "learning"
  | "finance"
  | "sleep"
  | "hydration"
  | "routine"
  | "other";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type ActivityType =
  "walking" | "running" | "cycling" | "gym" | "swimming" | "sports" | "home_workout" | "other";
export type Intensity = "light" | "moderate" | "vigorous";
export type LifeEntity =
  | "task_category"
  | "task"
  | "calendar_event"
  | "calendar_event_exception"
  | "habit"
  | "habit_check_in"
  | "review"
  | "sleep_log"
  | "water_log"
  | "meal_log"
  | "activity_log"
  | "mood_log";

export type TaskCategoryRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  name: string;
  archived_at: Timestamp | null;
};

export type TaskRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category_id: string | null;
  due_on: string | null;
  due_time: string | null;
  remind_at: Timestamp | null;
  completed_at: Timestamp | null;
};

export type CalendarEventRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  all_day: boolean;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  start_date: string | null;
  end_date: string | null;
  time_zone: string;
  recurrence: Recurrence | null;
  recurrence_interval: number;
  recurrence_weekdays: number[] | null;
  recurrence_until: string | null;
  reminder_minutes: number | null;
};

export type CalendarEventExceptionRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  event_id: string;
  occurrence_date: string;
  cancelled: boolean;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  title: string | null;
};

export type HabitRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: HabitCategory;
  frequency: "daily" | "specific_days";
  weekdays: number[] | null;
  start_on: string;
  end_on: string | null;
  reminder_time: string | null;
  time_zone: string;
  archived_at: Timestamp | null;
};

export type HabitCheckInRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  habit_id: string;
  on_date: string;
  status: "done" | "skipped";
  note: string | null;
};

export type ReviewRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  kind: "daily" | "weekly";
  period_start: string;
  highlights: string | null;
  missed: string | null;
  next_focus: string | null;
  notes: string | null;
  rating: number | null;
};

export type PlanningPreferencesRow = {
  user_id: string;
  daily_review_enabled: boolean;
  daily_review_time: string;
  weekly_review_enabled: boolean;
  weekly_review_day: number;
  weekly_review_time: string;
  weekly_finance_review: boolean;
  updated_at: Timestamp;
};

export type WellbeingPreferencesRow = {
  user_id: string;
  water_unit: "ml" | "l" | "fl_oz";
  water_target_ml: number;
  distance_unit: "km" | "mi";
  sleep_target_minutes: number;
  updated_at: Timestamp;
};

export type SleepLogRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  slept_at: Timestamp;
  woke_at: Timestamp;
  wake_date: string;
  duration_minutes: number;
  quality: number | null;
  note: string | null;
};

export type WaterLogRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: Timestamp;
  local_date: string;
};

export type MealLogRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  meal_type: MealType;
  description: string;
  eaten_at: Timestamp;
  local_date: string;
  note: string | null;
};

export type ActivityLogRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  activity_type: ActivityType;
  duration_minutes: number;
  distance_m: number | null;
  intensity: Intensity | null;
  on_date: string;
  note: string | null;
};

export type MoodLogRow = {
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  id: string;
  user_id: string;
  logged_at: Timestamp;
  local_date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleep_rating: number | null;
  day_rating: number | null;
  note: string | null;
  source: "wellbeing" | "pulse_check";
};

export type LifeEventRow = {
  id: number;
  user_id: string;
  kind:
    "task_completed" | "habit_checked_in" | "review_saved" | "wellbeing_logged" | "event_scheduled";
  dedupe_key: string;
  payload: Record<string, unknown>;
  occurred_at: Timestamp;
  processed_at: Timestamp | null;
};

export type NotificationKind =
  | "task_reminder"
  | "task_due"
  | "event_reminder"
  | "habit_reminder"
  | "habit_missed"
  | "habit_streak"
  | "review_due"
  | "daily_summary"
  | "weekly_summary"
  | "budget_threshold"
  | "budget_exceeded"
  | "savings_milestone"
  | "suggestion";

export type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  priority: "low" | "normal" | "high";
  title: string;
  body: string | null;
  action_url: string | null;
  related_type: string | null;
  related_id: string | null;
  dedupe_key: string;
  status: "delivered" | "scheduled" | "bundled" | "suppressed";
  decision_reason: string | null;
  digest: "daily" | "weekly" | null;
  scheduled_for: Timestamp | null;
  delivered_at: Timestamp | null;
  read_at: Timestamp | null;
  dismissed_at: Timestamp | null;
  expires_at: Timestamp | null;
  created_at: Timestamp;
};

export type SchedulerRunRow = {
  id: number;
  trigger_source: "cron" | "github_actions" | "vercel_cron" | "manual" | "catch_up";
  started_at: Timestamp;
  finished_at: Timestamp | null;
  users_processed: number;
  notifications_created: number;
  error: string | null;
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
      // Written only by apply_finance_mutation() since Stage 2 — no client inserts.
      sync_receipts: Table<SyncReceiptRow>;
      data_export_log: Table<DataExportLogRow>;
      rate_limit_buckets: Table<RateLimitBucketRow>;
      financial_accounts: Table<FinancialAccountRow>;
      transaction_categories: Table<TransactionCategoryRow>;
      transactions: Table<TransactionRow>;
      budgets: Table<BudgetRow>;
      savings_goals: Table<SavingsGoalRow>;
      savings_goal_entries: Table<SavingsGoalEntryRow>;
      // processed_at is set only by the server scheduler (admin).
      finance_events: Table<FinanceEventRow, never, Partial<Pick<FinanceEventRow, "processed_at">>>;
      // Written only by the AVEN server (admin client) after talking to MemWal.
      memory_records: Table<
        MemoryRecordRow,
        Pick<MemoryRecordRow, "user_id" | "category" | "kind" | "label" | "content_hash"> &
          Partial<MemoryRecordRow>,
        Partial<MemoryRecordRow>
      >;
      sui_wallets: Table<
        SuiWalletRow,
        Pick<SuiWalletRow, "user_id" | "address"> & Partial<Pick<SuiWalletRow, "label">>,
        Partial<Pick<SuiWalletRow, "label">>
      >;
      // Written only by import_chain_transaction().
      chain_imports: Table<ChainImportRow>;
      recommendations: Table<
        RecommendationRow,
        Pick<
          RecommendationRow,
          "user_id" | "kind" | "dedupe_key" | "period" | "title" | "explanation" | "currency_code"
        > &
          Partial<
            Pick<
              RecommendationRow,
              "suggested_minor" | "category_id" | "goal_id" | "evidence" | "memory_influence"
            >
          >,
        // Only the server (admin) links the outcome memory; responses use the RPC.
        Partial<Pick<RecommendationRow, "outcome_memory_id">>
      >;
      task_categories: Table<TaskCategoryRow>;
      tasks: Table<TaskRow>;
      calendar_events: Table<CalendarEventRow>;
      calendar_event_exceptions: Table<CalendarEventExceptionRow>;
      habits: Table<HabitRow>;
      habit_check_ins: Table<HabitCheckInRow>;
      reviews: Table<ReviewRow>;
      planning_preferences: Table<
        PlanningPreferencesRow,
        Pick<PlanningPreferencesRow, "user_id"> &
          Partial<Omit<PlanningPreferencesRow, "updated_at">>,
        Partial<Omit<PlanningPreferencesRow, "user_id" | "updated_at">>
      >;
      wellbeing_preferences: Table<
        WellbeingPreferencesRow,
        Pick<WellbeingPreferencesRow, "user_id"> &
          Partial<Omit<WellbeingPreferencesRow, "updated_at">>,
        Partial<Omit<WellbeingPreferencesRow, "user_id" | "updated_at">>
      >;
      sleep_logs: Table<SleepLogRow>;
      water_logs: Table<WaterLogRow>;
      meal_logs: Table<MealLogRow>;
      activity_logs: Table<ActivityLogRow>;
      mood_logs: Table<MoodLogRow>;
      life_events: Table<LifeEventRow, never, Partial<Pick<LifeEventRow, "processed_at">>>;
      // Written by the server scheduler; users may only set read_at / dismissed_at.
      notifications: Table<
        NotificationRow,
        Omit<NotificationRow, "id" | "created_at" | "read_at" | "dismissed_at"> &
          Partial<Pick<NotificationRow, "id">>,
        Partial<NotificationRow>
      >;
      scheduler_runs: Table<
        SchedulerRunRow,
        Pick<SchedulerRunRow, "trigger_source">,
        Partial<SchedulerRunRow>
      >;
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
      import_chain_transaction: {
        Args: {
          p_mutation_id: string;
          p_wallet_id: string;
          p_tx_digest: string;
          p_transaction_id: string;
          p_payload: Record<string, unknown>;
          p_confirm_duplicate?: boolean;
        };
        Returns: ChainImportResult;
      };
      respond_to_recommendation: {
        Args: {
          p_id: string;
          p_action: "accepted" | "rejected" | "modified";
          p_value_minor?: number | null;
          p_note?: string | null;
        };
        Returns: RecommendationRow;
      };
      apply_life_mutation: {
        Args: {
          p_mutation_id: string;
          p_entity: LifeEntity;
          p_operation: "create" | "update" | "delete";
          p_record_id: string;
          p_payload: Record<string, unknown>;
          p_base_version?: number | null;
          p_device_id?: string | null;
        };
        Returns: MutationResult;
      };
      scheduler_status: {
        Args: Record<string, never>;
        Returns: Array<{ last_run_at: string; last_run_ok: boolean }>;
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
