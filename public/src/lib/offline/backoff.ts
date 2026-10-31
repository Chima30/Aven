/** Retry schedule for network failures: exponential with "full jitter". */
export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 8;

/**
 * Delay before the next attempt, given how many attempts have already failed.
 * `random` is injectable for tests; it must return a number in [0, 1).
 */
export function backoffDelay(failedAttempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, failedAttempts - 1);
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent);
  return Math.max(BASE_DELAY_MS / 2, Math.floor(random() * ceiling));
}
