import {
  isValidSuiAddress,
  normalizeSuiAddress,
  isValidTransactionDigest,
} from "@mysten/sui/utils";

/** Mainnet SUI coin type and its decimals (1 SUI = 10^9 MIST). */
export const SUI_COIN_TYPE = "0x2::sui::SUI";
export const SUI_DECIMALS = 9;

/**
 * Validates and normalises a user-entered Sui address to the canonical
 * 0x + 64 lowercase hex form. Returns null for anything else (including
 * SuiNS names, which AVEN does not resolve).
 */
export function parseSuiAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(trimmed)) return null;
  const normalized = normalizeSuiAddress(trimmed.toLowerCase());
  return isValidSuiAddress(normalized) ? normalized : null;
}

export function isSuiDigest(input: string): boolean {
  return isValidTransactionDigest(input.trim());
}

/** 0x1234…cdef */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Formats a raw integer amount (string, may be negative) with `decimals` places. */
export function formatUnits(raw: string, decimals: number, maxFraction = 4): string {
  if (!/^-?\d+$/.test(raw)) return raw;
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  let fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  fraction = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** The symbol part of a coin type ("0x2::sui::SUI" → "SUI"). */
export function coinSymbolFromType(coinType: string): string {
  return coinType.split("::").pop()?.replace(/>$/, "") ?? coinType;
}
