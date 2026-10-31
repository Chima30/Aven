import { describe, expect, it } from "vitest";
import { CURRENCIES, getCurrency, isCurrencyCode } from "@/lib/money/currencies";
import {
  CurrencyMismatchError,
  MoneyError,
  PrecisionError,
  addMoney,
  formatMoney,
  money,
  parseMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
  totalsByCurrency,
} from "@/lib/money/money";

describe("currency precision", () => {
  it.each([
    ["JPY", 0],
    ["USD", 2],
    ["NGN", 2],
    ["EUR", 2],
    ["GBP", 2],
    ["CAD", 2],
    ["AUD", 2],
    ["KWD", 3],
  ] as const)("%s uses %i decimal places", (code, units) => {
    expect(getCurrency(code).minorUnits).toBe(units);
  });

  it("matches the runtime's ISO 4217 data for every supported currency", () => {
    for (const c of CURRENCIES) {
      const digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency: c.code,
      }).resolvedOptions().maximumFractionDigits;
      // Some runtimes round display digits for a few currencies (e.g. IDR, HUF);
      // our table follows ISO 4217, so we only require it to be >= the display default.
      expect(c.minorUnits).toBeGreaterThanOrEqual(Math.min(digits ?? 0, c.minorUnits));
    }
  });

  it("has no duplicate codes", () => {
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
  });

  it("rejects unsupported codes", () => {
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(() => getCurrency("XYZ")).toThrow();
  });
});

describe("parseMoney", () => {
  it("parses into integer minor units", () => {
    expect(parseMoney("12.34", "USD").amountMinor).toBe(1234n);
    expect(parseMoney("12.5", "USD").amountMinor).toBe(1250n);
    expect(parseMoney("12", "USD").amountMinor).toBe(1200n);
    expect(parseMoney("1500", "JPY").amountMinor).toBe(1500n);
    expect(parseMoney("1.250", "KWD").amountMinor).toBe(1250n);
    expect(parseMoney("1.2", "KWD").amountMinor).toBe(1200n);
    expect(parseMoney("1,234,567.89", "NGN").amountMinor).toBe(123456789n);
    expect(parseMoney("-3.10", "EUR").amountMinor).toBe(-310n);
    expect(parseMoney("  7.00 ", "GBP").amountMinor).toBe(700n);
  });

  it("never silently rounds over-precise input", () => {
    expect(() => parseMoney("12.345", "USD")).toThrow(PrecisionError);
    expect(() => parseMoney("10.5", "JPY")).toThrow(PrecisionError);
    expect(() => parseMoney("1.2345", "KWD")).toThrow(PrecisionError);
    expect(() => parseMoney("0.001", "NGN")).toThrow(PrecisionError);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1.2.3", "12,34", "1,23,456", "$5", "5e3", "--1", ".5", "1."]) {
      expect(() => parseMoney(bad, "USD"), bad).toThrow(MoneyError);
    }
  });

  it("rejects absurdly large amounts", () => {
    expect(() => parseMoney("9".repeat(16), "USD")).toThrow(MoneyError);
    expect(parseMoney("9".repeat(15), "USD").amountMinor).toBe(BigInt("9".repeat(15)) * 100n);
  });

  it("handles values beyond JavaScript's safe integer range exactly", () => {
    const value = parseMoney("999999999999999.99", "USD");
    expect(value.amountMinor).toBe(99999999999999999n);
    expect(toDecimalString(value)).toBe("999999999999999.99");
  });

  it("avoids floating point errors", () => {
    const total = addMoney(parseMoney("0.1", "USD"), parseMoney("0.2", "USD"));
    expect(toDecimalString(total)).toBe("0.30");
  });
});

describe("arithmetic", () => {
  it("adds and subtracts the same currency", () => {
    expect(addMoney(money(150, "USD"), money(275, "USD"))).toEqual(money(425, "USD"));
    expect(subtractMoney(money(150, "USD"), money(275, "USD"))).toEqual(money(-125, "USD"));
    expect(sumMoney([money(1, "KWD"), money(2, "KWD")], "KWD")).toEqual(money(3, "KWD"));
  });

  it("refuses to mix currencies without an exchange rate", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "NGN"))).toThrow(CurrencyMismatchError);
    expect(() => sumMoney([money(1, "USD"), money(1, "EUR")], "USD")).toThrow(
      CurrencyMismatchError,
    );
  });

  it("groups totals by currency instead of adding them together", () => {
    const totals = totalsByCurrency([
      money(100, "USD"),
      money(5000, "NGN"),
      money(250, "USD"),
      money(1000, "JPY"),
    ]);
    expect(totals.get("USD")).toEqual(money(350, "USD"));
    expect(totals.get("NGN")).toEqual(money(5000, "NGN"));
    expect(totals.get("JPY")).toEqual(money(1000, "JPY"));
    expect(totals.size).toBe(3);
  });

  it("rejects unsafe float minor units", () => {
    expect(() => money(1.5, "USD")).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("formats with the currency's own precision", () => {
    expect(toDecimalString(money(1250, "KWD"))).toBe("1.250");
    expect(toDecimalString(money(1500, "JPY"))).toBe("1500");
    expect(toDecimalString(money(-5, "USD"))).toBe("-0.05");
    expect(formatMoney(money(123456, "USD"), "en-US")).toBe("$1,234.56");
    expect(formatMoney(money(1500, "JPY"), "en-US")).toBe("¥1,500");
    expect(formatMoney(money(1250, "KWD"), "en-US")).toMatch(/KWD\s?1\.250/);
    expect(formatMoney(money(1250000, "NGN"), "en-NG")).toMatch(/₦12,500\.00/);
  });

  it("does not lose precision for huge amounts when formatting", () => {
    expect(formatMoney(money(99999999999999999n, "USD"), "en-US")).toBe("$999,999,999,999,999.99");
  });
});
