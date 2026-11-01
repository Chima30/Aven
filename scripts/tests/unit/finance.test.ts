import { describe, expect, it } from "vitest";
import {
  AmountError,
  decimalSeparatorFor,
  minorToInput,
  normalizeAmountInput,
  parsePositiveAmount,
  parseSignedAmount,
} from "@/lib/finance/amount-input";
import { formatMinor, percentOf } from "@/lib/finance/format";
import { isValidIsoDate, localToday, periodRange } from "@/lib/finance/periods";
import {
  effectOn,
  pendingDelta,
  projectBalances,
  type TransactionOutboxEntry,
} from "@/lib/finance/projection";
import { syncMutationSchema, transactionPayloadSchema } from "@/lib/finance/schemas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const payload = (over: Record<string, unknown> = {}) => ({
  kind: "expense",
  account_id: A,
  transfer_account_id: null,
  amount_minor: "1250",
  currency_code: "NGN",
  category_id: null,
  description: "Lunch",
  merchant: null,
  notes: null,
  occurred_on: "2026-11-05",
  ...over,
});

describe("amount entry", () => {
  it("understands the user's decimal separator", () => {
    expect(decimalSeparatorFor("en-US", "locale")).toBe(".");
    expect(decimalSeparatorFor("de-DE", "locale")).toBe(",");
    expect(decimalSeparatorFor("en-US", "dot_comma")).toBe(",");
    expect(normalizeAmountInput("1,234.50", ".")).toBe("1234.50");
    expect(normalizeAmountInput("1.234,50", ",")).toBe("1234.50");
    expect(normalizeAmountInput("₦ 12 500", ".")).toBe("12500");
  });

  it("parses into exact minor units for each currency precision", () => {
    expect(parsePositiveAmount("12.50", "USD").amountMinor).toBe(1250n);
    expect(parsePositiveAmount("1500", "JPY").amountMinor).toBe(1500n);
    expect(parsePositiveAmount("1,250", "KWD", ",").amountMinor).toBe(1250n);
    expect(parsePositiveAmount("0.001", "KWD").amountMinor).toBe(1n);
  });

  it("refuses zero, negative, over-precise and huge amounts with friendly messages", () => {
    expect(() => parsePositiveAmount("0", "USD")).toThrow("more than zero");
    expect(() => parsePositiveAmount("-5", "USD")).toThrow(AmountError);
    expect(() => parsePositiveAmount("10.5", "JPY")).toThrow("can't have decimals");
    expect(() => parsePositiveAmount("1.2345", "KWD")).toThrow("at most 3 decimal places");
    expect(() => parsePositiveAmount("100000000000000", "USD")).toThrow("too large");
    expect(() => parsePositiveAmount("", "USD")).toThrow("Enter an amount");
  });

  it("allows negative opening balances", () => {
    expect(parseSignedAmount("-150.25", "USD").amountMinor).toBe(-15025n);
    expect(parseSignedAmount("", "USD").amountMinor).toBe(0n);
  });

  it("round-trips stored amounts back into the edit field", () => {
    expect(minorToInput(125050, "NGN")).toBe("1250.50");
    expect(minorToInput("125050", "NGN", ",")).toBe("1250,50");
    expect(minorToInput(1500, "JPY")).toBe("1500");
    expect(minorToInput(-1250, "KWD")).toBe("-1.250");
  });
});

describe("formatting helpers", () => {
  it("formats minor units from strings without precision loss", () => {
    expect(formatMinor("8999999999999999", "USD", "en-US")).toBe("$89,999,999,999,999.99");
  });
  it("computes percentages with bigint safety", () => {
    expect(percentOf(80n, 100n)).toBe(80);
    expect(percentOf(1n, 3n)).toBe(33.3);
    expect(percentOf(150n, 100n)).toBe(150);
    expect(percentOf(5n, 0n)).toBe(0);
  });
});

describe("periods", () => {
  it("builds ranges from the user's local date", () => {
    expect(periodRange("this_month", "2026-02-14")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(periodRange("last_month", "2026-01-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(periodRange("last_3_months", "2026-03-31")).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(periodRange("this_year", "2026-07-01")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(periodRange("last_12_months", "2026-11-05")).toEqual({
      from: "2025-12-01",
      to: "2026-11-30",
    });
  });
  it("uses the time zone for 'today'", () => {
    const instant = new Date("2026-11-05T23:30:00Z");
    expect(localToday("Africa/Lagos", instant)).toBe("2026-11-06");
    expect(localToday("America/New_York", instant)).toBe("2026-11-05");
  });
  it("validates ISO dates strictly", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-1-5")).toBe(false);
  });
});

