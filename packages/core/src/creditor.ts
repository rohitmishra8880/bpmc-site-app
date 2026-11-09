// Creditors / Party ledger: bakaya = kul bill − kul bhugtan (− debit note / katauti).
// Overdue: bhugtan pehle sabse purane bill mein (FIFO); credit period ke baad bhi baaki bill = overdue.
import { addDays } from "./date";
import { runningLedger, type LedgerLine, type LedgerRow } from "./report";
import type { Paise } from "./money";

export interface PartyStatus {
  billPaise: Paise;
  paidPaise: Paise;
  /** Debit note + katauti (recovery) */
  lessPaise: Paise;
  /** + = humein dena hai; − = party / thekedar se lena hai (ya advance diya) */
  bakayaPaise: Paise;
  overduePaise: Paise;
  /** Sabse purane overdue bill ko due hue kitne din */
  overdueDays: number;
  oldestUnpaid: string | null;
  lastPayment: string | null;
  entries: number;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export function partyStatus(entries: LedgerLine[], asOf: string, creditDays: number | null | undefined): PartyStatus {
  const live = entries.filter((e) => !e.deleted).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  let bill = 0;
  let paid = 0;
  let less = 0;
  let lastPayment: string | null = null;
  for (const e of live) {
    if (e.amountPaise < 0) throw new Error("Ledger amount cannot be negative");
    if (e.type === "BILL") bill += e.amountPaise;
    else if (e.type === "PAYMENT") {
      paid += e.amountPaise;
      if (!lastPayment || e.businessDate > lastPayment) lastPayment = e.businessDate;
    } else less += e.amountPaise;
  }
  // FIFO: saara credit (bhugtan + debit note + katauti) purane bill se ghatao
  let credit = paid + less;
  const open: { date: string; left: Paise }[] = [];
  for (const e of live.filter((x) => x.type === "BILL")) {
    const use = Math.min(credit, e.amountPaise);
    credit -= use;
    if (e.amountPaise - use > 0) open.push({ date: e.businessDate, left: e.amountPaise - use });
  }
  const days = Math.max(0, creditDays ?? 0);
  let overdue = 0;
  let overdueDays = 0;
  for (const b of open) {
    const late = dayNum(asOf) - dayNum(addDays(b.date, days));
    if (late > 0) {
      overdue += b.left;
      overdueDays = Math.max(overdueDays, late);
    }
  }
  return {
    billPaise: bill, paidPaise: paid, lessPaise: less, bakayaPaise: bill - paid - less,
    overduePaise: overdue, overdueDays, oldestUnpaid: open[0]?.date ?? null, lastPayment, entries: live.length,
  };
}

export interface ContractorStatement {
  openingPaise: Paise;
  workBillPaise: Paise;
  advancePaise: Paise;
  /** Company ne is thekedar ki labour ko jo diya (Master mein "bill se kaato" = Yes) */
  labourPaidPaise: Paise;
  paidPaise: Paise;
  /** Debit note + katauti (toota / kho gaya saman) */
  lessPaise: Paise;
  closingPaise: Paise;
  rows: LedgerRow[];
}

/** Thekedar ka khata from..to: opening + kaam ka bill − advance − labour − bhugtan − katauti = closing */
export function contractorStatement(lines: LedgerLine[], from: string, to: string): ContractorStatement {
  const all = runningLedger(lines);
  const before = all.filter((r) => r.businessDate < from);
  const rows = all.filter((r) => r.businessDate >= from && r.businessDate <= to);
  const opening = before.length ? before[before.length - 1]!.balancePaise : 0;
  const s: ContractorStatement = { openingPaise: opening, workBillPaise: 0, advancePaise: 0, labourPaidPaise: 0, paidPaise: 0, lessPaise: 0, closingPaise: opening, rows };
  for (const r of rows) {
    if (r.type === "BILL") s.workBillPaise += r.amountPaise;
    else if (r.type !== "PAYMENT") s.lessPaise += r.amountPaise;
    else if (r.paymentKind === "ADVANCE") s.advancePaise += r.amountPaise;
    else if (r.paymentKind === "LABOUR") s.labourPaidPaise += r.amountPaise;
    else s.paidPaise += r.amountPaise;
  }
  s.closingPaise = opening + s.workBillPaise - s.advancePaise - s.labourPaidPaise - s.paidPaise - s.lessPaise;
  return s;
}
