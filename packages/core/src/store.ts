// Store / Saman Register (CLAUDE.md R3). Har cheez movement hai; balance yahin se banta hai.
//
// Returnable: INWARD → ISSUE (thekedar) → RETURN (OK / DAMAGED wapas store mein; BROKEN / LOST khata band, store mein nahi).
// Consumable: INWARD → CONSUME. Dono: TRANSFER_OUT / TRANSFER_IN (doosri site).

import { isBusinessDate } from "./date";

export type StoreMoveType = "INWARD" | "ISSUE" | "RETURN" | "CONSUME" | "TRANSFER_OUT" | "TRANSFER_IN";
export type ReturnCondition = "OK" | "DAMAGED" | "BROKEN" | "LOST";
export type StoreCategory = "RETURNABLE" | "CONSUMABLE";

export interface StoreMove {
  id: string;
  type: StoreMoveType;
  itemId: string;
  qty: number;
  businessDate: string;
  contractorId?: string;
  condition?: ReturnCondition;
  otherProjectId?: string;
  deleted?: unknown;
}

export interface StoreBalance {
  inward: number;
  issued: number;
  returnedOk: number;
  damaged: number;
  broken: number;
  lost: number;
  consumed: number;
  transferIn: number;
  transferOut: number;
  /** Store mein abhi (kharab wapas aaya bhi shamil). */
  inStore: number;
  /** Thekedaron ke paas abhi. */
  withContractors: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function live(moves: StoreMove[]): StoreMove[] {
  const out = moves.filter((m) => !m.deleted);
  for (const m of out) {
    if (!(Number.isFinite(m.qty) && m.qty > 0)) throw new Error(`Store move ${m.id}: qty must be more than 0`);
    if (!isBusinessDate(m.businessDate)) throw new Error(`Store move ${m.id}: bad date "${m.businessDate}"`);
    if ((m.type === "ISSUE" || m.type === "RETURN") && !m.contractorId) throw new Error(`Store move ${m.id}: contractor missing`);
  }
  return out;
}

function empty(): StoreBalance {
  return { inward: 0, issued: 0, returnedOk: 0, damaged: 0, broken: 0, lost: 0, consumed: 0, transferIn: 0, transferOut: 0, inStore: 0, withContractors: 0 };
}

function add(b: StoreBalance, m: StoreMove): void {
  const q = m.qty;
  switch (m.type) {
    case "INWARD": b.inward += q; b.inStore += q; break;
    case "ISSUE": b.issued += q; b.inStore -= q; b.withContractors += q; break;
    case "CONSUME": b.consumed += q; b.inStore -= q; break;
    case "TRANSFER_OUT": b.transferOut += q; b.inStore -= q; break;
    case "TRANSFER_IN": b.transferIn += q; b.inStore += q; break;
    case "RETURN": {
      b.withContractors -= q;
      const c = m.condition ?? "OK";
      if (c === "OK") { b.returnedOk += q; b.inStore += q; }
      else if (c === "DAMAGED") { b.damaged += q; b.inStore += q; }
      else if (c === "BROKEN") b.broken += q;
      else b.lost += q;
      break;
    }
  }
}

function round(b: StoreBalance): StoreBalance {
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r3(v)])) as unknown as StoreBalance;
}

/** Har saman ka poora hisab (sab movements se). */
export function storeLedger(moves: StoreMove[]): Record<string, StoreBalance> {
  const out: Record<string, StoreBalance> = {};
  for (const m of live(moves)) add((out[m.itemId] ??= empty()), m);
  for (const k of Object.keys(out)) out[k] = round(out[k]!);
  return out;
}

export interface StoreStatementRow extends Omit<StoreBalance, "inStore" | "withContractors"> {
  openingStore: number;
  closingStore: number;
  openingWithContractors: number;
  closingWithContractors: number;
}

