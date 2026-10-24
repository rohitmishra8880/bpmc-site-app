import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { canEditDate, formatDate, formatINR, toBusinessDateIST, toPaise, type StaffMark } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { softDeleteWrite, useDay, useDayEntries, useUnlock, writeEntries, type Entry } from "../lib/entries";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

/** Company ki apni labour — purane app jaisa alag row */
const COMPANY: MasterRow = { id: "COMPANY", name: "Company labour" };
const MARKS: [StaffMark, string, string][] = [
  ["P", "P", "ok"],
  ["HD", "HD", "warn"],
  ["A", "A", "crit"],
];
const PAY_KIND: [string, string][] = [
  ["ADVANCE", "Advance paid"],
  ["SALARY", "Salary paid"],
  ["EXPENSE", "Staff spent for site (to repay)"],
];

export function Attendance() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const contractors = useMaster("masters_contractors");
  const staff = useMaster("masters_staff");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const { rows: musters } = useDayEntries(current?.id, "labourMuster", date);
  const { rows: marks } = useDayEntries(current?.id, "staffAttendance", date);
  const { rows: pays } = useDayEntries(current?.id, "staffPassbook", date);
  const day = useDay(current?.id, date);
  const unlock = useUnlock(current?.id, date);
  const balances = useStaffBalances(current?.id);
  const [musterFor, setMusterFor] = useState<MasterRow | null>(null);
  const [khataFor, setKhataFor] = useState<MasterRow | null>(null);
  const [remark, setRemark] = useState<{ col: "labourMuster"; e: Entry } | null>(null);
  const [markChange, setMarkChange] = useState<{ e: Entry; mark: StaffMark } | null>(null);

  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const rowsFor = useMemo(() => new Map((musters ?? []).filter((m) => !m.deleted).map((m) => [m.contractorId as string, m])), [musters]);
  const markFor = useMemo(() => new Map((marks ?? []).filter((m) => !m.deleted).map((m) => [m.staffId as string, m])), [marks]);
  const pending = [...(musters ?? []), ...(marks ?? []), ...(pays ?? [])].filter((r) => !r.deleted && r.serverStatus === "PENDING").length;
  const labour = day?.labour as { totals: { mistri: number; kuli: number; reja: number; total: number }; byContractor: Record<string, { total: number }> } | undefined;
  const st = day?.staff as { present: number; halfDay: number; absent: number; marked: number } | undefined;

  if (!current) return <div className="card empty">Select a project first.</div>;

  const mark = async (s: MasterRow, m: StaffMark) => {
    const cur = markFor.get(s.id);
    if (cur?.mark === m) return;
    if (cur) {
      setMarkChange({ e: cur, mark: m });
      return;
    }
    try {
      await writeEntries(current.id, profile.email, [{ col: "staffAttendance", current: null, action: "CREATE", data: { businessDate: date, staffId: s.id, staffName: s.name, mark: m } }], null);
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  const changeMark = async (e: Entry, m: StaffMark, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [{ col: "staffAttendance", id: e.id, current: e, action: "UPDATE", data: { businessDate: date, staffId: e.staffId, staffName: e.staffName, mark: m } }], reason);
      toast("Attendance updated ✓");
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  const removeMuster = async (e: Entry, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("labourMuster", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  const groups = [COMPANY, ...contractors];

  return (
    <>
      <DateBar title="Staff KYC & Labour Muster" sub={`${current.name} — attendance, advances and wages`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      <PageHead title="Daily Attendance" sub="Contractor muster (Mistri / Kuli / Reja) and company staff with their ledger" />
      <div className="stats">
        <div className="card stat">
          <span className="lab">Staff present</span>
          <span className="num">
            {st ? st.present + st.halfDay * 0.5 : "—"}
            <small>/ {staff.length}</small>
          </span>
          <span className="foot">{st ? `${st.present} P · ${st.halfDay} HD · ${st.absent} A` : "No staff attendance yet"}</span>
        </div>
        <div className="card stat">
          <span className="lab">Labour total</span>
          <span className="num">{labour ? labour.totals.total : "—"}</span>
          <span className="foot">{labour ? `Mistri ${labour.totals.mistri} · Kuli ${labour.totals.kuli} · Reja ${labour.totals.reja}` : "No muster yet"}</span>
        </div>
        <div className="card stat">
          <span className="lab">Contractors on site</span>
          <span className="num">{labour ? Object.keys(labour.byContractor).length : "—"}</span>
          <span className="foot">Including company labour</span>
        </div>
        <div className="card stat">
          <span className="lab">Staff payments</span>
          <span className="num">{(pays ?? []).filter((p) => !p.deleted).length}</span>
          <span className="foot">Entries on this day</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Labour muster</h2>
            <p className="small muted">One entry per contractor per day. Add contractors under Masters.</p>
          </div>
          {can(profile, "masters.edit") && (
            <Link className="btn sm" to="/masters">
              ＋ Contractor
            </Link>
          )}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Contractor</th>
                <th className="r">Mistri</th>
                <th className="r">Kuli</th>
                <th className="r">Reja</th>
                <th className="r">Total</th>
                <th>Work / zone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const m = rowsFor.get(g.id);
                const srv = labour?.byContractor?.[g.id];
                return (
                  <tr key={g.id}>
                    <td>
                      <b>{g.name}</b>
                    </td>
                    <td className="r">{m ? m.mistri : "—"}</td>
                    <td className="r">{m ? m.kuli : "—"}</td>
                    <td className="r">{m ? m.reja : "—"}</td>
                    <td className="r">
                      <b>{srv ? srv.total : m ? "⏳" : "—"}</b>
                    </td>
                    <td className="wrap small">{[m?.work, m?.zone].filter(Boolean).join(" · ")}</td>
                    <td>
                      <div className="actions">
                        {open && (
                          <button className={`btn sm ${m ? "" : "primary"}`} onClick={() => setMusterFor(g)}>
                            {m ? "✎ Edit" : "＋ Enter"}
                          </button>
                        )}
                        {open && m && (
                          <button className="btn sm danger" onClick={() => setRemark({ col: "labourMuster", e: m })} aria-label="Delete">
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {labour && (
              <tfoot>
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="r">{labour.totals.mistri}</td>
                  <td className="r">{labour.totals.kuli}</td>
                  <td className="r">{labour.totals.reja}</td>
                  <td className="r">
                    <b>{labour.totals.total}</b>
                  </td>
                  <td colSpan={2} className="small muted">
                    Calculated by server
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Company staff — attendance & ledger</h2>
            <p className="small muted">Tap P / HD / A. Only the last 4 digits of Aadhaar are kept.</p>
          </div>
          {can(profile, "masters.edit") && (
            <Link className="btn sm" to="/masters">
              ＋ Staff
            </Link>
          )}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name / designation</th>
                <th>KYC</th>
                <th>Attendance</th>
                <th className="r">Salary</th>
                <th className="r">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const cur = markFor.get(s.id);
                const b = balances[s.id];
                return (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <span className="small muted" style={{ display: "block" }}>
                        {s.designation ?? ""}
                      </span>
                    </td>
                    <td className="small">{s.aadhaarLast4 ? `XXXX-XXXX-${s.aadhaarLast4}` : "—"}</td>
                    <td>
                      <div className="actions">
                        {MARKS.map(([k, l, tone]) => (
                          <button
                            key={k}
                            className="tab"
                            disabled={!open}
                            aria-pressed={cur?.mark === k}
                            onClick={() => mark(s, k)}
                            style={cur?.mark === k ? { background: `var(--${tone})`, borderColor: "transparent", color: "#fff" } : undefined}
                          >
                            {l}
                          </button>
                        ))}
                        {cur?.serverStatus === "PENDING" && <span title="Server is calculating">⏳</span>}
                      </div>
                    </td>
                    <td className="r">{s.salaryPaise ? `${formatINR(s.salaryPaise)}/mo` : "—"}</td>
                    <td className="r">
                      <b style={b && b.balancePaise < 0 ? { color: "var(--crit)" } : undefined}>{b ? formatINR(b.balancePaise) : "—"}</b>
                    </td>
                    <td>
                      <button className="btn sm" onClick={() => setKhataFor(s)}>
                        Ledger
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {staff.length === 0 && <div className="empty">No staff yet — add them under Masters → Staff.</div>}
        </div>
        <p className="note">Day rate = monthly salary ÷ 30. P = full day, HD = half day, A = nothing. Balance = earned + staff expenses − paid (negative = staff owes).</p>
      </section>

      {musterFor && <MusterForm group={musterFor} date={date} row={rowsFor.get(musterFor.id) ?? null} onClose={() => setMusterFor(null)} />}
      {khataFor && <KhataDialog s={khataFor} date={date} open={open} balance={balances[khataFor.id]} onClose={() => setKhataFor(null)} />}
      {remark && (
        <ReasonDialog
          title="Delete this muster entry?"
          onCancel={() => setRemark(null)}
          onConfirm={(r) => {
            const x = remark;
            setRemark(null);
            void removeMuster(x.e, r);
          }}
        />
      )}
      {markChange && (
        <ReasonDialog
          title={`Change attendance to ${markChange.mark}?`}
          onCancel={() => setMarkChange(null)}
          onConfirm={(r) => {
            const x = markChange;
            setMarkChange(null);
            void changeMark(x.e, x.mark, r);
          }}
        />
      )}
    </>
  );
}

function useStaffBalances(pid: string | undefined) {
  const [b, setB] = useState<Record<string, DocumentData>>({});
  useEffect(() => {
    if (!pid) return;
    setB({});
    return onSnapshot(collection(db, "projects", pid, "staffBalances"), (s) => setB(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
  }, [pid]);
  return b;
}

function MusterForm({ group, date, row, onClose }: { group: MasterRow; date: string; row: Entry | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [v, setV] = useState({
    mistri: row ? String(row.mistri) : "",
    kuli: row ? String(row.kuli) : "",
    reja: row ? String(row.reja) : "",
    work: (row?.work as string) ?? "",
    zone: (row?.zone as string) ?? "",
    remark: (row?.remark as string) ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const bad = (["mistri", "kuli", "reja"] as const).filter((k) => !Number.isInteger(n(v[k])) || n(v[k]) < 0);
  const total = bad.length ? null : n(v.mistri) + n(v.kuli) + n(v.reja);
  const valid = !bad.length && total !== null && total > 0 && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    setBusy(true);
    try {
      await writeEntries(
        current.id,
        profile.email,
        [
          {
            col: "labourMuster",
            id: row?.id,
            current: row,
            action: row ? "UPDATE" : "CREATE",
            data: { businessDate: date, contractorId: group.id, contractorName: group.name, mistri: n(v.mistri), kuli: n(v.kuli), reja: n(v.reja), work: v.work.trim() || null, zone: v.zone || null, remark: v.remark.trim() || null },
          },
        ],
        row ? reason.trim() : null,
      );
      toast(navigator.onLine ? "Muster saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`${group.name} — ${formatDate(date)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {(["mistri", "kuli", "reja"] as const).map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`lm-${k}`}>{k[0]!.toUpperCase() + k.slice(1)}</label>
              <input id={`lm-${k}`} className="input" inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="0" style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }} />
              {bad.includes(k) && <span className="err">Whole number</span>}
            </div>
          ))}
        </div>
        <p className="small muted">Total (preview): {total ?? "—"}</p>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="lm-work">Work</label>
            <input id="lm-work" className="input" value={v.work} onChange={(e) => setV({ ...v, work: e.target.value })} placeholder="e.g. shuttering, bar bending" />
          </div>
          <div className="field">
            <label htmlFor="lm-zone">Zone</label>
            <select id="lm-zone" className="input" value={v.zone} onChange={(e) => setV({ ...v, zone: e.target.value })}>
              <option value="">—</option>
              {(current?.zones ?? []).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="lm-rm">Remark</label>
          <input id="lm-rm" className="input" value={v.remark} onChange={(e) => setV({ ...v, remark: e.target.value })} />
        </div>
        {row && (
          <div className="field">
            <label htmlFor="lm-why">Reason for change *</label>
            <input id="lm-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid || busy}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function KhataDialog({ s, date, open, balance, onClose }: { s: MasterRow; date: string; open: boolean; balance: DocumentData | undefined; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [rows, setRows] = useState<Entry[]>([]);
  const [kind, setKind] = useState("ADVANCE");
  const [amt, setAmt] = useState("");
  const [remark, setRemark] = useState("");
  const [removing, setRemoving] = useState<Entry | null>(null);

  useEffect(() => {
    if (!current) return;
    return onSnapshot(query(collection(db, "projects", current.id, "staffPassbook"), where("staffId", "==", s.id)), (q) =>
      setRows(q.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).sort((a, b) => b.businessDate.localeCompare(a.businessDate))),
    );
  }, [current, s.id]);

  const a = Number(amt);
  const valid = amt !== "" && Number.isFinite(a) && a > 0;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(current.id, profile.email, [{ col: "staffPassbook", current: null, action: "CREATE", data: { businessDate: date, staffId: s.id, staffName: s.name, kind, amountPaise: toPaise(a), remark: remark.trim() || null } }], null);
      setAmt("");
      setRemark("");
      toast("Added to ledger ✓");
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  const remove = async (e: Entry, reason: string) => {
    if (!current) return;
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("staffPassbook", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={`${s.name} — ledger`} onClose={onClose}>
      <div className="form">
        {balance ? (
          <div className="stats">
            <div className="card stat">
              <span className="lab">Earned</span>
              <span className="num" style={{ fontSize: 22 }}>{formatINR(balance.earnedPaise)}</span>
              <span className="foot">
                {balance.presentDays} P · {balance.halfDays} HD · {formatINR(balance.dayRatePaise)}/day
              </span>
            </div>
            <div className="card stat">
              <span className="lab">Paid</span>
              <span className="num" style={{ fontSize: 22 }}>{formatINR(balance.paidPaise)}</span>
              <span className="foot">+ staff expenses {formatINR(balance.expensePaise)}</span>
            </div>
            <div className="card stat" style={{ gridColumn: "1 / -1" }}>
              <span className="lab">Balance</span>
              <span className="num" style={{ fontSize: 26, color: balance.balancePaise < 0 ? "var(--crit)" : undefined }}>{formatINR(balance.balancePaise)}</span>
              <span className="foot">{balance.balancePaise < 0 ? "Staff owes the company (advance exceeds earnings)" : "Payable to staff"}</span>
            </div>
          </div>
        ) : (
          <p className="small muted">No ledger calculated yet — the server prepares it within 5 minutes of the first attendance or payment.</p>
        )}
        {open && (
          <form onSubmit={add} className="grid-form" style={{ alignItems: "end" }}>
            <div className="field">
              <label htmlFor="k-kind">Type</label>
              <select id="k-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {PAY_KIND.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="k-amt">Amount (₹)</label>
              <input id="k-amt" className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-rm">Remark</label>
              <input id="k-rm" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. UPI, cash" />
            </div>
            <button className="btn primary" disabled={!valid}>
              ＋ Add for {formatDate(date)}
            </button>
          </form>
        )}
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="r">Amount</th>
                <th>Remark</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.deleted ? "deleted" : ""}>
                  <td>{formatDate(r.businessDate)}</td>
                  <td>{PAY_KIND.find((p) => p[0] === r.kind)?.[1] ?? r.kind}</td>
                  <td className="r">{formatINR(r.amountPaise)}</td>
                  <td className="wrap small">{r.remark ?? ""}</td>
                  <td>
                    {!r.deleted && canEditDate(r.businessDate, new Date()) && can(profile, "entry.delete") && (
                      <button className="btn sm danger" onClick={() => setRemoving(r)} aria-label="Delete">
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No payments yet</div>}
        </div>
      </div>
      {removing && (
        <ReasonDialog
          title="Delete this ledger entry?"
          onCancel={() => setRemoving(null)}
          onConfirm={(r) => {
            const x = removing;
            setRemoving(null);
            void remove(x, r);
          }}
        />
      )}
    </Dialog>
  );
}
