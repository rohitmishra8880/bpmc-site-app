// Site ke naap: machine ghante, M³, Sq M, steel weight, unit badalna.
import { roundHalfUp } from "./money";

/** Machine ghante = CR − SR → 2951.8 − 2944.0 = 7.8 */
export function machineHours(sr: number, cr: number): number {
  if (!Number.isFinite(sr) || !Number.isFinite(cr)) throw new Error("SR / CR number hona chahiye");
  if (cr < sr) throw new Error(`CR (${cr}) SR (${sr}) se kam nahi ho sakta`);
  return roundHalfUp(cr - sr, 2);
}

/** 7.8 → "7h 48m" (purane app ka "7.36m" galat tha) */
export function formatHours(hours: number): string {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h}h ${m}m`;
}

/** Volume = L × W × H (× nos) → 10 × 5 × 2.41 = 120.50 M³ */
export function volumeM3(l: number, w: number, h: number, nos = 1): number {
  return roundHalfUp(l * w * h * nos, 2);
}

export function areaSqM(l: number, w: number, nos = 1): number {
  return roundHalfUp(l * w * nos, 2);
}

/** Steel kg/m = D² ÷ 162 (3 decimal, IS table jaisa: 12mm 0.889, 16mm 1.580) */
export function steelKgPerM(diaMm: number): number {
  return roundHalfUp((diaMm * diaMm) / 162, 3);
}

/** Steel weight = D² ÷ 162 × Length (× nos) → 16mm, 12 m = 18.96 kg */
export function steelWeightKg(diaMm: number, lengthM: number, nos = 1): number {
  return roundHalfUp(steelKgPerM(diaMm) * lengthM * nos, 2);
}

// ---- Unit badalna ----

export type Unit = "Ltr" | "ml" | "Kg" | "MT" | "Nos" | "Mtr" | "Bags" | "cu.m" | "Sq M" | "Set" | "Bucket" | "Drum" | "Barrel";

/** Har jagah ek jaise rehne wale niyam (base unit → doosri unit ka factor). */
const STANDARD: Partial<Record<Unit, Partial<Record<Unit, number>>>> = {
  Ltr: { ml: 0.001 },
  Kg: { MT: 1000 },
  MT: { Kg: 0.001 },
};

export interface ItemUnits {
  baseUnit: Unit;
  /** Item ka apna size: jaise { Bucket: 20, Drum: 210 } (Ltr mein), cement { Bags: 50 } (Kg mein) */
  conversions?: Partial<Record<Unit, number>>;
}

/** Entry ki unit ko item ki base unit mein: 2 Bucket (20 L) → 40 Ltr */
export function toBaseQty(qty: number, unit: Unit, item: ItemUnits): number {
  if (unit === item.baseUnit) return roundHalfUp(qty, 3);
  const factor = item.conversions?.[unit] ?? STANDARD[item.baseUnit]?.[unit];
  if (factor === undefined) throw new Error(`${unit} ko ${item.baseUnit} mein badalne ka niyam set nahi hai`);
  return roundHalfUp(qty * factor, 3);
}
