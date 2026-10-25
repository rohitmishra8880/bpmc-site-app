// Reports — har hisab ka PDF (Rohit: "very imp"). Data: saved entries + server ka hisab; formule @bpmc/core se.
// Har report pehle screen par dikhti hai (preview), phir "Download PDF".
import { collection, doc, getDocs, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays, dateRange, daysInMonth, formatDate, formatINR, formatQtyShort, labourEarning, latestMarks, runningLedger, toBusinessDateIST, weekStart,
  type DayItemBalance, type LabourMark, type StoreStatementRow,
} from "@bpmc/core";
import { useMaster, type MasterRow } from "../lib/masters";
import { db } from "../lib/firebase";
import { downloadPdf, Sheet } from "../lib/print";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

type Kind = "staff" | "labour" | "machinery" | "stock" | "store" | "ledger" | "work" | "dpr";
const REPORTS: { k: Kind; ic: string; label: string; sub: string; soon?: string; landscape: boolean }[] = [
  { k: "staff", ic: "🧑‍💼", label: "Staff attendance & khata", sub: "Month — P / HD / A, earned, paid, balance", landscape: true },
  { k: "labour", ic: "👷", label: "Labour — company / contractor", sub: "Week or month — day-wise attendance, OT, amount, paid", landscape: true },
  { k: "machinery", ic: "🔧", label: "Machinery", sub: "Month — day-wise SR / CR / hours / diesel / amount + rental bill", landscape: true },
  { k: "stock", ic: "📦", label: "Material stock", sub: "Date range — day-wise opening, received, used, balance", landscape: false },
  { k: "store", ic: "🧰", label: "Store register", sub: "Month — statement, movements, with contractors", landscape: true },
  { k: "ledger", ic: "📒", label: "Party / contractor ledger", sub: "Bills, payments, debit notes, recovery — running balance", landscape: false },
  { k: "work", ic: "📅", label: "Contractor work (day-wise)", sub: "M³ / Sq M / Kg by contractor", soon: "Comes with Daily Work", landscape: true },
  { k: "dpr", ic: "📄", label: "Daily Progress Report (DPR)", sub: "English / हिंदी, signatures", soon: "Phase 3", landscape: false },
];

const MARK_SHORT: Record<string, string> = { P: "P", HD: "½", A: "A" };
const STATUS: Record<string, string> = { FULL: "Full day", HALF: "Half day", HOUR: "Hourly", BREAKDOWN: "Breakdown", ABSENT: "Absent" };
const monthLabel = (m: string) => formatDate(`${m}-01`).slice(3);
const monthEnd = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const live = (rows: DocumentData[]) => rows.filter((r) => !r.deleted);

