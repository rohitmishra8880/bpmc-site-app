// Help Center ke calculator: concrete mix, eent ki ginti, unit badalna. (Steel: measure.ts → steelKgPerM / steelWeightKg)
import { roundHalfUp } from "./money";

export type ConcreteGrade = "M5" | "M7.5" | "M10" | "M15" | "M20" | "M25";

/** Nominal mix (cement : reti : gitti) — IS 456 */
export const CONCRETE_GRADES: [ConcreteGrade, [number, number, number]][] = [
  ["M5", [1, 5, 10]],
  ["M7.5", [1, 4, 8]],
  ["M10", [1, 3, 6]],
  ["M15", [1, 2, 4]],
  ["M20", [1, 1.5, 3]],
  ["M25", [1, 1, 2]],
];

/** Geela (wet) volume → sukha (dry) maal: × 1.54 */
export const DRY_FACTOR = 1.54;
/** Cement 1440 kg / M³, ek bag 50 kg */
const CEMENT_KG_PER_M3 = 1440;
const BAG_KG = 50;
const CFT_PER_M3 = 1 / 0.0283168466;
/** Paani : cement (w/c) */
const WATER_CEMENT = 0.5;

export interface ConcreteMix {
  grade: ConcreteGrade;
  ratio: [number, number, number];
  wetM3: number;
  dryM3: number;
  cementKg: number;
  cementBags: number;
  /** Poore bag mein (upar round) */
  bagsToBuy: number;
  sandM3: number;
  sandCft: number;
  aggregateM3: number;
  aggregateCft: number;
  waterL: number;
}

export function concreteMix(grade: ConcreteGrade, wetM3: number): ConcreteMix {
  if (!(wetM3 > 0) || !Number.isFinite(wetM3)) throw new Error("Volume must be more than 0");
  const g = CONCRETE_GRADES.find(([k]) => k === grade);
  if (!g) throw new Error(`Unknown grade ${grade}`);
  const ratio = g[1];
  const parts = ratio[0] + ratio[1] + ratio[2];
  const dry = wetM3 * DRY_FACTOR;
  const cementM3 = (dry * ratio[0]) / parts;
  const sand = (dry * ratio[1]) / parts;
  const agg = (dry * ratio[2]) / parts;
  const cementKg = roundHalfUp(cementM3 * CEMENT_KG_PER_M3, 2);
  return {
    grade, ratio, wetM3, dryM3: roundHalfUp(dry, 3),
    cementKg, cementBags: roundHalfUp(cementKg / BAG_KG, 2), bagsToBuy: Math.ceil(roundHalfUp(cementKg / BAG_KG, 6)),
    sandM3: roundHalfUp(sand, 3), sandCft: roundHalfUp(sand * CFT_PER_M3, 2),
    aggregateM3: roundHalfUp(agg, 3), aggregateCft: roundHalfUp(agg * CFT_PER_M3, 2),
    waterL: roundHalfUp(cementKg * WATER_CEMENT, 2),
  };
}

export type BrickType = "MODULAR" | "TRADITIONAL";
/** Masala (10 mm) ke saath ek eent ka size, metre mein */
const BRICK_WITH_MORTAR: Record<BrickType, [number, number, number]> = {
  MODULAR: [0.2, 0.1, 0.1], // 190 × 90 × 90 mm
  TRADITIONAL: [0.24, 0.12, 0.085], // 230 × 110 × 75 mm
};

/** Deewar ke volume (M³) mein kitni eent — wastage % ke saath, upar round */
export function brickCount(volumeM3: number, type: BrickType, wastagePct = 5): number {
  if (!(volumeM3 > 0)) throw new Error("Volume must be more than 0");
  const [l, w, h] = BRICK_WITH_MORTAR[type];
  return Math.ceil(roundHalfUp((volumeM3 / (l * w * h)) * (1 + wastagePct / 100), 6));
}

export type HelpUnit = "Mtr" | "ft" | "Sq M" | "sq ft" | "cu.m" | "cft" | "brass" | "Kg" | "MT";
/** Har unit: [kis cheez ki, base unit mein kitna] */
const UNIT_BASE: Record<HelpUnit, [string, number]> = {
  Mtr: ["length", 1],
  ft: ["length", 0.3048],
  "Sq M": ["area", 1],
  "sq ft": ["area", 0.09290304],
  "cu.m": ["volume", 1],
  cft: ["volume", 0.0283168466],
  brass: ["volume", 2.83168466], // 1 brass = 100 cft (reti / gitti)
  Kg: ["mass", 1],
  MT: ["mass", 1000],
};
export const HELP_UNITS = Object.keys(UNIT_BASE) as HelpUnit[];

export function convertUnit(value: number, from: HelpUnit, to: HelpUnit): number {
  const a = UNIT_BASE[from];
  const b = UNIT_BASE[to];
  if (!a || !b || a[0] !== b[0]) throw new Error(`Cannot convert ${from} to ${to}`);
  return roundHalfUp((value * a[1]) / b[1], 3);
}
