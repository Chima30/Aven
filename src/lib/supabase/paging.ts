/**
 * Supabase returns at most 1,000 rows per request, whatever `.limit()` asks
 * for. Lists that can be longer must be read page by page, or the rest is cut
 * off without any error.
 */
export const SUPABASE_PAGE_SIZE = 1000;

export interface PagedResult<T> {
  data: T[];
  error: unknown;
  /** True when `max` rows were read and more may exist. */
  truncated: boolean;
}

/**
 * Reads every page of a query. `page(from, to)` must return the query with a
 * stable ORDER BY (ending in a unique column) and `.range(from, to)` applied.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { max = 20_000 }: { max?: number } = {},
): Promise<PagedResult<T>> {
  const data: T[] = [];
  for (let from = 0; from < max; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE, max) - 1;
    const res = await page(from, to);
    if (res.error) return { data, error: res.error, truncated: false };
    const rows = res.data ?? [];
    data.push(...rows);
    if (rows.length < to - from + 1) return { data, error: null, truncated: false };
  }
  return { data, error: null, truncated: true };
}