/** projects/{pid}/{col} — businessDate (ya koi field) from..to */
function useRange(pid: string | undefined, col: string, from: string, to: string, field = "businessDate") {
  const [rows, setRows] = useState<DocumentData[] | null>(null);
  useEffect(() => {
    if (!pid) return;
    setRows(null);
    return onSnapshot(query(collection(db, "projects", pid, col), where(field, ">=", from), where(field, "<=", to)), (s) =>
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [pid, col, from, to, field]);
  return rows;
}
function useCol(pid: string | undefined, col: string) {
  const [rows, setRows] = useState<DocumentData[] | null>(null);
  useEffect(() => {
    if (!pid) return;
    setRows(null);
    return onSnapshot(collection(db, "projects", pid, col), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [pid, col]);
  return rows;
}
function useDocData(pid: string | undefined, col: string, id: string) {
  const [d, setD] = useState<DocumentData | null | undefined>(undefined);
  useEffect(() => {
    if (!pid) return;
    setD(undefined);
    return onSnapshot(doc(db, "projects", pid, col, id), (s) => setD(s.exists() ? s.data() : null));
  }, [pid, col, id]);
  return d;
}

/** settings/global.rental.shiftHours (OT = rate ÷ shift) — server bhi yahi leta hai */
function useShiftHours() {
  const [h, setH] = useState(8);
  useEffect(() => onSnapshot(doc(db, "settings", "global"), (s) => setH(Number(s.data()?.rental?.shiftHours) || 8)), []);
  return h;
}

export function Reports() {
  const { current } = useProjects();
  const [params, setParams] = useSearchParams();
  const kind = (params.get("r") as Kind | null) ?? null;
  const today = toBusinessDateIST(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [labourPeriod, setLabourPeriod] = useState<"week" | "month">("week");
  const [weekOf, setWeekOf] = useState(today);
  const [group, setGroup] = useState(params.get("g") ?? "COMPANY");
  const [party, setParty] = useState(params.get("p") ?? "");
  const contractors = useMaster("masters_contractors");
  const parties = useMaster("masters_parties");

  if (!current) return <div className="card empty">Select a project first.</div>;
  const r = REPORTS.find((x) => x.k === kind);

  if (!r) {
    return (
      <>
        <PageHead title="Reports & PDF" sub={`${current.name} — every hisab as a PDF to download, print or share`} />
        <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {REPORTS.map((x) => (
            <button key={x.k} className="card mod" disabled={!!x.soon} onClick={() => setParams({ r: x.k })} style={x.soon ? { opacity: 0.55 } : undefined}>
              <span className="bubble">{x.ic}</span>
              <b>{x.label}</b>
              <span>{x.soon ?? x.sub}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  const ws = weekStart(weekOf);
  const lFrom = labourPeriod === "week" ? ws : `${month}-01`;
  const lTo = labourPeriod === "week" ? addDays(ws, 6) : monthEnd(month);
  const groupName = group === "COMPANY" ? "Company labour" : (contractors.find((c) => c.id === group)?.name ?? group);
  const partyName = parties.find((p) => p.id === party)?.name ?? contractors.find((c) => c.id === party)?.name ?? "";

  let title = r.label;
  let period = monthLabel(month);
  if (r.k === "labour") {
    title = `Labour — ${groupName}`;
    period = labourPeriod === "week" ? `Week ${formatDate(lFrom)} to ${formatDate(lTo)}` : monthLabel(month);
  }
  if (r.k === "stock") period = `${formatDate(from)} to ${formatDate(to)}`;
  if (r.k === "ledger") {
    title = `Ledger — ${partyName || "select a party"}`;
    period = `Up to ${formatDate(today)}`;
  }

  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <PageHead title={r.label} sub={r.sub}>
          <button className="btn" onClick={() => setParams({})}>← All reports</button>
          <button className="btn primary" onClick={() => downloadPdf(current.name, title, period, r.landscape)} disabled={r.k === "ledger" && !party}>
            ⬇ Download PDF
          </button>
        </PageHead>
        <div className="card pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          {(r.k === "staff" || r.k === "machinery" || r.k === "store" || (r.k === "labour" && labourPeriod === "month")) && (
            <div className="field">
              <label htmlFor="rp-month">Month</label>
              <input id="rp-month" type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </div>
          )}
          {r.k === "labour" && (
            <>
              <div className="field">
                <label htmlFor="rp-group">Labour of</label>
                <select id="rp-group" className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="COMPANY">Company labour</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Period</span>
                <div className="checks">
                  <button className="tab" aria-pressed={labourPeriod === "week"} onClick={() => setLabourPeriod("week")}>Week (Mon–Sun)</button>
                  <button className="tab" aria-pressed={labourPeriod === "month"} onClick={() => setLabourPeriod("month")}>Month</button>
                </div>
              </div>
              {labourPeriod === "week" && (
                <div className="field">
                  <label htmlFor="rp-week">Any day of the week</label>
                  <input id="rp-week" type="date" className="input" value={weekOf} onChange={(e) => e.target.value && setWeekOf(e.target.value)} />
                </div>
              )}
            </>
          )}
          {r.k === "stock" && (
            <>
              <div className="field">
                <label htmlFor="rp-from">From</label>
                <input id="rp-from" type="date" className="input" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rp-to">To</label>
                <input id="rp-to" type="date" className="input" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </div>
            </>
          )}
          {r.k === "ledger" && (
            <div className="field">
              <label htmlFor="rp-party">Party / contractor</label>
              <select id="rp-party" className="input" value={party} onChange={(e) => setParty(e.target.value)}>
                <option value="">— select —</option>
                <optgroup label="Suppliers / parties">
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Contractors">
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
          <p className="small muted" style={{ flexBasis: "100%", margin: 0 }}>
            Download PDF opens the print window — choose <b>Save as PDF</b> (on phone: Share → Print → Save as PDF). {r.landscape ? "Page is set to landscape." : ""}
          </p>
        </div>
      </div>
      <Sheet project={current.name} title={title} period={period}>
        {r.k === "staff" && <StaffBody pid={current.id} month={month} />}
        {r.k === "labour" && <LabourBody pid={current.id} from={lFrom} to={lTo} group={group} contractor={contractors.find((c) => c.id === group) ?? null} />}
        {r.k === "machinery" && <MachineryBody pid={current.id} month={month} />}
        {r.k === "stock" && <StockBody pid={current.id} from={from <= to ? from : to} to={from <= to ? to : from} />}
        {r.k === "store" && <StoreBody pid={current.id} month={month} contractors={contractors} />}
        {r.k === "ledger" && (party ? <LedgerBody pid={current.id} partyId={party} /> : <p>Select a party or contractor.</p>)}
      </Sheet>
    </>
  );
}

function Loading() {
  return <p className="note-line">Loading…</p>;
}

// ---------------- Staff ----------------
function StaffBody({ pid, month }: { pid: string; month: string }) {
  const staff = useMaster("masters_staff");
  const att = useRange(pid, "staffAttendance", `${month}-01`, monthEnd(month));
  const balances = useCol(pid, "staffBalances");
  if (!att || !balances) return <Loading />;
  const dates = dateRange(`${month}-01`, monthEnd(month));
  const grid = latestMarks(att.map((a) => ({ key: a.staffId, businessDate: a.businessDate, mark: a.mark, rev: a.rev, deleted: a.deleted })));
  const bal = Object.fromEntries(balances.map((b) => [b.id, b]));
  const ids = staff.map((s) => s.id).filter((id) => grid[id] || bal[id]);
  // Mahine ki line server ke statement se; purana saved hisab (statement se pehle ka) ho to "aaj tak" wala, * ke saath
  const monthRow = (id: string) => {
    const b = bal[id];
    if (!b) return undefined;
    const m = (b.months as DocumentData[] | undefined)?.find((x) => x.month === month);
    if (m) return m;
    return b.months ? undefined : { earnedPaise: b.earnedPaise ?? 0, expensePaise: b.expensePaise ?? 0, paidPaise: b.paidPaise ?? 0, balancePaise: b.balancePaise ?? 0, tillToday: true };
  };
  const anyTillToday = ids.some((id) => monthRow(id)?.tillToday);
  return (
    <>
      <h2>Attendance (P = present, ½ = half day, A = absent)</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            {dates.map((d) => (
              <th key={d} className="c">{Number(d.slice(8))}</th>
            ))}
            <th className="c">P</th>
            <th className="c">½</th>
            <th className="c">A</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const g = grid[id] ?? {};
            const marks = Object.values(g).map((x) => x.mark);
            return (
              <tr key={id}>
                <td>{staff.find((s) => s.id === id)?.name}</td>
                {dates.map((d) => (
                  <td key={d} className="c">{g[d] ? MARK_SHORT[g[d]!.mark] : ""}</td>
                ))}
                <td className="c">{marks.filter((m) => m === "P").length}</td>
                <td className="c">{marks.filter((m) => m === "HD").length}</td>
                <td className="c">{marks.filter((m) => m === "A").length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Khata — {monthLabel(month)}</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Designation</th>
            <th className="r">Monthly salary</th>
            <th className="r">Earned</th>
            <th className="r">Expense</th>
            <th className="r">Paid / advance</th>
            <th className="r">Balance (till month end)</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const s = staff.find((x) => x.id === id);
            const m = monthRow(id);
            return (
              <tr key={id}>
                <td>{s?.name}</td>
                <td>{s?.designation ?? ""}</td>
                <td className="r">{s?.salaryPaise != null ? formatINR(s.salaryPaise) : "—"}</td>
                <td className="r">{m ? formatINR(m.earnedPaise) : "—"}</td>
                <td className="r">{m ? formatINR(m.expensePaise) : "—"}</td>
                <td className="r">{m ? formatINR(m.paidPaise) : "—"}</td>
                <td className={`r ${m && m.balancePaise < 0 ? "neg" : ""}`}>{m ? `${formatINR(m.balancePaise)}${m.tillToday ? " *" : ""}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note-line">Balance: + = company has to pay; − = staff has taken more (advance). {ids.length === 0 ? "No staff entries in this month." : ""}
        {anyTillToday ? " * Figures till today (month-wise split appears after the next staff entry)." : ""}</p>
    </>
  );
}

// ---------------- Labour ----------------
function LabourBody({ pid, from, to, group, contractor }: { pid: string; from: string; to: string; group: string; contractor: MasterRow | null }) {
  const labour = useCol(pid, "labour");
  const att = useRange(pid, "labourAttendance", from, to);
  const pays = useRange(pid, "labourPassbook", from, to);
  const muster = useRange(pid, "labourMuster", from, to);
  const balances = useCol(pid, "labourBalances");
  const shift = useShiftHours();
  if (!labour || !att || !pays || !muster || !balances) return <Loading />;
  const dates = dateRange(from, to);
  const mine = att.filter((a) => (a.group ?? "COMPANY") === group);
  const grid = latestMarks(mine.map((a) => ({ key: a.labourId, businessDate: a.businessDate, mark: a.mark, otHours: a.otHours, ratePaise: a.ratePaise, rev: a.rev, deleted: a.deleted })));
  const people = labour.filter((l) => (l.group ?? "COMPANY") === group && !l.deleted && (grid[l.id] || !l.leftOn || l.leftOn >= from));
  const bal = Object.fromEntries(balances.map((b) => [b.id, b]));
  const rows = people
    .map((l) => {
      const g = grid[l.id] ?? {};
      const marks: LabourMark[] = Object.entries(g).map(([d, x]) => ({ businessDate: d, mark: x.mark, otHours: x.otHours, ratePaise: x.ratePaise ?? null }));
      const e = labourEarning(marks, l.ratePaise ?? 0, shift);
      const paid = sum(live(pays).filter((p) => p.labourId === l.id).map((p) => p.amountPaise ?? 0));
      return { l, g, e, paid };
    })
    .filter((x) => Object.keys(x.g).length || x.paid);
  const counts = live(muster).filter((m) => m.contractorId === group).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  return (
    <>
      {contractor && (
        <p className="note-line">
          Contractor: <b>{contractor.name}</b> · Labour paid by: {contractor.labourPaidBy === "US" ? "Company (we pay)" : "Contractor (record only)"}
        </p>
      )}
      <h2>Name-wise attendance (P / ½ / A, +OT hours)</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th className="r">Rate/day</th>
            {dates.map((d) => (
              <th key={d} className="c">{dates.length > 7 ? Number(d.slice(8)) : formatDate(d).slice(0, 6)}</th>
            ))}
            <th className="c">Days</th>
            <th className="c">OT h</th>
            <th className="r">Amount</th>
            <th className="r">Paid (period)</th>
            <th className="r">Balance (today)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ l, g, e, paid }) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{l.type ?? ""}</td>
              <td className="r">{formatINR(l.ratePaise ?? 0)}</td>
              {dates.map((d) => (
                <td key={d} className="c">{g[d] ? `${MARK_SHORT[g[d]!.mark]}${g[d]!.otHours ? `+${g[d]!.otHours}` : ""}` : ""}</td>
              ))}
              <td className="c">{formatQtyShort(e.days)}</td>
              <td className="c">{formatQtyShort(e.otHours)}</td>
              <td className="r">{formatINR(e.amountPaise)}</td>
              <td className="r">{formatINR(paid)}</td>
              <td className={`r ${(bal[l.id]?.balancePaise ?? 0) < 0 ? "neg" : ""}`}>{bal[l.id] ? formatINR(bal[l.id]!.balancePaise) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3 + dates.length}>Total</td>
            <td className="c">{formatQtyShort(sum(rows.map((x) => x.e.days)))}</td>
            <td className="c">{formatQtyShort(sum(rows.map((x) => x.e.otHours)))}</td>
            <td className="r">{formatINR(sum(rows.map((x) => x.e.amountPaise)))}</td>
            <td className="r">{formatINR(sum(rows.map((x) => x.paid)))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {rows.length === 0 && <p className="note-line">No name-wise attendance in this period.</p>}
      {group !== "COMPANY" && (
        <>
          <h2>Head-count (when names were not entered)</h2>
          {counts.length === 0 ? (
            <p className="note-line">No head-count entries in this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="c">Mistri</th>
                  <th className="c">Kuli</th>
                  <th className="c">Reja</th>
                  <th className="c">Total</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.businessDate)}</td>
                    <td className="c">{m.mistri ?? 0}</td>
                    <td className="c">{m.kuli ?? 0}</td>
                    <td className="c">{m.reja ?? 0}</td>
                    <td className="c">{(m.mistri ?? 0) + (m.kuli ?? 0) + (m.reja ?? 0)}</td>
                    <td>{m.remark ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <p className="note-line">Amount = days × rate + OT hours × rate ÷ {shift} (rate as saved on each day). Balance: + = to pay, − = advance given.</p>
    </>
  );
}

// ---------------- Machinery ----------------
function MachineryBody({ pid, month }: { pid: string; month: string }) {
  const machines = useMaster("masters_machines");
  const logs = useRange(pid, "machineLogs", `${month}-01`, monthEnd(month));
  const days = useRange(pid, "days", `${month}-01`, monthEnd(month), "date");
  const [bills, setBills] = useState<DocumentData[] | null>(null);
  useEffect(() => {
    setBills(null);
    void getDocs(query(collection(db, "projects", pid, "machineBills"), where("month", "==", month))).then((s) => setBills(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [pid, month]);
  if (!logs || !days || !bills) return <Loading />;
  const dayDoc = Object.fromEntries(days.map((d) => [d.date ?? d.id, d]));
  // ek machine ek din — aakhri (bada rev) entry
  const best = new Map<string, DocumentData>();
  for (const l of live(logs)) {
    const k = `${l.machineId}|${l.businessDate}`;
    if (!best.has(k) || (l.rev ?? 0) >= (best.get(k)!.rev ?? 0)) best.set(k, l);
  }
  const byMachine = new Map<string, DocumentData[]>();
  for (const l of best.values()) byMachine.set(l.machineId, [...(byMachine.get(l.machineId) ?? []), l]);
  const name = (id: string) => machines.find((m) => m.id === id)?.name ?? id;
  return (
    <>
      {[...byMachine].sort((a, b) => name(a[0]).localeCompare(name(b[0]))).map(([mid, ls]) => {
        const rows = ls.sort((a, b) => a.businessDate.localeCompare(b.businessDate)).map((l) => ({ l, c: dayDoc[l.businessDate]?.machines?.[mid] as DocumentData | undefined }));
        const m = machines.find((x) => x.id === mid);
        return (
          <section key={mid}>
            <h2>
              {name(mid)} <span className="sheet-sub">· {m?.kind === "COMPANY" ? "Company" : `Rental ${m?.ratePaise != null ? `${formatINR(m.ratePaise)} / ${String(m.rateType ?? "").toLowerCase()}` : ""}`}</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="r">SR</th>
                  <th className="r">CR</th>
                  <th className="r">Hours</th>
                  <th className="r">Diesel (L)</th>
                  <th className="r">Amount</th>
                  <th>Remark / breakdown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ l, c }) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.businessDate)}</td>
                    <td>{STATUS[l.status] ?? l.status}</td>
                    <td className="r">{l.sr ?? ""}</td>
                    <td className="r">{l.cr ?? ""}</td>
                    <td className="r">{c?.hoursText ?? ""}</td>
                    <td className="r">{formatQtyShort(Number(l.dieselLtr) || 0)}</td>
                    <td className="r">{c?.amountPaise != null ? formatINR(c.amountPaise) : "—"}</td>
                    <td>{[l.breakdownReason, l.remark].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total ({rows.length} days)</td>
                  <td className="r">{formatQtyShort(sum(rows.map((x) => Number(x.c?.hours) || 0)))} h</td>
                  <td className="r">{formatQtyShort(sum(rows.map((x) => Number(x.l.dieselLtr) || 0)))}</td>
                  <td className="r">{formatINR(sum(rows.map((x) => Number(x.c?.amountPaise) || 0)))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
      {byMachine.size === 0 && <p className="note-line">No machine logs in this month.</p>}
      {bills.length > 0 && (
        <>
          <h2>Monthly rental bill — {monthLabel(month)}</h2>
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th className="r">Days on site</th>
                <th className="r">Idle days</th>
                <th className="r">Rental</th>
                <th className="r">Deductions (advance etc.)</th>
                <th className="r">Net payable</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.machineName ?? name(b.id.replace(/_\d{4}-\d{2}$/, ""))}</td>
                  <td className="r">{b.siteDays ?? "—"}</td>
                  <td className="r">{b.idleDays ?? "—"}</td>
                  <td className="r">{b.rentalPaise != null ? formatINR(b.rentalPaise) : b.error ?? "—"}</td>
                  <td className="r">{b.deductionPaise != null ? formatINR(b.deductionPaise) : "—"}</td>
                  <td className="r"><b>{b.netPaise != null ? formatINR(b.netPaise) : "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ---------------- Stock ----------------
function StockBody({ pid, from, to }: { pid: string; from: string; to: string }) {
  const materials = useMaster("masters_materials");
  const days = useRange(pid, "days", from, to, "date");
  if (!days) return <Loading />;
  const byDate = Object.fromEntries(days.map((d) => [d.date ?? d.id, (d.stock ?? {}) as Record<string, DayItemBalance>]));
  const dates = dateRange(from, to);
  // Sirf woh material jinme is period mein kuch hai (sab 0 wale PDF mein nahi)
  const items = materials.filter((m) => dates.some((d) => {
    const b = byDate[d]?.[m.id];
    return b && (b.opening || b.inward || b.uses || b.adjust || b.closing);
  }));
  return (
    <>
      {items.map((m) => {
        const rows = dates.map((d) => ({ d, b: byDate[d]?.[m.id] })).filter((x) => x.b) as { d: string; b: DayItemBalance }[];
        return (
          <section key={m.id}>
            <h2>
              {m.name} <span className="sheet-sub">({m.baseUnit})</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Opening</th>
                  <th className="r">Received</th>
                  <th className="r">Used</th>
                  <th className="r">Adjust</th>
                  <th className="r">Closing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, b }) => (
                  <tr key={d}>
                    <td>{formatDate(d)}</td>
                    <td className="r">{formatQtyShort(b.opening)}</td>
                    <td className="r">{formatQtyShort(b.inward)}</td>
                    <td className="r">{formatQtyShort(b.uses)}</td>
                    <td className="r">{b.adjust ? formatQtyShort(b.adjust) : ""}</td>
                    <td className="r"><b>{formatQtyShort(b.closing)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Period</td>
                  <td className="r">{formatQtyShort(rows[0]!.b.opening)}</td>
                  <td className="r">{formatQtyShort(sum(rows.map((x) => x.b.inward)))}</td>
                  <td className="r">{formatQtyShort(sum(rows.map((x) => x.b.uses)))}</td>
                  <td className="r">{formatQtyShort(sum(rows.map((x) => x.b.adjust)))}</td>
                  <td className="r">{formatQtyShort(rows[rows.length - 1]!.b.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
      {items.length === 0 && <p className="note-line">No stock calculation in this period.</p>}
      <p className="note-line">Closing = Opening + Received − Used (± count adjustment). Yesterday's closing = today's opening.</p>
    </>
  );
}

// ---------------- Store ----------------
const STORE_KIND: Record<string, string> = { INWARD: "Received", ISSUE: "Issued", RETURN: "Returned", CONSUME: "Used up", TRANSFER_OUT: "Sent to site", TRANSFER_IN: "From site" };
function StoreBody({ pid, month, contractors }: { pid: string; month: string; contractors: MasterRow[] }) {
  const items = useMaster("masters_storeItems");
  const st = useDocData(pid, "storeSummary", `m_${month}`);
  const cur = useDocData(pid, "storeSummary", "current");
  const moves = useRange(pid, "storeMoves", `${month}-01`, monthEnd(month));
  const iName = useMemo(() => (id: string) => items.find((i) => i.id === id)?.name ?? id, [items]);
  if (st === undefined || cur === undefined || !moves) return <Loading />;
  const rows = Object.entries((st?.items ?? {}) as Record<string, StoreStatementRow>).sort((a, b) => iName(a[0]).localeCompare(iName(b[0])));
  const cName = (id: string) => (id === "COMPANY" ? "Company (own labour)" : (contractors.find((c) => c.id === id)?.name ?? id));
  const mv = live(moves).sort((a, b) => `${a.businessDate} ${a.time ?? ""}`.localeCompare(`${b.businessDate} ${b.time ?? ""}`));
  return (
    <>
      <h2>Statement</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Opening</th>
            <th className="r">Received</th>
            <th className="r">Issued</th>
            <th className="r">Returned</th>
            <th className="r">Used up</th>
            <th className="r">Transfer in / out</th>
            <th className="r">Broken / lost</th>
            <th className="r">Closing (store)</th>
            <th className="r">With contractors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, s]) => (
            <tr key={id}>
              <td>{iName(id)} <span className="sheet-sub">{items.find((i) => i.id === id)?.unit}</span></td>
              <td className="r">{formatQtyShort(s.openingStore)}</td>
              <td className="r">{formatQtyShort(s.inward)}</td>
              <td className="r">{formatQtyShort(s.issued)}</td>
              <td className="r">{formatQtyShort(s.returnedOk + s.damaged)}</td>
              <td className="r">{formatQtyShort(s.consumed)}</td>
              <td className="r">{formatQtyShort(s.transferIn)} / {formatQtyShort(s.transferOut)}</td>
              <td className="r">{formatQtyShort(s.broken)} / {formatQtyShort(s.lost)}</td>
              <td className="r"><b>{formatQtyShort(s.closingStore)}</b></td>
              <td className="r">{formatQtyShort(s.closingWithContractors)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="note-line">No store activity in this month.</p>}
      <h2>Movements</h2>
      <table>
        <thead>
          <tr>
            <th>Date / time</th>
            <th>Item</th>
            <th>Type</th>
            <th className="r">Qty</th>
            <th>Contractor / party / site</th>
            <th className="r">Amount</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {mv.map((m) => (
            <tr key={m.id}>
              <td>{formatDate(m.businessDate)} {m.time ?? ""}</td>
              <td>{m.itemName ?? iName(m.itemId)}</td>
              <td>{STORE_KIND[m.type] ?? m.type}{m.condition && m.condition !== "OK" ? ` (${String(m.condition).toLowerCase()})` : ""}</td>
              <td className="r">{formatQtyShort(Number(m.qty) || 0)} {m.unit ?? ""}</td>
              <td>{[m.contractorId && cName(m.contractorId), m.partyName, m.otherProjectName ?? m.otherProjectId, m.purpose].filter(Boolean).join(" · ")}</td>
              <td className="r">{m.amountPaise != null ? formatINR(m.amountPaise) : m.recoveryPaise ? `Recovery ${formatINR(m.recoveryPaise)}` : ""}</td>
              <td>{[m.billNo && `Bill ${m.billNo}`, m.remark].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>With contractors (as on {cur?.asOf ? formatDate(cur.asOf) : "—"})</h2>
      {((cur?.holdings ?? []) as DocumentData[]).length === 0 ? (
        <p className="note-line">Nothing is with any contractor.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Contractor</th>
              <th>Item</th>
              <th className="r">Qty</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {(cur!.holdings as DocumentData[]).map((h) => (
              <tr key={`${h.contractorId}-${h.itemId}`}>
                <td>{cName(h.contractorId)}</td>
                <td>{iName(h.itemId)}</td>
                <td className="r">{formatQtyShort(h.qty)}</td>
                <td>{formatDate(h.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------- Party / contractor ledger ----------------
const LEDGER_TYPE: Record<string, string> = { BILL: "Bill", PAYMENT: "Payment", DEBIT_NOTE: "Debit note", RECOVERY: "Recovery" };
function LedgerBody({ pid, partyId }: { pid: string; partyId: string }) {
  const [rows, setRows] = useState<DocumentData[] | null>(null);
  useEffect(() => {
    setRows(null);
    return onSnapshot(query(collection(db, "projects", pid, "ledger"), where("partyId", "==", partyId)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [pid, partyId]);
  if (!rows) return <Loading />;
  const lines = runningLedger(rows.map((r) => ({ id: r.id, businessDate: r.businessDate, type: r.type, amountPaise: r.amountPaise ?? 0, deleted: r.deleted })));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const last = lines[lines.length - 1];
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Particulars</th>
            <th className="r">Bill (Dr)</th>
            <th className="r">Paid / recovery (Cr)</th>
            <th className="r">Balance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const r = byId[l.id]!;
            return (
              <tr key={l.id}>
                <td>{formatDate(l.businessDate)}</td>
                <td>{LEDGER_TYPE[l.type] ?? l.type}</td>
                <td>{[r.itemName, r.qty != null && `× ${formatQtyShort(Number(r.qty))}`, r.billNo && `Bill ${r.billNo}`, r.condition && String(r.condition).toLowerCase(), r.mode, r.refNo, r.remark].filter(Boolean).join(" · ")}</td>
                <td className="r">{l.debitPaise ? formatINR(l.debitPaise) : ""}</td>
                <td className="r">{l.creditPaise ? formatINR(l.creditPaise) : ""}</td>
                <td className={`r ${l.balancePaise < 0 ? "neg" : ""}`}>{formatINR(l.balancePaise)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total</td>
            <td className="r">{formatINR(sum(lines.map((l) => l.debitPaise)))}</td>
            <td className="r">{formatINR(sum(lines.map((l) => l.creditPaise)))}</td>
            <td className="r">{last ? formatINR(last.balancePaise) : formatINR(0)}</td>
          </tr>
        </tfoot>
      </table>
      {lines.length === 0 && <p className="note-line">No ledger entries for this party yet.</p>}
      <p className="note-line">
        Balance (bakaya) = total bills − total paid / recovered. + = company has to pay; − = to be recovered from the party. Payments are added from the Creditors page (coming next).
      </p>
    </>
  );
}
