// Purana hisab ek jagah: labour ka hafta-wise aur staff ka mahina-wise statement (chalta baaki ke saath).
import { staffKhata, type StaffKhataInput } from "./attendance";
import { labourEarning, weekStart, type LabourMark } from "./labour";
import type { Paise } from "./money";

export interface LabourWeekRow {
  weekStart: string;
  days: number;
  otHours: number;
  earnedPaise: Paise;
  paidPaise: Paise;
  /** Shuru se is hafte ke ant tak ka baaki */
  balancePaise: Paise;
}

export function labourStatement(input: {
  ratePaise: Paise;
  marks: LabourMark[];
  payments: { businessDate: string; amountPaise: Paise; deleted?: boolean }[];
  shiftHours?: number;
}): LabourWeekRow[] {
  const marks = new Map<string, LabourMark[]>();
  const paid = new Map<string, number>();
  for (const m of input.marks) {
    if (m.deleted) continue;
    const w = weekStart(m.businessDate);
    marks.set(w, [...(marks.get(w) ?? []), m]);
  }
  for (const p of input.payments) {
    if (p.deleted) continue;
    const w = weekStart(p.businessDate);
    paid.set(w, (paid.get(w) ?? 0) + p.amountPaise);
  }
  let running = 0;
  return [...new Set([...marks.keys(), ...paid.keys()])].sort().map((w) => {
    const e = labourEarning(marks.get(w) ?? [], input.ratePaise, input.shiftHours);
    const p = paid.get(w) ?? 0;
    running += e.amountPaise - p;
    return { weekStart: w, days: e.days, otHours: e.otHours, earnedPaise: e.amountPaise, paidPaise: p, balancePaise: running };
  });
}

export interface StaffMonthRow {
  month: string;
  present: number;
  halfDay: number;
  absent: number;
  earnedPaise: Paise;
  expensePaise: Paise;
  paidPaise: Paise;
  /** Shuru se is mahine ke ant tak ka baaki */
  balancePaise: Paise;
}

export function staffMonthly(input: StaffKhataInput): StaffMonthRow[] {
  const months = new Set<string>();
  input.attendance.forEach((a) => !a.deleted && months.add(a.businessDate.slice(0, 7)));
  input.payments.forEach((p) => !p.deleted && months.add(p.businessDate.slice(0, 7)));
  let running = 0;
  return [...months].sort().map((m) => {
    const k = staffKhata({
      ...input,
      attendance: input.attendance.filter((a) => a.businessDate.startsWith(m)),
      payments: input.payments.filter((p) => p.businessDate.startsWith(m)),
    });
    running += k.balancePaise;
    return { month: m, present: k.presentDays, halfDay: k.halfDays, absent: k.absentDays, earnedPaise: k.earnedPaise, expensePaise: k.expensePaise, paidPaise: k.paidPaise, balancePaise: running };
  });
}

/**
 * Weekly sheet par labour dikhe ya nahi: chalu → haan; band (site chhod di) → sirf un hafton mein jahan
 * woh tha (leftOn hafte ke andar / baad) ya jis hafte ki entry hai — purana hisab kabhi chhupna nahi chahiye.
 */
export function labourVisibleInWeek(l: { active?: boolean; leftOn?: string | null }, weekStartDate: string, hasEntries: boolean): boolean {
  if (hasEntries) return true;
  if (l.active !== false) return true;
  return !!l.leftOn && l.leftOn >= weekStartDate;
}
