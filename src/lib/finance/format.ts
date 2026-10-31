import { isCurrencyCode } from "@/lib/money/currencies";
import { formatMoney, money } from "@/lib/money/money";

/** Format stored minor units (bigint, number or numeric string) for display. */
export function formatMinor(
  minor: bigint | number | string,
  currency: string,
  locale: string,
): string {
  if (!isCurrencyCode(currency)) return `${minor} ${currency}`;
  return formatMoney(money(BigInt(minor), currency), locale);
}

/** Percentage of `part` over `whole`, as an integer, without float overflow. Whole ≤ 0 → 0. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 1000n) / whole) / 10;
}
