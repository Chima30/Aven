import { addMonths } from "./analysis";
import type { TxInput } from "./analysis";
import type { RecommendationRow } from "@/lib/supabase/database.types";

export function decisionCounts(rows: RecommendationRow[]) {
  const counts = {
    made: rows.length,
    open: 0,
    accepted: 0,
    rejected: 0,
    modified: 0,
    influenced: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.memory_influence.length > 0) counts.influenced += 1;
  }
  return counts;
}

/** Observed logged spending, never attributed savings. Both windows are whole calendar months. */
export function spendingObservation(
  rec: RecommendationRow,
  transactions: TxInput[],
  today: string,
  responseDate: string,
) {
  if (
    rec.kind !== "reduce_category_spend" ||
    !rec.category_id ||
    !rec.responded_at ||
    !["accepted", "modified"].includes(rec.status)
  )
    return null;
  const responseMonth = responseDate.slice(0, 7);
  const before = addMonths(responseMonth, -1);
  const after = addMonths(responseMonth, 1);
  if (after >= today.slice(0, 7)) return null;
  const records = transactions.filter(
    (t) =>
      t.kind === "expense" && t.currency === rec.currency_code && t.categoryId === rec.category_id,
  );
  const previous = records.filter((t) => t.occurredOn.slice(0, 7) === before);
  const subsequent = records.filter((t) => t.occurredOn.slice(0, 7) === after);
  // Missing logging is not zero spending.
  if (previous.length === 0 || subsequent.length === 0) return null;
  const sum = (rows: TxInput[]) => rows.reduce((total, t) => total + BigInt(t.amountMinor), 0n);
  const beforeMinor = sum(previous);
  const afterMinor = sum(subsequent);
  return {
    before,
    after,
    beforeMinor,
    afterMinor,
    changeMinor: afterMinor - beforeMinor,
    recordCount: previous.length + subsequent.length,
  };
}
