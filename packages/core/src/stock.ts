// Stock ka hisab: Balance = Opening + Inward − Uses; aaj ka opening = kal ka closing.
// Hamesha movements se banta hai — kabhi haath se type nahi. Purana din badla to bas dobara chalao.
import { dateRange } from "./date";

export type StockMoveType = "IN" | "USE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUST";

export interface StockMove {
  id: string;
  itemId: string;
  businessDate: string;
  type: StockMoveType;
  /** Base unit mein. IN / USE / TRANSFER positive; ADJUST + ya −. */
  qty: number;
  deleted?: boolean;
}

export interface DayItemBalance {
  opening: number;
  inward: number;
  uses: number;
  adjust: number;
  closing: number;
}

export interface StockDay {
  date: string;
  items: Record<string, DayItemBalance>;
}

// 3 decimal tak integer "milli" mein jodo, taaki float drift na ho.
const toMilli = (q: number) => Math.round(q * 1000);
const fromMilli = (m: number) => m / 1000;

function signedMilli(m: StockMove): { inward: number; uses: number; adjust: number } {
  const q = toMilli(m.qty);
  if (m.type !== "ADJUST" && q < 0) throw new Error(`Movement ${m.id}: quantity cannot be negative`);
  switch (m.type) {
    case "IN":
    case "TRANSFER_IN":
      return { inward: q, uses: 0, adjust: 0 };
    case "USE":
    case "TRANSFER_OUT":
      return { inward: 0, uses: q, adjust: 0 };
    case "ADJUST":
      return { inward: 0, uses: 0, adjust: q };
  }
}

/**
 * from se to tak har din, har item ka Opening / Inward / Uses / Closing.
 * `from` se pehle ki saari movements opening mein jud jaati hain.
 */
export function buildStockLedger(moves: StockMove[], from: string, to: string, itemIds?: string[]): StockDay[] {
  const live = moves.filter((m) => !m.deleted);
  const items = itemIds ?? [...new Set(live.map((m) => m.itemId))].sort();
  const running = new Map<string, number>(items.map((i) => [i, 0]));
  const byDate = new Map<string, StockMove[]>();

  for (const m of live) {
    if (!running.has(m.itemId)) continue;
    if (m.businessDate < from) {
      const s = signedMilli(m);
      running.set(m.itemId, running.get(m.itemId)! + s.inward - s.uses + s.adjust);
    } else if (m.businessDate <= to) {
      const list = byDate.get(m.businessDate) ?? [];
      list.push(m);
      byDate.set(m.businessDate, list);
    }
  }

  return dateRange(from, to).map((date) => {
    const totals = new Map(items.map((i) => [i, { inward: 0, uses: 0, adjust: 0 }]));
    for (const m of byDate.get(date) ?? []) {
      const t = totals.get(m.itemId)!;
      const s = signedMilli(m);
      t.inward += s.inward;
      t.uses += s.uses;
      t.adjust += s.adjust;
    }
    const day: StockDay = { date, items: {} };
    for (const i of items) {
      const opening = running.get(i)!;
      const t = totals.get(i)!;
      const closing = opening + t.inward - t.uses + t.adjust;
      running.set(i, closing);
      day.items[i] = {
        opening: fromMilli(opening),
        inward: fromMilli(t.inward),
        uses: fromMilli(t.uses),
        adjust: fromMilli(t.adjust),
        closing: fromMilli(closing),
      };
    }
    return day;
  });
}
