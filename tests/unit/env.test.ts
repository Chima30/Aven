import { describe, expect, it } from "vitest";
import { EnvError, parsePublicEnv } from "@/lib/env";
import { parseServerEnv } from "@/lib/env.server";

// Built at runtime so the secret scanner never sees a key-shaped literal.
const FAKE_SECRET = ["sb", "secret", "x".repeat(26)].join("_");

const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd1234.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  NEXT_PUBLIC_SITE_URL: "https://aven.vercel.app/",
};

describe("public environment validation", () => {
  it("accepts a valid configuration and trims the site URL", () => {
    expect(parsePublicEnv(good).NEXT_PUBLIC_SITE_URL).toBe("https://aven.vercel.app");
  });

  it("accepts a legacy anon JWT key", () => {
    expect(() =>
      parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `eyJ${"a".repeat(100)}` }),
    ).not.toThrow();
  });

  it("allows http only for localhost", () => {
    expect(() =>
      parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).not.toThrow();
    expect(() =>
      parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://abcd.supabase.co" }),
    ).toThrow(EnvError);
  });

  it("reports every missing variable by name", () => {
    try {
      parsePublicEnv({});
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(message).toContain("NEXT_PUBLIC_SITE_URL");
    }
  });

  it("refuses a secret key in a public variable", () => {
    expect(() =>
      parsePublicEnv({
        ...good,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET,
      }),
    ).toThrow(/SECRET key/);
  });
});

describe("server environment validation", () => {
  it("requires the secret key", () => {
    expect(() => parseServerEnv({})).toThrow(EnvError);
    expect(parseServerEnv({ SUPABASE_SECRET_KEY: FAKE_SECRET })).toBeTruthy();
  });

  it("refuses the publishable key in the secret slot", () => {
    expect(() =>
      parseServerEnv({ SUPABASE_SECRET_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz" }),
    ).toThrow(/PUBLISHABLE/);
  });
});
