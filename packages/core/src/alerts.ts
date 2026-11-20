// Alerts + notifications (Phase 3): server ek hi list banata hai → Dashboard, header ki ghanti, Alerts page sab wahi padhte hain.
// Galti #12 (purana app): "0 Active" jabki notification dikh rahi thi, breakdown alert nahi aaya, fake message — yahan har alert asli data se.

import { addDays, EDIT_WINDOW_DAYS, formatDate, toBusinessDateIST } from "./date";
import { formatINR, formatQtyShort } from "./money";
import type { StoreAlert } from "./store";

export type AlertKind = "BREAKDOWN" | "LOW_MATERIAL" | "STORE_LOW" | "NOT_RETURNED" | "OVERDUE" | "DPR_NOT_LOCKED" | "BACKUP_STALE" | "ATTENDANCE_NO_PHOTO";
export type AlertSeverity = "crit" | "warn" | "info";

export interface SiteAlert {
  /** Pakki pehchaan — number badalne par nahi badalti (naya notification sirf naye key par) */
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  text: string;
  /** App ke andar kahan jaana hai */
  link: string;
  since: string | null;
  adminOnly: boolean;
}

export interface AlertMachineLog {
  machineId: string;
  businessDate: string;
  status: string;
  breakdownFrom?: string | null;
  breakdownTo?: string | null;
  breakdownReason?: string | null;
  deleted?: boolean;
}

export interface AlertInput {
  today: string;
  now: Date;
  /** Kal aur aaj ke log (save hone ke kram mein — ek din ki baad wali entry jeetti hai) */
  machineLogs: AlertMachineLog[];
  machineNames: Record<string, string>;
  /** Aaj tak ka sabse naya stock hisab (days/{date}.stock) */
  stock: { date: string; items: Record<string, { closing: number }> } | null;
  materials: Record<string, { name: string; baseUnit?: string | null; minStock?: number | null }>;
  storeAlerts: StoreAlert[];
  storeItemNames: Record<string, string>;
  contractorNames: Record<string, string>;
  /** kind CONTRACTOR ka overdue alert nahi banta (thekedar ko RA bill se paisa — Rohit) */
  parties: Record<string, { name: string; overduePaise: number; bakayaPaise: number; kind?: string | null }>;
  /** Jin dino ki DPR abhi Draft hai (lock nahi) */
  draftDprDates: string[];
  lastBackupAt: Date | null;
  /** Zaroori photo wali haazri bina photo (attendanceMissingPhotos) — kal / aaj */
  missingPhotos?: { date: string; names: string[] }[];
}

/** Backup itne ghante se purana → alert (roz raat ~11:30 chalta hai) */
export const BACKUP_STALE_HOURS = 30;

const SEV: Record<AlertSeverity, number> = { crit: 0, warn: 1, info: 2 };
const UNIT_SHORT: Record<string, string> = { Ltr: "L" };
const unitOf = (u?: string | null) => (u ? ` ${UNIT_SHORT[u] ?? u}` : "");

function breakdowns(i: AlertInput): SiteAlert[] {
  const byMachine = new Map<string, Map<string, AlertMachineLog>>();
  for (const l of i.machineLogs) {
    if (l.deleted || !l.machineId || !l.businessDate) continue;
    const days = byMachine.get(l.machineId) ?? new Map<string, AlertMachineLog>();
    days.set(l.businessDate, l); // ek din ki baad wali entry
    byMachine.set(l.machineId, days);
  }
  const out: SiteAlert[] = [];
  for (const [mid, days] of byMachine) {
    const dates = [...days.keys()].sort().reverse();
    const last = days.get(dates[0]!)!;
    if (last.status !== "BREAKDOWN" || last.breakdownTo) continue;
    // Lagatar breakdown wale din peeche tak — "since" pehla din
    let first = last;
    for (const d of dates.slice(1)) {
      const l = days.get(d)!;
      if (l.status !== "BREAKDOWN" || l.breakdownTo) break;
      first = l;
    }
    const name = i.machineNames[mid] || mid;
    const reason = last.breakdownReason || first.breakdownReason;
    out.push({
      key: `BREAKDOWN:${mid}`,
      kind: "BREAKDOWN",
      severity: "crit",
      title: "Machine breakdown",
      text: `${name} is in breakdown since ${formatDate(first.businessDate)}${first.breakdownFrom ? ` ${first.breakdownFrom}` : ""}${reason ? ` — ${reason}` : ""}`,
      link: "/machinery",
      since: first.businessDate,
      adminOnly: false,
    });
  }
  return out;
}

function lowMaterial(i: AlertInput): SiteAlert[] {
  if (!i.stock) return [];
  const out: SiteAlert[] = [];
  for (const [id, b] of Object.entries(i.stock.items)) {
    const m = i.materials[id];
    const limit = m?.minStock ?? 0;
    if (!m || !(limit > 0) || !(b.closing < limit)) continue;
    const u = unitOf(m.baseUnit);
    out.push({
      key: `LOW_MATERIAL:${id}`,
      kind: "LOW_MATERIAL",
      severity: b.closing <= 0 ? "crit" : "warn",
      title: "Material running low",
      text: `${m.name}: ${formatQtyShort(b.closing)}${u} left (limit ${formatQtyShort(limit)}${u})${i.stock.date < i.today ? ` — last calculated ${formatDate(i.stock.date)}` : ""}`,
      link: "/inventory",
      since: i.stock.date,
      adminOnly: false,
    });
  }
  return out;
}

