/**
 * Supported currencies (ISO 4217) and their minor-unit precision.
 *
 * minorUnits is the number of decimal places a currency uses:
 *   JPY → 0 (¥1500), USD/NGN → 2 ($12.34), KWD → 3 (KD 1.250).
 *
 * This list MUST match the `public.currencies` table seeded in
 * supabase/migrations/20261031000100_foundation.sql. A database test checks it.
 */
export interface CurrencyInfo {
  readonly code: string;
  readonly minorUnits: 0 | 1 | 2 | 3 | 4;
  readonly name: string;
}

export const CURRENCIES = [
  { code: "AED", minorUnits: 2, name: "UAE Dirham" },
  { code: "ARS", minorUnits: 2, name: "Argentine Peso" },
  { code: "AUD", minorUnits: 2, name: "Australian Dollar" },
  { code: "BDT", minorUnits: 2, name: "Bangladeshi Taka" },
  { code: "BHD", minorUnits: 3, name: "Bahraini Dinar" },
  { code: "BRL", minorUnits: 2, name: "Brazilian Real" },
  { code: "BWP", minorUnits: 2, name: "Botswana Pula" },
  { code: "CAD", minorUnits: 2, name: "Canadian Dollar" },
  { code: "CHF", minorUnits: 2, name: "Swiss Franc" },
  { code: "CLP", minorUnits: 0, name: "Chilean Peso" },
  { code: "CNY", minorUnits: 2, name: "Chinese Yuan" },
  { code: "COP", minorUnits: 2, name: "Colombian Peso" },
  { code: "CZK", minorUnits: 2, name: "Czech Koruna" },
  { code: "DKK", minorUnits: 2, name: "Danish Krone" },
  { code: "EGP", minorUnits: 2, name: "Egyptian Pound" },
  { code: "ETB", minorUnits: 2, name: "Ethiopian Birr" },
  { code: "EUR", minorUnits: 2, name: "Euro" },
  { code: "GBP", minorUnits: 2, name: "British Pound" },
  { code: "GHS", minorUnits: 2, name: "Ghanaian Cedi" },
  { code: "HKD", minorUnits: 2, name: "Hong Kong Dollar" },
  { code: "HUF", minorUnits: 2, name: "Hungarian Forint" },
  { code: "IDR", minorUnits: 2, name: "Indonesian Rupiah" },
  { code: "ILS", minorUnits: 2, name: "Israeli New Shekel" },
  { code: "INR", minorUnits: 2, name: "Indian Rupee" },
  { code: "IQD", minorUnits: 3, name: "Iraqi Dinar" },
  { code: "ISK", minorUnits: 0, name: "Icelandic Króna" },
  { code: "JOD", minorUnits: 3, name: "Jordanian Dinar" },
  { code: "JPY", minorUnits: 0, name: "Japanese Yen" },
  { code: "KES", minorUnits: 2, name: "Kenyan Shilling" },
  { code: "KRW", minorUnits: 0, name: "South Korean Won" },
  { code: "KWD", minorUnits: 3, name: "Kuwaiti Dinar" },
  { code: "LYD", minorUnits: 3, name: "Libyan Dinar" },
  { code: "MAD", minorUnits: 2, name: "Moroccan Dirham" },
  { code: "MXN", minorUnits: 2, name: "Mexican Peso" },
  { code: "MYR", minorUnits: 2, name: "Malaysian Ringgit" },
  { code: "NGN", minorUnits: 2, name: "Nigerian Naira" },
  { code: "NOK", minorUnits: 2, name: "Norwegian Krone" },
  { code: "NZD", minorUnits: 2, name: "New Zealand Dollar" },
  { code: "OMR", minorUnits: 3, name: "Omani Rial" },
  { code: "PEN", minorUnits: 2, name: "Peruvian Sol" },
  { code: "PHP", minorUnits: 2, name: "Philippine Peso" },
  { code: "PKR", minorUnits: 2, name: "Pakistani Rupee" },
  { code: "PLN", minorUnits: 2, name: "Polish Złoty" },
  { code: "QAR", minorUnits: 2, name: "Qatari Riyal" },
  { code: "RON", minorUnits: 2, name: "Romanian Leu" },
  { code: "RWF", minorUnits: 0, name: "Rwandan Franc" },
  { code: "SAR", minorUnits: 2, name: "Saudi Riyal" },
  { code: "SEK", minorUnits: 2, name: "Swedish Krona" },
  { code: "SGD", minorUnits: 2, name: "Singapore Dollar" },
  { code: "THB", minorUnits: 2, name: "Thai Baht" },
  { code: "TND", minorUnits: 3, name: "Tunisian Dinar" },
  { code: "TRY", minorUnits: 2, name: "Turkish Lira" },
  { code: "TWD", minorUnits: 2, name: "New Taiwan Dollar" },
  { code: "TZS", minorUnits: 2, name: "Tanzanian Shilling" },
  { code: "UAH", minorUnits: 2, name: "Ukrainian Hryvnia" },
  { code: "UGX", minorUnits: 0, name: "Ugandan Shilling" },
  { code: "USD", minorUnits: 2, name: "US Dollar" },
  { code: "VND", minorUnits: 0, name: "Vietnamese Đồng" },
  { code: "XAF", minorUnits: 0, name: "Central African CFA Franc" },
  { code: "XOF", minorUnits: 0, name: "West African CFA Franc" },
  { code: "ZAR", minorUnits: 2, name: "South African Rand" },
  { code: "ZMW", minorUnits: 2, name: "Zambian Kwacha" },
] as const satisfies readonly CurrencyInfo[];

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const BY_CODE: ReadonlyMap<string, CurrencyInfo> = new Map(CURRENCIES.map((c) => [c.code, c]));

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as readonly CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return BY_CODE.has(value);
}

export function getCurrency(code: string): CurrencyInfo {
  const info = BY_CODE.get(code);
  if (!info) throw new UnsupportedCurrencyError(code);
  return info;
}

export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Unsupported currency: ${code}`);
    this.name = "UnsupportedCurrencyError";
  }
}
