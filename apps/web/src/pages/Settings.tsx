import { collection, doc, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { errorText, PageHead, useToast } from "../lib/ui";

interface Global {
  company?: { name?: string; state?: string; stateCode?: string };
  rental?: { shiftHours?: number; halfDayFactor?: number; idleDayFactor?: number; monthDivisor?: number };
  editWindowDays?: number;
}
interface BackupRun {
  id: string;
  at: Timestamp;
  reason: string;
  ok: boolean;
  projects: Record<string, { file: string; bytes: number; entries: number }>;
}

export function Settings() {
  const profile = useProfile();
  const toast = useToast();
  const [g, setG] = useState<Global | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);

  useEffect(() => {
    const a = onSnapshot(doc(db, "settings", "global"), (s) => setG((s.data() as Global) ?? {}), (e) => toast(errorText(e), true));
    const b = onSnapshot(
      query(collection(db, "backupRuns"), orderBy("at", "desc"), limit(10)),
      (s) => setRuns(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BackupRun, "id">) }))),
      (e) => toast(errorText(e), true),
    );
    return () => {
      a();
      b();
    };
  }, [toast]);

  if (!profile.isAdmin) return <div className="card empty">Yeh page sirf Admin ke liye hai.</div>;
  const r = g?.rental;
  const last = runs[0];
  const hoursSince = last ? (Date.now() - last.at.toDate().getTime()) / 36e5 : null;

  return (
    <>
      <PageHead title="Settings & Backup" sub="Niyam aur backup — sirf Admin" />
      <div className="stats">
        <div className="card stat">
          <span className="lab">Rental niyam</span>
          <span className="foot">Half day = Rate × {r?.halfDayFactor ?? "—"}</span>
          <span className="foot">Breakdown / Absent = Rate × {r?.idleDayFactor ?? "—"}</span>
          <span className="foot">Monthly din-rate = Rate ÷ {r?.monthDivisor ?? "—"}</span>
          <span className="foot">Shift = {r?.shiftHours ?? "—"} ghante</span>
        </div>
        <div className="card stat">
          <span className="lab">Edit niyam</span>
          <span className="num">
            {g?.editWindowDays ?? "—"}
            <small>din</small>
          </span>
          <span className="foot">Uske baad din lock; sirf Admin khole</span>
        </div>
        <div className="card stat">
          <span className="lab">Company</span>
          <span className="foot">{g?.company?.name ?? "—"}</span>
          <span className="foot">
            {g?.company?.state ?? "—"} ({g?.company?.stateCode ?? "—"})
          </span>
        </div>
        <div className="card stat" style={hoursSince !== null && hoursSince > 48 ? { borderColor: "var(--crit)" } : undefined}>
          <span className="lab">Aakhri backup</span>
          <span className="num" style={{ fontSize: 22 }}>
            {last ? last.at.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Abhi nahi"}
          </span>
          <span className="foot">{hoursSince !== null && hoursSince > 48 ? "2 din se backup nahi hua!" : "Roz raat ~11:30 IST, Obsidian vault mein"}</span>
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Backup ka record</h2>
          <span className="small muted">G:\My Drive\AI obsidian\&lt;vault&gt;\Backup\</span>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Kab</th>
                <th>Kyun</th>
                <th>Project → file</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((b) => (
                <tr key={b.id}>
                  <td>{b.at.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{b.reason}</td>
                  <td className="wrap small">
                    {Object.entries(b.projects ?? {}).map(([pid, x]) => (
                      <div key={pid}>
                        <b>{pid}</b>: {x.file} · {(x.bytes / 1024).toFixed(1)} KB · {x.entries} entry
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="empty">Abhi koi backup nahi hua</div>}
        </div>
        <p className="note">Turant backup chahiye to Apps Script mein <b>dailyBackup</b> chalao. Restore (kisi din ka data wapas) agle hisse mein — pehle preview, phir OK.</p>
      </section>
    </>
  );
}
