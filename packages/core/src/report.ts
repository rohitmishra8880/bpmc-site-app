// PDF report ke liye data ko table mein dhaalna. Hisab nahi badalta — sirf saved entries / server ke hisab ko sajata hai.
import type { StaffMark } from "./attendance";
import type { LedgerEntryType } from "./ledger";
import type { Paise } from "./money";

export interface MarkEntry {
  key: string;
  businessDate: string;
  mark: StaffMark;
  otHours?: number | null;
  /** Us din save hua rate (labour) */
  ratePaise?: Paise | null;
  rev?: number;
  deleted?: unknown;
}

export interface DayMark {
  mark: StaffMark;
  otHours: number;
  ratePaise?: Paise;
}

/** key (staff / labour) → tarikh → mark. Ek din ki kai entry ho to sabse bada rev; hataayi entry nahi. */
export function latestMarks(entries: MarkEntry[]): Record<string, Record<string, DayMark>> {
  const best = new Map<string, MarkEntry>();
  for (const e of entries) {
    if (e.deleted) continue;
    const k = `${e.key}\u0000${e.businessDate}`;
    const cur = best.get(k);
    if (!cur || (e.rev ?? 0) >= (cur.rev ?? 0)) best.set(k, e);
  }
  const out: Record<string, Record<string, DayMark>> = {};
  for (const e of best.values()) (out[e.key] ??= {})[e.businessDate] = { mark: e.mark, otHours: Number(e.otHours) || 0, ...(e.ratePaise != null ? { ratePaise: e.ratePaise } : {}) };
  return out;
}

export interface LedgerLine {
  id: string;
  businessDate: string;
  type: LedgerEntryType;
  amountPaise: Paise;
  deleted?: unknown;
}

export interface LedgerRow extends LedgerLine {
  debitPaise: Paise;
  creditPaise: Paise;
  /** Chalta baaki: + = humein dena hai */
  balancePaise: Paise;
}

/** Khata: BILL baaki badhata hai; PAYMENT / RECOVERY / DEBIT_NOTE ghatate hain. */
export function runningLedger(entries: LedgerLine[], openingPaise: Paise = 0): LedgerRow[] {
  let bal = openingPaise;
  return entries
    .filter((e) => !e.deleted)
    .slice()
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
    .map((e) => {
      const debit = e.type === "BILL" ? e.amountPaise : 0;
      const credit = e.type === "BILL" ? 0 : e.amountPaise;
      bal += debit - credit;
      return { ...e, debitPaise: debit, creditPaise: credit, balancePaise: bal };
    });
}

/** PDF save karte waqt ka naam: "Project - Report - Period" (Windows / Drive mein mana chinh hata ke) */
export function reportFileName(project: string, title: string, period: string): string {
  return [project, title, period]
    .join(" - ")
    .replace(/\s*[\\/:*?"<>|]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}