describe("transaction validation", () => {
  it("accepts a valid expense and normalises empty text to null", () => {
    const r = transactionPayloadSchema.parse(payload({ merchant: "", notes: "  " }));
    expect(r.merchant).toBeNull();
    expect(r.notes).toBeNull();
  });

  it.each([
    ["zero amount", { amount_minor: "0" }],
    ["negative amount", { amount_minor: "-5" }],
    ["decimal in minor units", { amount_minor: "12.5" }],
    ["amount above the cap", { amount_minor: "9000000000000001" }],
    ["unknown currency", { currency_code: "XYZ" }],
    ["bad date", { occurred_on: "2026-13-01" }],
    ["transfer without destination", { kind: "transfer" }],
    ["transfer to the same account", { kind: "transfer", transfer_account_id: A }],
    ["transfer with a category", { kind: "transfer", transfer_account_id: B, category_id: C }],
    ["destination on an expense", { transfer_account_id: B }],
    ["description too long", { description: "x".repeat(201) }],
    ["not a uuid", { account_id: "abc" }],
  ])("rejects %s", (_label, over) => {
    expect(transactionPayloadSchema.safeParse(payload(over)).success).toBe(false);
  });

  it("requires a base version for updates and deletes, and none for creates", () => {
    const base = { mutationId: C, entity: "transaction", recordId: B };
    expect(
      syncMutationSchema.safeParse({
        ...base,
        operation: "create",
        baseVersion: null,
        payload: payload(),
      }).success,
    ).toBe(true);
    expect(
      syncMutationSchema.safeParse({
        ...base,
        operation: "update",
        baseVersion: null,
        payload: payload(),
      }).success,
    ).toBe(false);
    expect(
      syncMutationSchema.safeParse({ ...base, operation: "delete", baseVersion: 2, payload: {} })
        .success,
    ).toBe(true);
    expect(
      syncMutationSchema.safeParse({
        ...base,
        entity: "budget",
        operation: "create",
        baseVersion: null,
        payload: payload(),
      }).success,
    ).toBe(false);
  });
});

describe("balance effects and projections", () => {
  it("applies income, expense and both sides of a transfer", () => {
    expect(
      effectOn(
        { kind: "income", account_id: A, transfer_account_id: null, amount_minor: "100" },
        A,
      ),
    ).toBe(100n);
    expect(
      effectOn({ kind: "expense", account_id: A, transfer_account_id: null, amount_minor: 100 }, A),
    ).toBe(-100n);
    const t = {
      kind: "transfer" as const,
      account_id: A,
      transfer_account_id: B,
      amount_minor: "40",
    };
    expect(effectOn(t, A)).toBe(-40n);
    expect(effectOn(t, B)).toBe(40n);
    expect(effectOn(t, C)).toBe(0n);
  });

  const entry = (over: Partial<TransactionOutboxEntry>): TransactionOutboxEntry => ({
    mutationId: crypto.randomUUID(),
    userId: "u",
    entity: "transaction",
    operation: "create",
    recordId: crypto.randomUUID(),
    payload: transactionPayloadSchema.parse(payload()),
    baseVersion: null,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    syncedAt: null,
    serverVersion: null,
    ...over,
  });

  it("computes the pending change for creates, edits and deletes", () => {
    expect(pendingDelta(entry({}), A)).toBe(-1250n);
    const snapshot = {
      kind: "expense",
      account_id: A,
      transfer_account_id: null,
      amount_minor: 1000,
    };
    expect(pendingDelta(entry({ operation: "update", snapshot }), A)).toBe(-250n);
    expect(pendingDelta(entry({ operation: "delete", snapshot }), A)).toBe(1000n);
    expect(pendingDelta(entry({ status: "synced" }), A)).toBe(0n);
  });

  it("keeps the confirmed balance separate from the projection", () => {
    const projection = projectBalances(
      [
        { accountId: A, balanceMinor: 10_000n },
        { accountId: B, balanceMinor: 0n },
      ],
      [
        entry({}),
        entry({
          payload: transactionPayloadSchema.parse(
            payload({ kind: "transfer", transfer_account_id: B, amount_minor: "500" }),
          ),
        }),
      ],
    );
    expect(projection.get(A)).toMatchObject({
      confirmedMinor: 10_000n,
      pendingMinor: -1750n,
      projectedMinor: 8_250n,
      pendingCount: 2,
    });
    expect(projection.get(B)).toMatchObject({
      confirmedMinor: 0n,
      projectedMinor: 500n,
      pendingCount: 1,
    });
  });

  it("still counts failed changes as unsynced (they haven't reached the server)", () => {
    const p = projectBalances([{ accountId: A, balanceMinor: 0n }], [entry({ status: "failed" })]);
    expect(p.get(A)?.pendingCount).toBe(1);
  });
});
