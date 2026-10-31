import type { NumberFormatPreference } from "@/lib/supabase/database.types";
import { getCurrency, type CurrencyCode } from "@/lib/money/currencies";
import { MoneyError, parseMoney, type Money } from "@/lib/money/money";
import { MAX_AMOUNT_MINOR } from "./constants";

/** Which character the user types as a decimal point, given their preferences. */
export function decimalSeparatorFor(
  locale: string,
  numberFormat: NumberFormatPreference,
): "." | "," {
  if (numberFormat === "comma_dot") return ".";
  if (numberFormat === "dot_comma" || numberFormat === "space_comma") return ",";
  const part = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((p) => p.type === "decimal")?.value;
  return part === "," ? "," : ".";
}

/**
 * Convert what the user typed into the canonical "1234.56" form that
 * parseMoney understands. Grouping characters are removed; the user's decimal
 * separator becomes ".". Nothing is rounded — precision is checked later.
 */
export function normalizeAmountInput(raw: string, decimal: "." | ","): string {
  let s = raw.trim().replace(/[\s  ']/g, "");
  // Strip a leading currency symbol or code the user may have typed.
  s = s.replace(/^[^\d.,-]+/, "");
  if (decimal === ",") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  return s;
}

export class AmountError extends Error {}

/**
 * Parse a user-typed, strictly positive amount for a currency.
 * Throws AmountError with a user-friendly message.
 */
export function parsePositiveAmount(
  raw: string,
  currency: CurrencyCode,
  decimal: "." | "," = ".",
): Money {
  const normalized = normalizeAmountInput(raw, decimal);
  if (!normalized) throw new AmountError("Enter an amount.");
  let value: Money;
  try {
    value = parseMoney(normalized, currency);
  } catch (error) {
    const units = getCurrency(currency).minorUnits;
    if (error instanceof MoneyError && error.name === "PrecisionError") {
      throw new AmountError(
        units === 0
          ? `${currency} amounts can't have decimals.`
          : `${currency} amounts can have at most ${units} decimal place${units === 1 ? "" : "s"}.`,
      );
    }
    throw new AmountError("Enter a valid amount, like 1250.50.");
  }
  if (value.amountMinor <= 0n) throw new AmountError("The amount must be more than zero.");
  if (value.amountMinor > MAX_AMOUNT_MINOR) throw new AmountError("That amount is too large.");
  return value;
}

/** Same as parsePositiveAmount but allows zero and negatives (opening balances). */
export function parseSignedAmount(
  raw: string,
  currency: CurrencyCode,
  decimal: "." | "," = ".",
): Money {
  const normalized = normalizeAmountInput(raw, decimal) || "0";
  let value: Money;
  try {
    value = parseMoney(normalized, currency);
  } catch {
    const units = getCurrency(currency).minorUnits;
    throw new AmountError(
      units === 0
        ? `Enter a whole ${currency} amount.`
        : `Enter an amount with at most ${units} decimal place${units === 1 ? "" : "s"}.`,
    );
  }
  const abs = value.amountMinor < 0n ? -value.amountMinor : value.amountMinor;
  if (abs > MAX_AMOUNT_MINOR) throw new AmountError("That amount is too large.");
  return value;
}

/** Turn stored minor units back into an editable string, e.g. 125050 NGN → "1250.50". */
export function minorToInput(
  minor: bigint | number | string,
  currency: CurrencyCode,
  decimal: "." | "," = ".",
): string {
  const { minorUnits } = getCurrency(currency);
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  if (minorUnits === 0) return `${negative ? "-" : ""}${abs}`;
  const scale = 10n ** BigInt(minorUnits);
  const s = `${abs / scale}${decimal}${(abs % scale).toString().padStart(minorUnits, "0")}`;
  return negative ? `-${s}` : s;
}
