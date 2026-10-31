import { formatMinor } from "@/lib/finance/format";
import { cn } from "@/lib/cn";

/**
 * Displays an amount from minor units with the currency's own precision.
 * tone="kind" colours income green; expenses stay neutral (calm, not alarming).
 */
export function MoneyAmount({
  minor,
  currency,
  locale,
  kind,
  className,
}: {
  minor: string | number | bigint;
  currency: string;
  locale: string;
  kind?: "income" | "expense" | "transfer";
  className?: string;
}) {
  const value = BigInt(minor);
  const text = formatMinor(value < 0n ? -value : value, currency, locale);
  let sign = value < 0n ? "−" : "";
  if (kind === "income") sign = "+";
  if (kind === "expense") sign = "−";
  return (
    <span
      className={cn(
        "type-figure whitespace-nowrap",
        kind === "income" && "text-success",
        kind === "transfer" && "text-ink-muted",
        className,
      )}
    >
      {sign}
      {text}
    </span>
  );
}
