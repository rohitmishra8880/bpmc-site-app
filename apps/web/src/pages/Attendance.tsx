import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { canEditDate, formatDate, formatINR, toBusinessDateIST, toPaise, type StaffMark } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { softDeleteWrite, useDay, useDayEntries, useUnlock, useUnlocks, writeEntries, type Entry } from "../lib/entries";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";
import { LabourWeek, payData, PaymentFields, payStateValid, type PayState } from "./LabourWeek";

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
  const [tab, setTab] = useState<"labour" | "staff">("labour");
  return (
    <>
      <PageHead title="Attendance" sub="Labour attendance (weekly sheet) and company staff with their ledger" />
      <div className="tabs" role="group" aria-label="Attendance">
        <button className="tab" aria-pressed={tab === "labour"} onClick={() => setTab("labour")}>
          👷 Labour attendance (weekly)
        </button>
        <button className="tab" aria-pressed={tab === "staff"} onClick={() => setTab("staff")}>
          🧑‍💼 Staff (daily)
        </button>
      </div>
      {tab === "labour" ? <LabourWeek /> : <StaffDay />}
    </>
  );
}

function StaffDay() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const staff = useMaster("masters_staff");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const { rows: marks } = useDayEntries(current?.id, "staffAttendance", date);
  const { rows: pays } = useDayEntries(current?.id, "staffPassbook", date);
  const day = useDay(current?.id, date);
  const unlock = useUnlock(current?.id, date);
  const balances = useStaffBalances(current?.id);
  const [khataFor, setKhataFor] = useState<MasterRow | null>(null);
  const [markChange, setMarkChange] = useState<{ e: Entry; mark: StaffMark } | null>(null);

  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const markFor = useMemo(() => new Map((marks ?? []).filter((m) => !m.deleted).map((m) => [m.staffId as string, m])), [marks]);
  const pending = [...(marks ?? []), ...(pays ?? [])].filter((r) => !r.deleted && r.serverStatus === "PENDING").length;
  const labour = day?.labour as { totals: { mistri: number; kuli: number; reja: number; total: number } } | undefined;
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

  return (
    <>
      <DateBar title="Staff attendance" sub={`${current.name} — company staff, advances and salary`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
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
          <span className="lab">Labour on site</span>
          <span className="num">{labour ? labour.totals.total : "—"}</span>
          <span className="foot">{labour ? `Mistri ${labour.totals.mistri} · Kuli ${labour.totals.kuli} · Reja ${labour.totals.reja}` : "See the weekly labour sheet"}</span>
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

      <MonthlyStatement staff={staff} balances={balances} />

      {khataFor && <KhataDialog s={khataFor} date={date} open={open} balance={balances[khataFor.id]} onClose={() => setKhataFor(null)} />}
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

/** "2026-10" → "October 2026" */
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

/** Sab staff ka ek mahine ka hisab (server ke staffBalances.months se) */
function MonthlyStatement({ staff, balances }: { staff: MasterRow[]; balances: Record<string, DocumentData> }) {
  const months = [...new Set(Object.values(balances).flatMap((b) => ((b.months as DocumentData[] | undefined) ?? []).map((m) => m.month as string)))].sort().reverse();
  const [month, setMonth] = useState("");
  const sel = month || months[0] || "";
  if (!months.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Monthly salary statement</h2>
          <p className="small muted">Attendance, earned, advances / salary paid and running balance — calculated by the server</p>
        </div>
        <select className="input" style={{ width: "auto", minHeight: 38 }} value={sel} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Staff</th>
              <th className="r">P</th>
              <th className="r">HD</th>
              <th className="r">A</th>
              <th className="r">Earned</th>
              <th className="r">Staff exp.</th>
              <th className="r">Paid</th>
              <th className="r">Balance (to date)</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const m = ((balances[s.id]?.months as DocumentData[] | undefined) ?? []).find((x) => x.month === sel);
              if (!m) return null;
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td className="r">{m.present}</td>
                  <td className="r">{m.halfDay}</td>
                  <td className="r">{m.absent}</td>
                  <td className="r">{formatINR(m.earnedPaise)}</td>
                  <td className="r">{formatINR(m.expensePaise)}</td>
                  <td className="r">{formatINR(m.paidPaise)}</td>
                  <td className="r">
                    <b style={m.balancePaise < 0 ? { color: "var(--crit)" } : undefined}>{formatINR(m.balancePaise)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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

function KhataDialog({ s, date, open, balance, onClose }: { s: MasterRow; date: string; open: boolean; balance: DocumentData | undefined; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const accounts = useMaster("masters_companyAccounts");
  const [rows, setRows] = useState<Entry[]>([]);
  const [kind, setKind] = useState("ADVANCE");
  const [amt, setAmt] = useState("");
  const [remark, setRemark] = useState("");
  const [pay, setPay] = useState<PayState>({ mode: "CASH", accountId: "", refNo: "" });
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const unlocks = useUnlocks(current?.id);
  // 2 din tak, ya Admin ne din khola ho to (Rohit ka niyam)
  const canChange = (d: string) => can(profile, "entry.edit") && canEditDate(d, new Date(), unlocks[d] ? { expiresAt: unlocks[d] } : null);
  const startEdit = (r: Entry) => {
    setEditing(r);
    setKind(r.kind as string);
    setAmt(String(r.amountPaise / 100));
    setRemark((r.remark as string) ?? "");
    setPay({ mode: (r.mode as string) ?? "CASH", accountId: (r.accountId as string) ?? "", refNo: (r.refNo as string) ?? "" });
    setReason("");
  };
  const reset = () => {
    setEditing(null);
    setAmt("");
    setRemark("");
    setReason("");
  };

  useEffect(() => {
    if (!current) return;
    return onSnapshot(query(collection(db, "projects", current.id, "staffPassbook"), where("staffId", "==", s.id)), (q) =>
      setRows(q.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).sort((a, b) => b.businessDate.localeCompare(a.businessDate))),
    );
  }, [current, s.id]);

  const a = Number(amt);
  // Staff ne apna kharcha kiya (EXPENSE) — company account se paisa nahi gaya, isliye mode nahi
  const needPay = kind !== "EXPENSE";
  const valid = amt !== "" && Number.isFinite(a) && a > 0 && (!needPay || payStateValid(pay)) && (!editing || reason.trim().length >= 3);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(
        current.id,
        profile.email,
        [{ col: "staffPassbook", id: editing?.id, current: editing, action: editing ? "UPDATE" : "CREATE", data: { businessDate: editing?.businessDate ?? date, staffId: s.id, staffName: s.name, kind, amountPaise: toPaise(a), remark: remark.trim() || null, ...(needPay ? payData(pay, accounts) : { mode: null, accountId: null, accountName: null, refNo: null }) } }],
        editing ? reason.trim() : null,
      );
      toast(editing ? "Ledger entry updated ✓" : "Added to ledger ✓");
      reset();
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
        <h3>Month-by-month statement</h3>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="r">P</th>
                <th className="r">HD</th>
                <th className="r">A</th>
                <th className="r">Earned</th>
                <th className="r">Staff exp.</th>
                <th className="r">Paid</th>
                <th className="r">Balance</th>
              </tr>
            </thead>
            <tbody>
              {[...((balance?.months as DocumentData[] | undefined) ?? [])].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="r">{m.present}</td>
                  <td className="r">{m.halfDay}</td>
                  <td className="r">{m.absent}</td>
                  <td className="r">{formatINR(m.earnedPaise)}</td>
                  <td className="r">{formatINR(m.expensePaise)}</td>
                  <td className="r">{formatINR(m.paidPaise)}</td>
                  <td className="r">
                    <b style={m.balancePaise < 0 ? { color: "var(--crit)" } : undefined}>{formatINR(m.balancePaise)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(balance?.months as unknown[] | undefined)?.length && <div className="empty">No months yet</div>}
        </div>
        {(open || editing) && (
          <form onSubmit={add} className="form" style={{ padding: 0 }}>
            <h3>{editing ? `Edit entry of ${formatDate(editing.businessDate)}` : `New entry for ${formatDate(date)}`}</h3>
            <div className="grid-form">
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
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="k-rm">Remark</label>
                <input id="k-rm" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
              </div>
            </div>
            {needPay && <PaymentFields v={pay} setV={setPay} accounts={accounts} />}
            {editing && (
              <div className="field">
                <label htmlFor="k-why">Reason for change *</label>
                <input id="k-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount" />
              </div>
            )}
            <div className="actions">
              {editing && (
                <button type="button" className="btn" onClick={reset}>
                  Cancel edit
                </button>
              )}
              <button className="btn primary" disabled={!valid}>
                {editing ? "Save changes" : `＋ Add for ${formatDate(date)}`}
              </button>
            </div>
          </form>
        )}
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="r">Amount</th>
                <th>Mode</th>
                <th>Ref / remark</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.deleted ? "deleted" : ""}>
                  <td>{formatDate(r.businessDate)}</td>
                  <td>{PAY_KIND.find((p) => p[0] === r.kind)?.[1] ?? r.kind}</td>
                  <td className="r">{formatINR(r.amountPaise)}</td>
                  <td className="small">
                    {r.mode ?? "—"}
                    {r.accountName ? ` · ${r.accountName}` : ""}
                  </td>
                  <td className="wrap small">{[r.refNo, r.remark].filter(Boolean).join(" · ")}</td>
                  <td>
                    {!r.deleted &&
                      (canChange(r.businessDate) ? (
                        <span className="actions">
                          <button className="btn sm" onClick={() => startEdit(r)} aria-label="Edit">
                            ✎
                          </button>
                          <button className="btn sm danger" onClick={() => setRemoving(r)} aria-label="Delete">
                            🗑
                          </button>
                        </span>
                      ) : (
                        <span className="small muted" title="Older than 2 days — ask the Admin to reopen this day">
                          🔒
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No payments yet</div>}
          <p className="note">Entries can be changed for 2 days (with a reason). After that 🔒 — the Admin reopens that day from Recycle Bin → "Reopen a locked day".</p>
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
