// Saman ki rakam aur party ka khata.
import { roundHalfUp, type Paise } from "./money";

export interface LineAmount {
  basePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
}

/** Kul rakam = Qty × Rate (+ GST) → 10 × ₹450 + 18% = ₹5,310 */
export function lineAmount(qty: number, ratePaise: Paise, gstPct = 0): LineAmount {
  if (gstPct < 0 || gstPct > 100) throw new Error(`GST % galat: ${gstPct}`);
  const basePaise = roundHalfUp(qty * ratePaise);
  const gstPaise = roundHalfUp((basePaise * gstPct) / 100);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}

export type LedgerEntryType = "BILL" | "PAYMENT" | "DEBIT_NOTE" | "RECOVERY";

export interface LedgerEntry {
  type: LedgerEntryType;
  amountPaise: Paise;
  deleted?: boolean;
}

export interface PartyBalance {
  totalBillPaise: Paise;
  totalPaidPaise: Paise;
  /** Kul bill − Kul bhugtan. Negative = party se lena hai. */
  bakayaPaise: Paise;
}

/** Bakaya = Kul bill − Kul bhugtan (debit note / recovery bill ko ghatate hain) */
export function partyBalance(entries: LedgerEntry[]): PartyBalance {
  let bill = 0;
  let paid = 0;
  for (const e of entries) {
    if (e.deleted) continue;
    if (e.amountPaise < 0) throw new Error("Khata entry ki rakam negative nahi ho sakti");
    if (e.type === "BILL") bill += e.amountPaise;
    else if (e.type === "PAYMENT") paid += e.amountPaise;
    else bill -= e.amountPaise;
  }
  return { totalBillPaise: bill, totalPaidPaise: paid, bakayaPaise: bill - paid };
}