function store(i: AlertInput): SiteAlert[] {
  return i.storeAlerts.map((a): SiteAlert => {
    const item = i.storeItemNames[a.itemId] || a.itemId;
    if (a.kind === "LOW_STOCK")
      return { key: `STORE_LOW:${a.itemId}`, kind: "STORE_LOW", severity: "warn", title: "Store item running low", text: `${item}: only ${formatQtyShort(a.qty)} left in store (limit ${formatQtyShort(a.limit)})`, link: "/store", since: null, adminOnly: false };
    const who = a.contractorId === "COMPANY" ? "Company" : i.contractorNames[a.contractorId] || a.contractorId;
    return { key: `NOT_RETURNED:${a.contractorId}:${a.itemId}`, kind: "NOT_RETURNED", severity: "warn", title: "Not returned", text: `${who} has ${item} × ${formatQtyShort(a.qty)} for ${a.days} days — not returned`, link: "/store", since: null, adminOnly: false };
  });
}

function overdue(i: AlertInput): SiteAlert[] {
  return Object.entries(i.parties)
    .filter(([, p]) => p.overduePaise > 0 && p.kind !== "CONTRACTOR")
    .map(([id, p]): SiteAlert => ({ key: `OVERDUE:${id}`, kind: "OVERDUE", severity: "warn", title: "Payment overdue", text: `${p.name}: ${formatINR(p.overduePaise)} overdue (total bakaya ${formatINR(p.bakayaPaise)})`, link: "/creditors", since: null, adminOnly: false }));
}

function dprDrafts(i: AlertInput): SiteAlert[] {
  const from = addDays(i.today, -EDIT_WINDOW_DAYS);
  return i.draftDprDates
    .filter((d) => d >= from && d < i.today)
    .map((d): SiteAlert => ({ key: `DPR:${d}`, kind: "DPR_NOT_LOCKED", severity: "info", title: "DPR not locked", text: `DPR for ${formatDate(d)} is not locked yet — editing closes ${formatDate(addDays(d, EDIT_WINDOW_DAYS))}, 11:59 PM`, link: `/dpr?date=${d}`, since: d, adminOnly: false }));
}

function noPhoto(i: AlertInput): SiteAlert[] {
  return (i.missingPhotos ?? [])
    .filter((m) => m.names.length)
    .map((m): SiteAlert => {
      const n = m.names.length;
      const who = m.names.slice(0, 4).join(", ") + (n > 4 ? ` +${n - 4} more` : "");
      return { key: `NO_PHOTO:${m.date}`, kind: "ATTENDANCE_NO_PHOTO", severity: "warn", title: "Attendance without photo", text: `${formatDate(m.date)}: ${n} attendance ${n > 1 ? "entries have" : "entry has"} no photo — ${who}`, link: "/attendance", since: m.date, adminOnly: false };
    });
}

function backup(i: AlertInput): SiteAlert[] {
  if (!i.lastBackupAt || i.now.getTime() - i.lastBackupAt.getTime() <= BACKUP_STALE_HOURS * 3600_000) return [];
  const d = toBusinessDateIST(i.lastBackupAt);
  return [{ key: "BACKUP", kind: "BACKUP_STALE", severity: "crit", title: "Backup not running", text: `Last backup was on ${formatDate(d)} — the nightly backup has not run since`, link: "/settings", since: d, adminOnly: true }];
}

/** Saare alert: crit → warn → info, phir key se (har baar same kram) */
export function buildAlerts(i: AlertInput): SiteAlert[] {
  return [...breakdowns(i), ...lowMaterial(i), ...store(i), ...overdue(i), ...dprDrafts(i), ...noPhoto(i), ...backup(i)].sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Pichli list ke key se: kaun naya aaya (notification), kaun khatam hua */
export function diffAlerts(prevKeys: string[], next: SiteAlert[]): { opened: SiteAlert[]; resolved: string[] } {
  const prev = new Set(prevKeys);
  const now = new Set(next.map((a) => a.key));
  return { opened: next.filter((a) => !prev.has(a.key)), resolved: prevKeys.filter((k) => !now.has(k)) };
}

export function sameAlerts(a: SiteAlert[], b: SiteAlert[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ghanti par number: jo notification user ne aakhri baar dekhne ke baad aaye (adminOnly sirf Admin ko) */
export function unreadCount(list: { createdAtMs: number; adminOnly?: boolean }[], seenAtMs: number | null, isAdmin: boolean): number {
  return list.filter((n) => (isAdmin || !n.adminOnly) && (seenAtMs === null || n.createdAtMs > seenAtMs)).length;
}
