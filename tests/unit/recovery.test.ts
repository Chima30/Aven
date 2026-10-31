import { describe, expect, it } from "vitest";
import {
  RECOVERY_TTL_SECONDS,
  createRecoveryToken,
  verifyRecoveryToken,
} from "@/lib/auth/recovery";

const KEY = "server-only-test-key";
const USER = "11111111-1111-4111-8111-111111111111";

describe("password recovery proof", () => {
  it("accepts a fresh token for the same user", () => {
    expect(verifyRecoveryToken(createRecoveryToken(USER, KEY), USER, KEY)).toBe(true);
  });

  it("rejects missing, forged, tampered, foreign and expired tokens", () => {
    const now = Date.now();
    const token = createRecoveryToken(USER, KEY, now);
    expect(verifyRecoveryToken(undefined, USER, KEY)).toBe(false);
    expect(verifyRecoveryToken("1", USER, KEY)).toBe(false);
    expect(verifyRecoveryToken(token, USER, "another-key")).toBe(false);
    expect(verifyRecoveryToken(token, "22222222-2222-4222-8222-222222222222", KEY)).toBe(false);
    const [uid, exp, sig] = token.split(".");
    expect(verifyRecoveryToken(`${uid}.${Number(exp) + 9999}.${sig}`, USER, KEY)).toBe(false);
    expect(verifyRecoveryToken(token, USER, KEY, now + (RECOVERY_TTL_SECONDS + 1) * 1000)).toBe(
      false,
    );
  });
});
