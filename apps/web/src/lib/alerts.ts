// Alerts + notifications: server ka banaya data sirf padhna (phone kuch nahi ginta). Ghanti ka number = unreadCount (core).
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { unreadCount, type SiteAlert } from "@bpmc/core";
import { useProfile } from "./auth";
import { db } from "./firebase";

export interface AlertsDoc {
  asOf?: string;
  refreshedAt?: Timestamp;
  items?: SiteAlert[];
  counts?: { crit: number; warn: number; info: number; total: number };
}

export interface Notif extends Omit<SiteAlert, "since"> {
  id: string;
  businessDate: string;
  createdAt?: Timestamp | null;
  resolvedAt?: Timestamp | null;
}

/** Active alerts (server) — Admin ke alawa adminOnly nahi dikhte */
export function useAlerts(pid: string | undefined): { doc: AlertsDoc | null | undefined; items: SiteAlert[] } {
  const profile = useProfile();
  const [d, setD] = useState<AlertsDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!pid) return;
    setD(undefined);
    return onSnapshot(
      doc(db, "projects", pid, "alerts", "current"),
      (s) => setD(s.exists() ? (s.data() as AlertsDoc) : null),
      () => setD(null),
    );
  }, [pid]);
  const items = (d?.items ?? []).filter((a) => profile.isAdmin || !a.adminOnly);
  return { doc: d, items };
}

/** Pichhle 50 notification + ghanti ka unread number */
export function useNotifications(pid: string | undefined) {
  const profile = useProfile();
  const [list, setList] = useState<Notif[] | undefined>(undefined);
  const [seenAt, setSeenAt] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!pid) return;
    setList(undefined);
    setSeenAt(undefined);
    const a = onSnapshot(
      query(collection(db, "projects", pid, "notifications"), orderBy("createdAt", "desc"), limit(50)),
      (s) => setList(s.docs.map((x) => ({ ...(x.data() as Omit<Notif, "id">), id: x.id }))),
      () => setList([]),
    );
    const b = onSnapshot(
      doc(db, "projects", pid, "notifSeen", profile.email),
      (s) => setSeenAt((s.data()?.seenAt as Timestamp | undefined)?.toMillis() ?? null),
      () => setSeenAt(null),
    );
    return () => {
      a();
      b();
    };
  }, [pid, profile.email]);
  const visible = (list ?? []).filter((n) => profile.isAdmin || !n.adminOnly);
  const unread = list && seenAt !== undefined ? unreadCount(visible.map((n) => ({ createdAtMs: n.createdAt?.toMillis() ?? 0, adminOnly: n.adminOnly })), seenAt, profile.isAdmin) : 0;
  const markSeen = () => (pid ? setDoc(doc(db, "projects", pid, "notifSeen", profile.email), { seenAt: serverTimestamp() }) : Promise.resolve());
  return { list: list === undefined ? undefined : visible, unread, seenAt: seenAt ?? null, markSeen };
}

export const SEV_PILL: Record<SiteAlert["severity"], string> = { crit: "crit", warn: "warn", info: "info" };
export const KIND_IC: Record<SiteAlert["kind"], string> = {
  BREAKDOWN: "🔧",
  LOW_MATERIAL: "📦",
  STORE_LOW: "🧰",
  NOT_RETURNED: "🧰",
  OVERDUE: "📒",
  DPR_NOT_LOCKED: "📝",
  BACKUP_STALE: "💾",
};

export function whenText(t: Timestamp | null | undefined): string {
  if (!t) return "";
  return t.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
