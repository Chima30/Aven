"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  AmountError,
  decimalSeparatorFor,
  parsePositiveAmount,
  parseSignedAmount,
} from "@/lib/finance/amount-input";
import { applyMutation, type MutationInput } from "@/lib/finance/mutate";
import {
  accountCreateSchema,
  accountUpdateSchema,
  budgetCreateSchema,
  budgetUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  goalCreateSchema,
  goalEntrySchema,
  goalUpdateSchema,
} from "@/lib/finance/schemas";
import { formValue, type FormState } from "@/lib/forms";
import { isCurrencyCode, type CurrencyCode } from "@/lib/money/currencies";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/schemas";

/*
 * Server Actions for accounts, categories, budgets and savings goals.
 * Transactions are NOT here: they go through the offline outbox and /api/sync.
 *
 * Every action: verifies the session → validates with Zod → calls the single
 * database write path (apply_finance_mutation) with the user's own session.
 */

const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};
const OFFLINE_OR_FAILED: FormState = {
  status: "error",
  message: "We couldn't reach the server. Check your connection and try again.",
};

async function context() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("locale, number_format")
    .eq("user_id", user.id)
    .single();
  const decimal = prefs ? decimalSeparatorFor(prefs.locale, prefs.number_format) : ".";
  return { user, supabase, decimal };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof context>>>;

async function run(
  ctx: Ctx,
  input: Omit<MutationInput, "mutationId">,
  success: string,
  paths: string[],
): Promise<FormState> {
  if (!(await consumeRateLimit(ctx.supabase, "finance_write"))) {
    return {
      status: "error",
      message: "You're making changes very quickly. Please wait a minute.",
    };
  }
  let result;
  try {
    result = await applyMutation(ctx.supabase, { ...input, mutationId: randomUUID() });
  } catch {
    return OFFLINE_OR_FAILED;
  }
  if (result.status === "applied") {
    for (const p of paths) revalidatePath(p);
    return { status: "success", message: success };
  }
  if (result.status === "conflict" && result.reason === "version") {
    return {
      status: "error",
      message:
        "This was changed on another device or tab. Reload the page to see the latest version, then try again.",
    };
  }
  return { status: "error", message: result.message ?? "That change couldn't be saved." };
}

function amountError(field: string, error: unknown): FormState {
  return {
    status: "error",
    fieldErrors: {
      [field]: error instanceof AmountError ? error.message : "Enter a valid amount.",
    },
  };
}

function zodErrors(error: z.ZodError): FormState {
  return { status: "error", fieldErrors: fieldErrors(error) };
}

const currencyOf = (formData: FormData): CurrencyCode | null => {
  const c = formValue(formData, "currency_code");
  return isCurrencyCode(c) ? c : null;
};

const version = (formData: FormData) => Number(formValue(formData, "version")) || null;

// ----------------------------------------------------------------- accounts --

