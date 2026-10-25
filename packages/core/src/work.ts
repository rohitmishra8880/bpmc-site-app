// Daily Work: naap (M³ / Sq M / Kg), thekedar ka bill, din / thekedar ke total.
// Formule measure.ts ke hi hain (volumeM3, areaSqM, steelWeightKg) — yahan sirf jodna.
import { areaSqM, steelWeightKg, volumeM3 } from "./measure";
import { roundHalfUp, type Paise } from "./money";

export type WorkType = "CONCRETE" | "EXCAVATION" | "SHUTTERING" | "STEEL";
export type WorkUnit = "M³" | "Sq M" | "Kg";

export const WORK_UNIT: Record<WorkType, WorkUnit> = { CONCRETE: "M³", EXCAVATION: "M³", SHUTTERING: "Sq M", STEEL: "Kg" };

export interface WorkInput {
  type: WorkType;
  l?: number;
  w?: number;
  h?: number;
  nos?: number;
  /** Steel: bar ka vyas (mm) aur lambai (m) */
  diaMm?: number;
  lengthM?: number;
}

const pos = (n: number | undefined, what: string): number => {
  if (!(typeof n === "number" && Number.isFinite(n) && n > 0)) throw new Error(`${what} must be more than 0`);
  return n;
};

/** Concrete / Excavation = L × W × H × nos; Shuttering = L × H × nos (w = height); Steel = D² ÷ 162 × L × nos */
export function workQuantity(i: WorkInput): { qty: number; unit: WorkUnit } {
  const nos = i.nos === undefined ? 1 : pos(i.nos, "Nos");
  switch (i.type) {
    case "CONCRETE":
    case "EXCAVATION":
      return { qty: volumeM3(pos(i.l, "Length"), pos(i.w, "Width"), pos(i.h, "Height / depth"), nos), unit: "M³" };
    case "SHUTTERING":
      return { qty: areaSqM(pos(i.l, "Length"), pos(i.w, "Height"), nos), unit: "Sq M" };
    case "STEEL":
      return { qty: steelWeightKg(pos(i.diaMm, "Diameter"), pos(i.lengthM, "Length"), nos), unit: "Kg" };
  }
}

/** Rakam = qty × rate (paise, half-up). Rate na ho to 0. */
export function workAmount(qty: number, ratePaise: Paise | null | undefined): Paise {
  return ratePaise ? roundHalfUp(qty * ratePaise) : 0;
}

export interface WorkEntryLite {
  id: string;
  businessDate: string;
  type: WorkType;
  qty: number;
  unit: WorkUnit;
  contractorId: string;
  ratePaise?: Paise | null;
  deleted?: unknown;
}

export interface TypeTotal {
  qty: number;
  amountPaise: Paise;
  entries: number;
  unit: WorkUnit;
}

export interface WorkTotals {
  byType: Partial<Record<WorkType, TypeTotal>>;
  byContractor: Record<string, { amountPaise: Paise; byType: Partial<Record<WorkType, TypeTotal>> }>;
  /** Sirf thekedaron ka (COMPANY ka apna kaam bill nahi) */
  billablePaise: Paise;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function addTo(map: Partial<Record<WorkType, TypeTotal>>, e: WorkEntryLite, amount: Paise): void {
  const t = (map[e.type] ??= { qty: 0, amountPaise: 0, entries: 0, unit: WORK_UNIT[e.type] });
  t.qty = r2(t.qty + e.qty);
  t.amountPaise += amount;
  t.entries += 1;
}

export function workTotals(entries: WorkEntryLite[]): WorkTotals {
  const out: WorkTotals = { byType: {}, byContractor: {}, billablePaise: 0 };
  for (const e of entries) {
    if (e.deleted) continue;
    const amount = workAmount(e.qty, e.ratePaise);
    addTo(out.byType, e, amount);
    const c = (out.byContractor[e.contractorId] ??= { amountPaise: 0, byType: {} });
    c.amountPaise += amount;
    addTo(c.byType, e, amount);
    if (e.contractorId !== "COMPANY") out.billablePaise += amount;
  }
  return out;
}

export interface WorkStatement {
  days: { businessDate: string; amountPaise: Paise; entries: WorkEntryLite[] }[];
  totals: Partial<Record<WorkType, TypeTotal>>;
  amountPaise: Paise;
}

/** Ek thekedar ka day-wise statement */
export function workStatement(entries: WorkEntryLite[], contractorId: string): WorkStatement {
  const mine = entries.filter((e) => !e.deleted && e.contractorId === contractorId).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const days: WorkStatement["days"] = [];
  const totals: WorkStatement["totals"] = {};
  let sum = 0;
  for (const e of mine) {
    const a = workAmount(e.qty, e.ratePaise);
    let d = days[days.length - 1];
    if (!d || d.businessDate !== e.businessDate) days.push((d = { businessDate: e.businessDate, amountPaise: 0, entries: [] }));
    d.amountPaise += a;
    d.entries.push(e);
    addTo(totals, e, a);
    sum += a;
  }
  return { days, totals, amountPaise: sum };
}
