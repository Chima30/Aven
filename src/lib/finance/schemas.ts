import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { MAX_AMOUNT_MINOR } from "./constants";
import { isValidIsoDate } from "./periods";

/*
 * Wire-format schemas for finance mutations. The same schemas validate data
 * in the browser (before queueing) and on the server (before the database
 * call). The database then enforces its own constraints a third time.
 *
 * Amounts travel as strings of minor units ("125050") so they stay exact.
 */

const uuid = z.uuid();
const currency = z.enum(CURRENCY_CODES as [string, ...string[]]);
const isoDate = z.string().refine(isValidIsoDate, "Use a valid date.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Parse an integer string to bigint, or null if it isn't one (never throws). */
const toBig = (v: string): bigint | null => (/^-?\d{1,16}$/.test(v) ? BigInt(v) : null);

const positiveMinor = z
  .string()
  .regex(/^\d{1,16}$/, "Invalid amount.")
  .refine((v) => (toBig(v) ?? 0n) > 0n, "The amount must be more than zero.")
  .refine((v) => (toBig(v) ?? 0n) <= MAX_AMOUNT_MINOR, "That amount is too large.");

const signedMinor = z
  .string()
  .regex(/^-?\d{1,16}$/, "Invalid amount.")
  .refine((v) => {
    const n = toBig(v) ?? 0n;
    return (n < 0n ? -n : n) <= MAX_AMOUNT_MINOR;
  }, "That amount is too large.");

export const transactionPayloadSchema = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    account_id: uuid,
    transfer_account_id: uuid.nullish().transform((v) => v ?? null),
    amount_minor: positiveMinor,
    currency_code: currency,
    category_id: uuid.nullish().transform((v) => v ?? null),
    description: optionalText(200),
    merchant: optionalText(120),
    notes: optionalText(1000),
    occurred_on: isoDate,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "transfer") {
      if (!v.transfer_account_id) {
        ctx.addIssue({
          code: "custom",
          path: ["transfer_account_id"],
          message: "Choose the account to transfer to.",
        });
      } else if (v.transfer_account_id === v.account_id) {
        ctx.addIssue({
          code: "custom",
          path: ["transfer_account_id"],
          message: "Choose a different account.",
        });
      }
      if (v.category_id) {
        ctx.addIssue({
          code: "custom",
          path: ["category_id"],
          message: "Transfers don't have a category.",
        });
      }
    } else if (v.transfer_account_id) {
      ctx.addIssue({
        code: "custom",
        path: ["transfer_account_id"],
        message: "Only transfers have a destination.",
      });
    }
  });

export type TransactionPayload = z.infer<typeof transactionPayloadSchema>;

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(80),
  account_type: z.enum(["cash", "bank", "savings", "credit_card", "digital_wallet", "other"]),
  currency_code: currency,
  opening_balance_minor: signedMinor,
  description: optionalText(500),
});

export const accountUpdateSchema = accountCreateSchema.omit({ currency_code: true }).extend({
  archived: z.boolean().optional(),
});

export const categoryCreateSchema = z.object({
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Give the category a name.").max(50),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  archived: z.boolean().optional(),
});

export const budgetCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the budget a name.").max(80),
  category_id: uuid.nullish().transform((v) => v ?? null),
  currency_code: currency,
  limit_minor: positiveMinor,
  alert_threshold_pct: z.coerce.number().int().min(1).max(100),
  starts_on: isoDate,
});

export const budgetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  limit_minor: positiveMinor.optional(),
  alert_threshold_pct: z.coerce.number().int().min(1).max(100).optional(),
  archived: z.boolean().optional(),
});

export const goalCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the goal a name.").max(80),
  currency_code: currency,
  target_minor: positiveMinor,
  target_date: isoDate.nullish().transform((v) => v ?? null),
  description: optionalText(500),
});

export const goalUpdateSchema = goalCreateSchema.omit({ currency_code: true }).extend({
  status: z.enum(["active", "paused", "completed", "archived"]),
});

export const goalEntrySchema = z.object({
  goal_id: uuid,
  kind: z.enum(["contribution", "withdrawal"]),
  amount_minor: positiveMinor,
  occurred_on: isoDate,
  note: optionalText(200),
});

/** One queued offline mutation as sent to /api/sync. Only transactions sync offline. */
export const syncMutationSchema = z.discriminatedUnion("operation", [
  z.object({
    mutationId: uuid,
    entity: z.literal("transaction"),
    operation: z.literal("create"),
    recordId: uuid,
    baseVersion: z.null(),
    payload: transactionPayloadSchema,
  }),
  z.object({
    mutationId: uuid,
    entity: z.literal("transaction"),
    operation: z.literal("update"),
    recordId: uuid,
    baseVersion: z.number().int().positive(),
    payload: transactionPayloadSchema,
  }),
  z.object({
    mutationId: uuid,
    entity: z.literal("transaction"),
    operation: z.literal("delete"),
    recordId: uuid,
    baseVersion: z.number().int().positive(),
    payload: z.object({}).passthrough(),
  }),
]);

export const MAX_SYNC_BATCH = 25;

/** The batch envelope. Each mutation is validated separately, so one bad entry can't block the rest. */
export const syncRequestSchema = z.object({
  batchId: uuid,
  deviceId: uuid.nullable(),
  /** Number of mutations in this batch that were created while offline. */
  offlineCount: z.number().int().min(0).max(MAX_SYNC_BATCH),
  mutations: z.array(z.unknown()).min(1).max(MAX_SYNC_BATCH),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;