export async function createAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const currency = currencyOf(formData);
  if (!currency)
    return { status: "error", fieldErrors: { currency_code: "Choose a supported currency." } };
  let opening: bigint;
  try {
    opening = parseSignedAmount(
      formValue(formData, "opening_balance"),
      currency,
      ctx.decimal,
    ).amountMinor;
  } catch (e) {
    return amountError("opening_balance", e);
  }
  const parsed = accountCreateSchema.safeParse({
    name: formValue(formData, "name"),
    account_type: formValue(formData, "account_type"),
    currency_code: currency,
    opening_balance_minor: opening.toString(),
    description: formValue(formData, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const id = randomUUID();
  const state = await run(
    ctx,
    { entity: "financial_account", operation: "create", recordId: id, payload: parsed.data },
    "Account created.",
    ["/money", "/money/accounts"],
  );
  if (state.status === "success") redirect(`/money/accounts/${id}?created=1`);
  return state;
}

export async function updateAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const id = formValue(formData, "id");
  const currency = currencyOf(formData);
  if (!currency) return { status: "error", message: "Unknown account currency." };
  let opening: bigint;
  try {
    opening = parseSignedAmount(
      formValue(formData, "opening_balance"),
      currency,
      ctx.decimal,
    ).amountMinor;
  } catch (e) {
    return amountError("opening_balance", e);
  }
  const parsed = accountUpdateSchema.safeParse({
    name: formValue(formData, "name"),
    account_type: formValue(formData, "account_type"),
    opening_balance_minor: opening.toString(),
    description: formValue(formData, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  return run(
    ctx,
    {
      entity: "financial_account",
      operation: "update",
      recordId: id,
      payload: parsed.data,
      baseVersion: version(formData),
    },
    "Account updated.",
    ["/money", "/money/accounts", `/money/accounts/${id}`],
  );
}

export async function setAccountArchivedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const id = formValue(formData, "id");
  const archived = formValue(formData, "archived") === "true";
  return run(
    ctx,
    {
      entity: "financial_account",
      operation: "update",
      recordId: id,
      payload: { archived },
      baseVersion: version(formData),
    },
    archived ? "Account archived." : "Account restored.",
    ["/money", "/money/accounts", `/money/accounts/${id}`],
  );
}

// --------------------------------------------------------------- categories --

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const parsed = categoryCreateSchema.safeParse({
    kind: formValue(formData, "kind"),
    name: formValue(formData, "name"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  return run(
    ctx,
    { entity: "category", operation: "create", recordId: randomUUID(), payload: parsed.data },
    "Category added.",
    ["/money/categories"],
  );
}

export async function updateCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const archivedRaw = formValue(formData, "archived");
  const parsed = categoryUpdateSchema.safeParse({
    name: formValue(formData, "name") || undefined,
    archived: archivedRaw === "" ? undefined : archivedRaw === "true",
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const msg =
    parsed.data.archived === true
      ? "Category archived."
      : parsed.data.archived === false
        ? "Category restored."
        : "Category renamed.";
  return run(
    ctx,
    {
      entity: "category",
      operation: "update",
      recordId: formValue(formData, "id"),
      payload: parsed.data,
      baseVersion: version(formData),
    },
    msg,
    ["/money/categories"],
  );
}

// ------------------------------------------------------------------ budgets --

export async function createBudgetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const currency = currencyOf(formData);
  if (!currency)
    return { status: "error", fieldErrors: { currency_code: "Choose a supported currency." } };
  let limit: bigint;
  try {
    limit = parsePositiveAmount(formValue(formData, "limit"), currency, ctx.decimal).amountMinor;
  } catch (e) {
    return amountError("limit", e);
  }
  const parsed = budgetCreateSchema.safeParse({
    name: formValue(formData, "name"),
    category_id: formValue(formData, "category_id") || null,
    currency_code: currency,
    limit_minor: limit.toString(),
    alert_threshold_pct: formValue(formData, "alert_threshold_pct") || 80,
    starts_on: `${formValue(formData, "starts_month")}-01`,
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const id = randomUUID();
  const state = await run(
    ctx,
    { entity: "budget", operation: "create", recordId: id, payload: parsed.data },
    "Budget created.",
    ["/money", "/money/budgets"],
  );
  if (state.status === "success") redirect(`/money/budgets/${id}?created=1`);
  if (state.message?.includes("already exists")) {
    return {
      status: "error",
      message: "You already have an active budget for this category and currency.",
    };
  }
  return state;
}

export async function updateBudgetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const id = formValue(formData, "id");
  const currency = currencyOf(formData);
  if (!currency) return { status: "error", message: "Unknown budget currency." };
  let limit: bigint;
  try {
    limit = parsePositiveAmount(formValue(formData, "limit"), currency, ctx.decimal).amountMinor;
  } catch (e) {
    return amountError("limit", e);
  }
  const parsed = budgetUpdateSchema.safeParse({
    name: formValue(formData, "name"),
    limit_minor: limit.toString(),
    alert_threshold_pct: formValue(formData, "alert_threshold_pct"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  return run(
    ctx,
    {
      entity: "budget",
      operation: "update",
      recordId: id,
      payload: parsed.data,
      baseVersion: version(formData),
    },
    "Budget updated.",
    ["/money", "/money/budgets", `/money/budgets/${id}`],
  );
}

export async function setBudgetArchivedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const id = formValue(formData, "id");
  const archived = formValue(formData, "archived") === "true";
  return run(
    ctx,
    {
      entity: "budget",
      operation: "update",
      recordId: id,
      payload: { archived },
      baseVersion: version(formData),
    },
    archived ? "Budget archived." : "Budget restored.",
    ["/money", "/money/budgets", `/money/budgets/${id}`],
  );
}

// -------------------------------------------------------------------- goals --

export async function createGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const currency = currencyOf(formData);
  if (!currency)
    return { status: "error", fieldErrors: { currency_code: "Choose a supported currency." } };
  let target: bigint;
  let starting: bigint | null = null;
  try {
    target = parsePositiveAmount(formValue(formData, "target"), currency, ctx.decimal).amountMinor;
  } catch (e) {
    return amountError("target", e);
  }
  if (formValue(formData, "starting").trim()) {
    try {
      starting = parsePositiveAmount(
        formValue(formData, "starting"),
        currency,
        ctx.decimal,
      ).amountMinor;
    } catch (e) {
      return amountError("starting", e);
    }
  }
  const parsed = goalCreateSchema.safeParse({
    name: formValue(formData, "name"),
    currency_code: currency,
    target_minor: target.toString(),
    target_date: formValue(formData, "target_date") || null,
    description: formValue(formData, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const id = randomUUID();
  const state = await run(
    ctx,
    { entity: "savings_goal", operation: "create", recordId: id, payload: parsed.data },
    "Goal created.",
    ["/money", "/money/goals"],
  );
  if (state.status !== "success") return state;
  if (starting) {
    const entry = goalEntrySchema.parse({
      goal_id: id,
      kind: "contribution",
      amount_minor: starting.toString(),
      occurred_on: formValue(formData, "today"),
      note: "Starting amount",
    });
    await run(
      ctx,
      { entity: "savings_goal_entry", operation: "create", recordId: randomUUID(), payload: entry },
      "",
      [],
    );
  }
  redirect(`/money/goals/${id}?created=1`);
}

export async function updateGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const id = formValue(formData, "id");
  const currency = currencyOf(formData);
  if (!currency) return { status: "error", message: "Unknown goal currency." };
  let target: bigint;
  try {
    target = parsePositiveAmount(formValue(formData, "target"), currency, ctx.decimal).amountMinor;
  } catch (e) {
    return amountError("target", e);
  }
  const parsed = goalUpdateSchema.safeParse({
    name: formValue(formData, "name"),
    target_minor: target.toString(),
    target_date: formValue(formData, "target_date") || null,
    description: formValue(formData, "description"),
    status: formValue(formData, "status"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  return run(
    ctx,
    {
      entity: "savings_goal",
      operation: "update",
      recordId: id,
      payload: parsed.data,
      baseVersion: version(formData),
    },
    "Goal updated.",
    ["/money", "/money/goals", `/money/goals/${id}`],
  );
}

export async function addGoalEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const goalId = formValue(formData, "goal_id");
  const currency = currencyOf(formData);
  if (!currency) return { status: "error", message: "Unknown goal currency." };
  let amount: bigint;
  try {
    amount = parsePositiveAmount(formValue(formData, "amount"), currency, ctx.decimal).amountMinor;
  } catch (e) {
    return amountError("amount", e);
  }
  const parsed = goalEntrySchema.safeParse({
    goal_id: goalId,
    kind: formValue(formData, "kind"),
    amount_minor: amount.toString(),
    occurred_on: formValue(formData, "occurred_on"),
    note: formValue(formData, "note"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  return run(
    ctx,
    {
      entity: "savings_goal_entry",
      operation: "create",
      recordId: randomUUID(),
      payload: parsed.data,
    },
    parsed.data.kind === "contribution" ? "Contribution recorded." : "Withdrawal recorded.",
    ["/money", "/money/goals", `/money/goals/${goalId}`],
  );
}

export async function deleteGoalEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return SESSION_EXPIRED;
  const goalId = formValue(formData, "goal_id");
  return run(
    ctx,
    {
      entity: "savings_goal_entry",
      operation: "delete",
      recordId: formValue(formData, "id"),
      payload: {},
    },
    "Entry removed.",
    ["/money", "/money/goals", `/money/goals/${goalId}`],
  );
}