/** from..to (dono shamil) ka statement: opening = from se pehle ka closing. */
export function storeStatement(moves: StoreMove[], from: string, to: string): Record<string, StoreStatementRow> {
  const all = live(moves);
  const before = storeLedger(all.filter((m) => m.businessDate < from));
  const during = storeLedger(all.filter((m) => m.businessDate >= from && m.businessDate <= to));
  const out: Record<string, StoreStatementRow> = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(during)])) {
    const o = before[id] ?? empty();
    const { inStore, withContractors, ...d } = during[id] ?? empty();
    out[id] = {
      ...d,
      openingStore: o.inStore,
      openingWithContractors: o.withContractors,
      closingStore: r3(o.inStore + inStore),
      closingWithContractors: r3(o.withContractors + withContractors),
    };
  }
  return out;
}

export interface Holding {
  contractorId: string;
  itemId: string;
  qty: number;
  /** Sabse purana jo abhi tak wapas nahi aaya — us din se. */
  since: string;
  days: number;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Thekedar ke paas abhi kya pada hai. Wapsi pehle diye hue se ghat-ti hai (FIFO). */
export function contractorHoldings(moves: StoreMove[], asOf: string): Holding[] {
  const order = { ISSUE: 0, RETURN: 1 } as Record<string, number>;
  const rel = live(moves)
    .filter((m) => m.type === "ISSUE" || m.type === "RETURN")
    .sort((a, b) => (a.businessDate < b.businessDate ? -1 : a.businessDate > b.businessDate ? 1 : order[a.type]! - order[b.type]!));
  const lots = new Map<string, { date: string; qty: number }[]>();
  for (const m of rel) {
    const key = `${m.contractorId}\u0000${m.itemId}`;
    const q = lots.get(key) ?? [];
    lots.set(key, q);
    if (m.type === "ISSUE") q.push({ date: m.businessDate, qty: m.qty });
    else {
      let left = m.qty;
      while (left > 1e-9 && q.length) {
        const take = Math.min(left, q[0]!.qty);
        q[0]!.qty -= take;
        left -= take;
        if (q[0]!.qty <= 1e-9) q.shift();
      }
    }
  }
  const out: Holding[] = [];
  for (const [key, q] of lots) {
    if (!q.length) continue;
    const [contractorId, itemId] = key.split("\u0000") as [string, string];
    const since = q[0]!.date;
    out.push({ contractorId, itemId, qty: r3(q.reduce((s, l) => s + l.qty, 0)), since, days: Math.max(0, dayNum(asOf) - dayNum(since)) });
  }
  return out.sort((a, b) => a.contractorId.localeCompare(b.contractorId) || a.itemId.localeCompare(b.itemId));
}

export type StoreAlert =
  | { kind: "LOW_STOCK"; itemId: string; qty: number; limit: number }
  | { kind: "NOT_RETURNED"; itemId: string; contractorId: string; qty: number; days: number };

/** Consumable apni limit se kam; returnable `overdueDays` ya zyada din se wapas nahi aaya. */
export function storeAlerts(
  balances: Record<string, { inStore: number }>,
  items: Record<string, { name?: string; category: StoreCategory; minStock?: number | null }>,
  holdings: Holding[],
  overdueDays: number,
): StoreAlert[] {
  const out: StoreAlert[] = [];
  for (const [itemId, it] of Object.entries(items)) {
    const limit = it.minStock ?? 0;
    const qty = balances[itemId]?.inStore ?? 0;
    if (it.category === "CONSUMABLE" && limit > 0 && qty < limit) out.push({ kind: "LOW_STOCK", itemId, qty, limit });
  }
  for (const h of holdings) {
    if (h.days >= overdueDays) out.push({ kind: "NOT_RETURNED", itemId: h.itemId, contractorId: h.contractorId, qty: h.qty, days: h.days });
  }
  return out;
}

/** Bade saman ke number: PREFIX-01, -02 … (sabse bade number ke baad; 2 ank kam se kam). */
export function assignTags(prefix: string, existing: string[], count: number): string[] {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const t of existing) {
    const m = re.exec(t);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(max + i + 1).padStart(2, "0")}`);
}
