import { describe, expect, it } from "vitest";
import {
  isRecoveryLanding,
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

describe("which email links count as a password reset", () => {
  it("token links: only the recovery type", () => {
    expect(isRecoveryLanding({ type: "recovery", usedCode: false, amr: undefined })).toBe(true);
    for (const type of ["signup", "email", "magiclink", "invite", "email_change"]) {
      expect(isRecoveryLanding({ type, usedCode: false, amr: undefined })).toBe(false);
    }
  });

  it("code links: only when the new session was created by a recovery", () => {
    expect(
      isRecoveryLanding({
        type: null,
        usedCode: true,
        amr: [
          { method: "password", timestamp: 100 },
          { method: "recovery", timestamp: 200 },
        ],
      }),
    ).toBe(true);
    expect(
      isRecoveryLanding({
        type: null,
        usedCode: true,
        amr: [{ method: "magiclink", timestamp: 1 }],
      }),
    ).toBe(false);
    // An older recovery doesn't count once a newer sign-in happened.
    expect(
      isRecoveryLanding({
        type: null,
        usedCode: true,
        amr: [
          { method: "recovery", timestamp: 100 },
          { method: "otp", timestamp: 200 },
        ],
      }),
    ).toBe(false);
    for (const amr of [undefined, null, [], "recovery", [{ nope: 1 }]]) {
      expect(isRecoveryLanding({ type: null, usedCode: true, amr })).toBe(false);
    }
  });
});
