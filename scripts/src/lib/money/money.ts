import { getCurrency, type CurrencyCode } from "./currencies";

/**
 * Money is always stored as an integer number of MINOR units (cents, kobo,
 * fils…) in a bigint, together with its currency. Floating-point numbers are
 * never used for amounts.
 *
 *   { amountMinor: 1234n, currency: "USD" } → $12.34
 *   { amountMinor: 1500n, currency: "JPY" } → ¥1,500
 *   { amountMinor: 1250n, currency: "KWD" } → KD 1.250
 */
export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export class CurrencyMismatchError extends MoneyError {
  constructor(a: string, b: string) {
    super(
      `Cannot combine ${a} and ${b} amounts without an exchange rate. Convert explicitly first.`,
    );
    this.name = "CurrencyMismatchError";
  }
}

export class PrecisionError extends MoneyError {
  constructor(input: string, currency: string, minorUnits: number) {
    super(
      minorUnits === 0
        ? `${currency} does not use decimal places, but "${input}" has some.`
        : `${currency} allows at most ${minorUnits} decimal place${minorUnits === 1 ? "" : "s"}, but "${input}" has more.`,
    );
    this.name = "PrecisionError";
  }
}

/** Largest amount accepted from user input: 10^15 major units. */
const MAX_MAJOR_DIGITS = 15;

/**
 * Parse a user-typed decimal string into Money.
 *
 * Accepts: "12", "12.5", "12.50", "-3.10", "1,234.56" (comma thousands separators).
 * Rejects (never silently rounds): "12.345" for USD, "10.5" for JPY, "abc", "".
 *
 * Locale-specific decimal commas (e.g. "12,50") must be normalised by the
 * caller using the user's locale before calling this function.
 */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const { minorUnits } = getCurrency(currency);
  const trimmed = input.trim();
  const match = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyError(`"${input}" is not a valid amount.`);
  }
  const [, sign, intPartRaw = "0", fraction = ""] = match;
  const intPart = intPartRaw.replace(/,/g, "");
  if (intPart.replace(/^0+/, "").length > MAX_MAJOR_DIGITS) {
    throw new MoneyError(`"${input}" is too large.`);
  }
  if (fraction.length > minorUnits) {
    throw new PrecisionError(input, currency, minorUnits);
  }
  const padded = fraction.padEnd(minorUnits, "0");
  let amountMinor = BigInt(intPart) * 10n ** BigInt(minorUnits) + (padded ? BigInt(padded) : 0n);
  if (sign === "-") amountMinor = -amountMinor;
  // Normalise negative zero.
  if (amountMinor === 0n) amountMinor = 0n;
  return { amountMinor, currency };
}

export function money(amountMinor: bigint | number, currency: CurrencyCode): Money {
  getCurrency(currency); // validates the code
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new MoneyError("Minor-unit amounts must be safe integers.");
  }
  return { amountMinor: BigInt(amountMinor), currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/** Sum a list that must all share one currency. */
export function sumMoney(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce<Money>((total, item) => addMoney(total, item), money(0n, currency));
}

/**
 * Group amounts by currency instead of adding different currencies together.
 * Use this for "total across accounts" style summaries.
 */
export function totalsByCurrency(items: readonly Money[]): Map<CurrencyCode, Money> {
  const totals = new Map<CurrencyCode, Money>();
  for (const item of items) {
    const current = totals.get(item.currency);
    totals.set(item.currency, current ? addMoney(current, item) : item);
  }
  return totals;
}

/** Exact decimal string, e.g. 1250n KWD → "1.250". No rounding, no locale. */
export function toDecimalString(value: Money): string {
  const { minorUnits } = getCurrency(value.currency);
  const negative = value.amountMinor < 0n;
  const abs = negative ? -value.amountMinor : value.amountMinor;
  if (minorUnits === 0) return `${negative ? "-" : ""}${abs.toString()}`;
  const scale = 10n ** BigInt(minorUnits);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(minorUnits, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

/**
 * Locale-aware display string, e.g. "₦12,500.00", "¥1,500", "KWD 1.250".
 * Uses the currency's own precision so amounts are never visually rounded.
 */
export function formatMoney(value: Money, locale = "en-US"): string {
  const { minorUnits } = getCurrency(value.currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  });
  // Intl accepts decimal strings exactly (no float conversion) in modern runtimes.
  return formatter.format(toDecimalString(value) as unknown as number);
}
