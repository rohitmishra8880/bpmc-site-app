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

  useEffect(() => {
    if (!current) return;
    return onSnapshot(query(collection(db, "projects", current.id, "staffPassbook"), where("staffId", "==", s.id)), (q) =>
      setRows(q.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).sort((a, b) => b.businessDate.localeCompare(a.businessDate))),
    );
  }, [current, s.id]);

  const a = Number(amt);
  // Staff ne apna kharcha kiya (EXPENSE) — company account se paisa nahi gaya, isliye mode nahi
  const needPay = kind !== "EXPENSE";
  const valid = amt !== "" && Number.isFinite(a) && a > 0 && (!needPay || payStateValid(pay));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(
        current.id,
        profile.email,
        [{ col: "staffPassbook", current: null, action: "CREATE", data: { businessDate: date, staffId: s.id, staffName: s.name, kind, amountPaise: toPaise(a), remark: remark.trim() || null, ...(needPay ? payData(pay, accounts) : { mode: null, accountId: null, accountName: null, refNo: null }) } }],
        null,
      );
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
          <form onSubmit={add} className="form" style={{ padding: 0 }}>
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
            <div className="actions">
              <button className="btn primary" disabled={!valid}>
                ＋ Add for {formatDate(date)}
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
