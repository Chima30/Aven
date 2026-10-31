/**
 * Regional option lists. Labels come from Intl so they stay accurate without
 * hand-maintained translations.
 */

// ISO 3166-1 alpha-2 codes.
const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

export const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

export function countryOptions(displayLocale = "en"): Array<{ code: string; name: string }> {
  const names = new Intl.DisplayNames([displayLocale], { type: "region" });
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, displayLocale),
  );
}

/** Formatting locales (interface language is English for now). */
export const LOCALE_OPTIONS = [
  "en-US",
  "en-GB",
  "en-NG",
  "en-GH",
  "en-KE",
  "en-ZA",
  "en-CA",
  "en-AU",
  "en-NZ",
  "en-IN",
  "en-IE",
  "en-SG",
  "fr-FR",
  "fr-CA",
  "fr-SN",
  "de-DE",
  "de-CH",
  "es-ES",
  "es-MX",
  "es-AR",
  "pt-BR",
  "pt-PT",
  "it-IT",
  "nl-NL",
  "sv-SE",
  "nb-NO",
  "da-DK",
  "pl-PL",
  "tr-TR",
  "ar-KW",
  "ar-SA",
  "ar-AE",
  "ar-EG",
  "hi-IN",
  "sw-KE",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "zh-TW",
  "id-ID",
] as const;

export function localeOptions(): Array<{ code: string; name: string }> {
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  return LOCALE_OPTIONS.map((code) => ({ code, name: `${names.of(code) ?? code} (${code})` }));
}

export function isValidLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1 && value.length <= 35;
  } catch {
    return false;
  }
}

export function timeZoneOptions(): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
