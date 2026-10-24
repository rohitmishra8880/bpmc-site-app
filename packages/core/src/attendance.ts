// Haazri: thekedar ka labour muster (Mistri / Kuli / Reja) aur company staff ki kamai + khata.
import { roundHalfUp, type Paise } from "./money";

export interface MusterEntry {
  contractorId: string;
  mistri: number;
  kuli: number;
  reja: number;
  deleted?: boolean;
}

export interface Headcount {
  mistri: number;
  kuli: number;
  reja: number;
  total: number;
}

export interface LabourDay {
  byContractor: Record<string, Headcount>;
  totals: Headcount;
}

function count(n: number, what: string, who: string): number {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${who}: ${what} must be a whole number (0 or more)`);
  return n;
}

/** Ek din ka muster — thekedar-wise aur kul. Ek thekedar ki ek hi entry (server pehle sabse nayi chunta hai). */
export function labourDay(entries: MusterEntry[]): LabourDay {
  const byContractor: Record<string, Headcount> = {};
  const totals: Headcount = { mistri: 0, kuli: 0, reja: 0, total: 0 };
  for (const e of entries) {
    if (e.deleted) continue;
    if (byContractor[e.contractorId]) throw new Error(`${e.contractorId}: two muster entries on the same day`);
    const h = {
      mistri: count(e.mistri, "Mistri", e.contractorId),
      kuli: count(e.kuli, "Kuli", e.contractorId),
      reja: count(e.reja, "Reja", e.contractorId),
      total: 0,
    };
    h.total = h.mistri + h.kuli + h.reja;
    byContractor[e.contractorId] = h;
    totals.mistri += h.mistri;
    totals.kuli += h.kuli;
    totals.reja += h.reja;
    totals.total += h.total;
  }
  return { byContractor, totals };
}

export type StaffMark = "P" | "A" | "HD";
/** ADVANCE / SALARY = company ne diya; EXPENSE = staff ne site ke liye apna paisa lagaya (company ko lautana) */
export type StaffPaymentKind = "ADVANCE" | "SALARY" | "EXPENSE";

export interface StaffKhataInput {
  /** Mahine ki tankhwah (paise). null = set nahi. */
  salaryPaise: Paise | null;
  attendance: { businessDate: string; mark: StaffMark; deleted?: boolean }[];
  payments: { businessDate: string; kind: StaffPaymentKind; amountPaise: Paise; deleted?: boolean }[];
  /** Din-rate = tankhwah ÷ divisor (rental jaisa 30) */
  divisor?: number;
}

export interface StaffKhata {
  dayRatePaise: Paise;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  earnedPaise: Paise;
  expensePaise: Paise;
  paidPaise: Paise;
  /** Kamai + kharcha − diya. Plus = company ko dena, minus = staff par baaki (advance zyada). */
  balancePaise: Paise;
}

export function staffKhata(input: StaffKhataInput): StaffKhata {
  const divisor = input.divisor ?? 30;
  const seen = new Set<string>();
  let present = 0;
  let half = 0;
  let absent = 0;
  for (const a of input.attendance) {
    if (a.deleted) continue;
    if (seen.has(a.businessDate)) throw new Error(`${a.businessDate}: two attendance marks on the same day`);
    seen.add(a.businessDate);
    if (a.mark === "P") present++;
    else if (a.mark === "HD") half++;
    else absent++;
  }
  const salary = input.salaryPaise ?? 0;
  const earnedPaise = roundHalfUp((salary * (present + half * 0.5)) / divisor);
  let paidPaise = 0;
  let expensePaise = 0;
  for (const p of input.payments) {
    if (p.deleted) continue;
    if (p.amountPaise < 0) throw new Error("Payment amount cannot be negative");
    if (p.kind === "EXPENSE") expensePaise += p.amountPaise;
    else paidPaise += p.amountPaise;
  }
  return {
    dayRatePaise: roundHalfUp(salary / divisor),
    presentDays: present,
    halfDays: half,
    absentDays: absent,
    earnedPaise,
    expensePaise,
    paidPaise,
    balancePaise: earnedPaise + expensePaise - paidPaise,
  };
}
