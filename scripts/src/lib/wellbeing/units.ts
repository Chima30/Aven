/**
 * Wellbeing units and summaries. Values are STORED in one canonical unit
 * (millilitres, metres, minutes) and converted only for display/entry, so
 * changing your preferred unit never changes your records.
 */

export type WaterUnit = "ml" | "l" | "fl_oz";
export type DistanceUnit = "km" | "mi";

/** 1 US fluid ounce = 29.5735295625 ml. */
export const ML_PER_FL_OZ = 29.5735295625;
export const M_PER_MILE = 1609.344;

export function waterToMl(amount: number, unit: WaterUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("Amount must be positive");
  const ml = unit === "ml" ? amount : unit === "l" ? amount * 1000 : amount * ML_PER_FL_OZ;
  return Math.round(ml);
}

export function mlToUnit(ml: number, unit: WaterUnit): number {
  if (unit === "ml") return ml;
  if (unit === "l") return Math.round((ml / 1000) * 100) / 100;
  return Math.round((ml / ML_PER_FL_OZ) * 10) / 10;
}

export function formatWater(ml: number, unit: WaterUnit): string {
  const v = mlToUnit(ml, unit);
  return unit === "ml" ? `${v.toLocaleString("en")} ml` : unit === "l" ? `${v} L` : `${v} fl oz`;
}

export function distanceToMetres(amount: number, unit: DistanceUnit): number {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Distance can't be negative");
  return Math.round(unit === "km" ? amount * 1000 : amount * M_PER_MILE);
}

export function formatDistance(metres: number, unit: DistanceUnit): string {
  const v = unit === "km" ? metres / 1000 : metres / M_PER_MILE;
  return `${Math.round(v * 100) / 100} ${unit}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Sleep duration in minutes between two instants. Using instants (not wall
 * clocks) makes overnight sleep and daylight-saving changes exact.
 */
export function sleepMinutes(sleptAt: Date, wokeAt: Date): number {
  const ms = wokeAt.getTime() - sleptAt.getTime();
  if (!(ms > 0)) throw new RangeError("Wake-up must be after bedtime");
  if (ms > 20 * 3_600_000) throw new RangeError("A sleep can't be longer than 20 hours");
  return Math.round(ms / 60_000);
}

export function average(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** Sum per date (for water per day, activity minutes per day…). */
export function sumByDate<T>(items: T[], date: (t: T) => string, value: (t: T) => number) {
  const m = new Map<string, number>();
  for (const i of items) m.set(date(i), (m.get(date(i)) ?? 0) + value(i));
  return m;
}

export const SCALE_LABELS = {
  mood: ["Very low", "Low", "Okay", "Good", "Great"],
  energy: ["Drained", "Low", "Steady", "Good", "Full"],
  stress: ["Calm", "Mild", "Moderate", "High", "Very high"],
  sleep_rating: ["Very poor", "Poor", "Okay", "Good", "Great"],
  day_rating: ["Hard", "Tough", "Okay", "Good", "Great"],
} as const;
