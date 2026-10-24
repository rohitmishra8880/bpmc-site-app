// Har likhai + uska audit ek hi batch mein (firestore.rules isi ko maangte hain).
import { collection, doc, serverTimestamp, writeBatch, type DocumentData } from "firebase/firestore";
import { db } from "./firebase";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows laptop";
  if (/Mac OS/i.test(ua)) return "Mac";
  return "Browser";
}

/** Sirf badle hue field (Edit History mein purani → nayi) */
function diff(before: DocumentData | null, after: DocumentData): { before: DocumentData | null; after: DocumentData } {
  if (!before) return { before: null, after };
  const b: DocumentData = {};
  const a: DocumentData = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (["updatedAt", "updatedBy", "rev", "lastAuditId", "createdAt"].includes(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a };
}

/**
 * Master list (global) ko likho + global auditLog mein record.
 * `current` = abhi ka document (naya ho to null).
 */
export async function saveMaster(
  col: string,
  id: string | null,
  data: DocumentData,
  email: string,
  current: (DocumentData & { rev?: number }) | null,
  action: AuditAction,
  reason: string | null,
) {
  const batch = writeBatch(db);
  const ref = id ? doc(db, col, id) : doc(collection(db, col));
  const auditRef = doc(collection(db, "auditLog"));
  const rev = (current?.rev ?? 0) + 1;
  const base = { ...data, rev, lastAuditId: auditRef.id, updatedBy: email, updatedAt: serverTimestamp() };
  if (action === "CREATE") {
    batch.set(ref, { ...base, createdBy: email, createdAt: serverTimestamp(), deleted: null });
  } else {
    batch.update(ref, base);
  }
  const d = diff(current, data);
  batch.set(auditRef, {
    entity: `${col}/${ref.id}`,
    action,
    rev,
    by: email,
    at: serverTimestamp(),
    reason,
    before: d.before,
    after: d.after,
    device: deviceLabel(),
  });
  await batch.commit();
  return ref.id;
}
