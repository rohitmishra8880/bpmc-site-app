import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";
import { canEditDate, formatDate, istMidnight, toBusinessDateIST, addDays } from "@bpmc/core";
import { restoreEntry, saveMaster, unlockDay } from "../lib/audit";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import { errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

const ENTRY_COLS: [string, string][] = [
  ["stockMoves", "Stock / Diesel"],
  ["machineLogs", "Machine log"],
  ["machineDeductions", "Machine advance"],
  ["labourMuster", "Labour muster"],
  ["staffAttendance", "Staff attendance"],
  ["staffPassbook", "Staff ledger"],
  ["workEntries", "Daily Work"],
  ["storeMoves", "Store register"],
  ["ledger", "Party ledger"],
  ["photos", "Photo"],
];
const MASTER_COLS: [string, string][] = [
  ["masters_materials", "Material"],
  ["masters_machines", "Machine"],
  ["masters_contractors", "Contractor"],
  ["masters_parties", "Party"],
  ["masters_storeItems", "Store item"],
  ["masters_staff", "Staff"],
];

interface BinRow {
  key: string;
  col: string;
  colLabel: string;
  id: string;
  kind: "entry" | "master";
  data: DocumentData;
}

function title(r: BinRow): string {
  const d = r.data;
  return String(d.name ?? d.itemName ?? d.machineName ?? d.remark ?? r.id);
}

export function RecycleBin() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [rows, setRows] = useState<Record<string, BinRow[]>>({});
  const [restoring, setRestoring] = useState<BinRow | null>(null);
  const today = toBusinessDateIST(new Date());
  const [uDate, setUDate] = useState(addDays(today, -3));
  const [uReason, setUReason] = useState("");

  useEffect(() => {
    if (!current) return;
    setRows({});
    const subs = [
      ...ENTRY_COLS.map(([col, label]) =>
        onSnapshot(
          query(collection(db, "projects", current.id, col), where("deleted", "!=", null)),
          (s) => setRows((o) => ({ ...o, [col]: s.docs.map((d) => ({ key: col + d.id, col, colLabel: label, id: d.id, kind: "entry" as const, data: d.data() })) })),
          (e) => toast(errorText(e), true),
        ),
      ),
      ...MASTER_COLS.map(([col, label]) =>
        onSnapshot(
          query(collection(db, col), where("deleted", "!=", null)),
          (s) => setRows((o) => ({ ...o, [col]: s.docs.map((d) => ({ key: col + d.id, col, colLabel: label, id: d.id, kind: "master" as const, data: d.data() })) })),
          (e) => toast(errorText(e), true),
        ),
      ),
    ];
    return () => subs.forEach((u) => u());
  }, [current, toast]);

  if (!can(profile, "recycle.restore")) return <div className="card empty">Recycle Bin is for the Admin only.</div>;
  if (!current) return <div className="card empty">Select a project first.</div>;

  const all = Object.values(rows)
    .flat()
    .sort((a, b) => (b.data.deleted?.at?.toMillis?.() ?? 0) - (a.data.deleted?.at?.toMillis?.() ?? 0));

  const doRestore = async (r: BinRow, reason: string) => {
    try {
      if (r.kind === "master") await saveMaster(r.col, r.id, { deleted: null }, profile.email, r.data, "RESTORE", reason);
      else await restoreEntry(current.id, r.col, r.id, Number(r.data.rev ?? 1), profile.email, reason);
      toast(`"${title(r)}" restored ✓`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };

  const doUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Aaj raat 11:59:59 IST tak
      const till = new Date(istMidnight(addDays(today, 1)).getTime() - 1000);
      await unlockDay(current.id, uDate, till, profile.email, uReason.trim());
      toast(`${formatDate(uDate)} reopened until 11:59 PM tonight`);
      setUReason("");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <>
      <PageHead title="Recycle Bin" sub={`${current.name} — deleted entries and masters with reasons. Only the Admin can restore.`} />
      <section className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Section</th>
              <th>Date</th>
              <th>Deleted by</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((r) => {
              const bd: string | undefined = r.data.businessDate;
              const locked = r.kind === "entry" && bd ? !canEditDate(bd, new Date()) : false;
              return (
                <tr key={r.key}>
                  <td>
                    <b>{title(r)}</b>
                  </td>
                  <td>{r.colLabel}</td>
                  <td>{bd ? formatDate(bd) : "—"}</td>
                  <td>{r.data.deleted?.by ?? "—"}</td>
                  <td className="wrap">{r.data.deleted?.reason ?? "—"}</td>
                  <td>
                    {locked ? (
                      <span className="small muted">Day locked — reopen it below</span>
                    ) : (
                      <button className="btn sm" onClick={() => setRestoring(r)}>
                        ↺ Restore
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {all.length === 0 && <div className="empty">Recycle Bin is empty</div>}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Reopen a locked day</h2>
            <p className="small muted">A day locks automatically after 2 days. Reopening lets any user edit that day's entries (with a reason) until 11:59 PM tonight.</p>
          </div>
        </div>
        <form className="form" onSubmit={doUnlock}>
          <div className="grid-form">
            <div className="field">
              <label htmlFor="u-date">Day</label>
              <input id="u-date" type="date" className="input" value={uDate} max={addDays(today, -3)} onChange={(e) => setUDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="u-why">Reason *</label>
              <input id="u-why" className="input" value={uReason} onChange={(e) => setUReason(e.target.value)} placeholder="e.g. cement bill was missed" />
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={uReason.trim().length < 3 || !uDate}>
              Reopen (until tonight)
            </button>
          </div>
        </form>
      </section>

      {restoring && (
        <ReasonDialog
          title={`Restore "${title(restoring)}"?`}
          onCancel={() => setRestoring(null)}
          onConfirm={(reason) => {
            const r = restoring;
            setRestoring(null);
            void doRestore(r, reason);
          }}
        />
      )}
    </>
  );
}
