// Site entry likhna — ek save = ek batch: saari jude entries + har ek ka audit (firestore.rules yahi maangte hain).
// Phone hisab nahi karta: serverStatus = PENDING, server (Apps Script) hisab karke DONE karta hai.
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";
import { deviceLabel, type AuditAction } from "./audit";
import { db } from "./firebase";

export type EntryCol =
  | "stockMoves" | "machineLogs" | "machineDeductions" | "labourMuster" | "staffAttendance"
  | "staffPassbook" | "workEntries" | "storeMoves" | "ledger" | "photos"
  | "labourAttendance" | "labourPassbook" | "storeService";

export interface Entry extends DocumentData {
  id: string;
  businessDate: string;
  rev: number;
  deleted: { by: string; reason: string } | null;
  serverStatus: "PENDING" | "DONE";
  createdBy: string;
}

export interface EntryWrite {
  col: EntryCol;
  /** Apna id (jaise ek machine ka ek din) — na ho to naya */
  id?: string;
  data: DocumentData;
  /** Abhi ka document (naya ho to null) */
  current: Entry | null;
  action: AuditAction;
}

function changed(before: DocumentData | null, after: DocumentData) {
  if (!before) return { before: null, after };
  const b: DocumentData = {};
  const a: DocumentData = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a };
}

export async function writeEntries(pid: string, email: string, writes: EntryWrite[], reason: string | null) {
  const batch = writeBatch(db);
  const ids: string[] = [];
  for (const w of writes) {
    const ref = w.id ? doc(db, "projects", pid, w.col, w.id) : doc(collection(db, "projects", pid, w.col));
    const auditRef = doc(collection(db, "projects", pid, "auditLog"));
    const rev = (w.current?.rev ?? 0) + 1;
    const common = { ...w.data, rev, lastAuditId: auditRef.id, serverStatus: "PENDING" };
    if (!w.current) {
      batch.set(ref, { ...common, projectId: pid, createdBy: email, createdAt: serverTimestamp(), deleted: null });
    } else {
      batch.update(ref, { ...common, updatedBy: email, updatedAt: serverTimestamp() });
    }
    const d = changed(w.current, w.data);
    batch.set(auditRef, {
      entity: `${w.col}/${ref.id}`,
      action: w.action,
      rev,
      by: email,
      at: serverTimestamp(),
      reason: w.action === "CREATE" ? null : reason,
      before: d.before,
      after: d.after,
      device: deviceLabel(),
    });
    ids.push(ref.id);
  }
  // Offline par commit ka promise network aane tak rukta hai — entry phone ke cache mein turant aa jaati hai
  const p = batch.commit();
  if (!navigator.onLine) return ids;
  await p;
  return ids;
}

export function softDeleteWrite(col: EntryCol, e: Entry, email: string, reason: string): EntryWrite {
  return { col, id: e.id, current: e, action: "DELETE", data: { deleted: { by: email, reason, at: serverTimestamp() } } };
}

/** Ek din ki entries (live) */
export function useDayEntries(pid: string | undefined, col: EntryCol, date: string) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!pid) return;
    setRows(null);
    return onSnapshot(
      query(collection(db, "projects", pid, col), where("businessDate", "==", date)),
      (s) => setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry)),
      (e) => setError(e.message),
    );
  }, [pid, col, date]);
  return { rows, error };
}

/** Admin ne yeh din khola hai to kab tak */
export function useUnlock(pid: string | undefined, date: string) {
  const [till, setTill] = useState<Date | null>(null);
  useEffect(() => {
    if (!pid) return;
    setTill(null);
    return onSnapshot(doc(db, "projects", pid, "unlocks", date), (s) => setTill(s.exists() ? (s.data().expiresAt?.toDate?.() ?? null) : null));
  }, [pid, date]);
  return till;
}

/** Project ke saare khule (Admin unlock) din: date → kab tak */
export function useUnlocks(pid: string | undefined) {
  const [m, setM] = useState<Record<string, Date>>({});
  useEffect(() => {
    if (!pid) return;
    return onSnapshot(collection(db, "projects", pid, "unlocks"), (s) =>
      setM(Object.fromEntries(s.docs.map((d) => [d.id, d.data().expiresAt?.toDate?.() as Date]).filter((x) => x[1]))),
    );
  }, [pid]);
  return m;
}

/** Server ka hisab: projects/{pid}/days/{date} */
export function useDay(pid: string | undefined, date: string) {
  const [day, setDay] = useState<DocumentData | null>(null);
  useEffect(() => {
    if (!pid) return;
    setDay(null);
    return onSnapshot(doc(db, "projects", pid, "days", date), (s) => setDay(s.data() ?? {}));
  }, [pid, date]);
  return day;
}
