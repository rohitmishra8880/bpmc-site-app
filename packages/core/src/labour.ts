// Labour attendance (naam-wise, hafte ka sheet) — Rohit ka design (PLAN.md Phase 2):
//  kamai = din × rate (P = 1, HD = ½, A = 0) + OT ghante × (rate ÷ 8); khata = kamai − advance / bhugtan.
import { addDays, isBusinessDate } from "./date";
import type { MusterEntry, StaffMark } from "./attendance";
import { roundHalfUp, type Paise } from "./money";

/** Hafte ka Monday */
export function weekStart(date: string): string {
  if (!isBusinessDate(date)) throw new Error(`Invalid date: "${date}"`);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Mon … Sun */
export function weekDates(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface LabourMark {
  businessDate: string;
  mark: StaffMark;
  otHours?: number | null;
  /** Save ke waqt ka rate — baad mein master ka rate badle to purana hisab nahi badalta */
  ratePaise?: Paise | null;
  deleted?: boolean;
}

export interface LabourEarning {
  days: number;
  otHours: number;
  wagesPaise: Paise;
  otPaise: Paise;
  amountPaise: Paise;
}

const FRACTION: Record<StaffMark, number> = { P: 1, HD: 0.5, A: 0 };

export function labourEarning(marks: LabourMark[], defaultRatePaise: Paise, shiftHours = 8): LabourEarning {
  const seen = new Set<string>();
  let days = 0;
  let ot = 0;
  let wages = 0;
  let otAmt = 0;
  for (const m of marks) {
    if (m.deleted) continue;
    if (seen.has(m.businessDate)) throw new Error(`${m.businessDate}: two attendance marks on the same day`);
    seen.add(m.businessDate);
    const h = m.otHours ?? 0;
    if (!Number.isFinite(h) || h < 0 || h > 16) throw new Error(`${m.businessDate}: overtime must be 0–16 hours`);
    if (m.mark === "A" && h > 0) throw new Error(`${m.businessDate}: no overtime on an Absent day`);
    const rate = m.ratePaise ?? defaultRatePaise;
    days += FRACTION[m.mark];
    ot += h;
    wages += rate * FRACTION[m.mark];
    otAmt += (rate / shiftHours) * h;
  }
  const wagesPaise = roundHalfUp(wages);
  const otPaise = roundHalfUp(otAmt);
  return { days, otHours: roundHalfUp(ot, 2), wagesPaise, otPaise, amountPaise: wagesPaise + otPaise };
}

export interface LabourKhata extends LabourEarning {
  earnedPaise: Paise;
  paidPaise: Paise;
  /** Plus = labour ko dena; minus = labour par advance baaki */
  balancePaise: Paise;
}

export function labourKhata(input: {
  ratePaise: Paise;
  marks: LabourMark[];
  payments: { kind: "ADVANCE" | "PAYMENT"; amountPaise: Paise; deleted?: boolean }[];
  shiftHours?: number;
}): LabourKhata {
  const e = labourEarning(input.marks, input.ratePaise, input.shiftHours);
  let paid = 0;
  for (const p of input.payments) {
    if (p.deleted) continue;
    if (p.amountPaise < 0) throw new Error("Payment amount cannot be negative");
    paid += p.amountPaise;
  }
  return { ...e, earnedPaise: e.amountPaise, paidPaise: paid, balancePaise: e.amountPaise - paid };
}

export type LabourType = "MISTRI" | "KULI" | "REJA";

/**
 * Din ki labour gin-ti: thekedar ki gin-ti wali entry + naam-wise haazri (P / HD = haazir).
 * Kisi group ki naam-wise haazri ho to wahi gini jaati hai (dono tarah se double na ho).
 */
export function combineLabour(counts: MusterEntry[], named: { group: string; type: LabourType; mark: StaffMark }[]): MusterEntry[] {
  const byGroup = new Map<string, MusterEntry>();
  for (const n of named) {
    const g = byGroup.get(n.group) ?? { contractorId: n.group, mistri: 0, kuli: 0, reja: 0 };
    if (n.mark !== "A") {
      if (n.type === "MISTRI") g.mistri++;
      else if (n.type === "KULI") g.kuli++;
      else g.reja++;
    }
    byGroup.set(n.group, g);
  }
  const out = counts.filter((c) => !c.deleted && !byGroup.has(c.contractorId)).map((c) => ({ contractorId: c.contractorId, mistri: c.mistri, kuli: c.kuli, reja: c.reja }));
  return [...out, ...byGroup.values()];
}
