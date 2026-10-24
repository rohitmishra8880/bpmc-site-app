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

  if (!profile.isAdmin) return <div className="card empty">This page is for the Admin only.</div>;
  const r = g?.rental;
  const last = runs[0];
  const hoursSince = last ? (Date.now() - last.at.toDate().getTime()) / 36e5 : null;

  return (
    <>
      <PageHead title="Settings & Backup" sub="Rules and backups — Admin only" />
      <div className="stats">
        <div className="card stat">
          <span className="lab">Rental rules</span>
          <span className="foot">Half day = Rate × {r?.halfDayFactor ?? "—"}</span>
          <span className="foot">Breakdown / Absent = Rate × {r?.idleDayFactor ?? "—"}</span>
          <span className="foot">Monthly day-rate = Rate ÷ {r?.monthDivisor ?? "—"}</span>
          <span className="foot">Shift = {r?.shiftHours ?? "—"} hours</span>
        </div>
        <div className="card stat">
          <span className="lab">Edit window</span>
          <span className="num">
            {g?.editWindowDays ?? "—"}
            <small>days</small>
          </span>
          <span className="foot">After that the day locks; only Admin can reopen</span>
        </div>
        <div className="card stat">
          <span className="lab">Company</span>
          <span className="foot">{g?.company?.name ?? "—"}</span>
          <span className="foot">
            {g?.company?.state ?? "—"} ({g?.company?.stateCode ?? "—"})
          </span>
        </div>
        <div className="card stat" style={hoursSince !== null && hoursSince > 48 ? { borderColor: "var(--crit)" } : undefined}>
          <span className="lab">Last backup</span>
          <span className="num" style={{ fontSize: 22 }}>
            {last ? last.at.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet"}
          </span>
          <span className="foot">{hoursSince !== null && hoursSince > 48 ? "No backup for 2 days!" : "Nightly ~11:30 PM IST, to the Obsidian vault"}</span>
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Backup history</h2>
          <span className="small muted">G:\My Drive\AI obsidian\&lt;vault&gt;\Backup\</span>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Reason</th>
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
                        <b>{pid}</b>: {x.file} · {(x.bytes / 1024).toFixed(1)} KB · {x.entries} entries
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="empty">No backups yet</div>}
        </div>
        <p className="note">For an immediate backup, run <b>dailyBackup</b> in Apps Script. Restore is done with <b>restorePreview</b> → <b>restoreRun</b> (preview first, then confirm).</p>
      </section>
    </>
  );
}
