import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { canEditDate, formatDate, formatHours, formatINR, machineHours, toBusinessDateIST, toPaise, type RunStatus } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { softDeleteWrite, useDay, useDayEntries, useUnlock, writeEntries, type Entry, type EntryWrite } from "../lib/entries";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

const STATUS: [RunStatus, string, string][] = [
  ["FULL", "Full", "ok"],
  ["HALF", "Half", "warn"],
  ["HOUR", "Hours", "warn"],
  ["BREAKDOWN", "Breakdown", "crit"],
  ["ABSENT", "Absent", "neutral"],
];
const RATE_TYPE: Record<string, string> = { DAY: "/day", MONTH: "/month", HOUR: "/hour" };
const DEDUCTION: [string, string][] = [
  ["OWNER_ADVANCE", "Advance to owner"],
  ["DRIVER_ADVANCE", "Advance to driver"],
  ["SITE_MATERIAL", "Site material (repairs)"],
  ["SITE_DIESEL", "Site diesel / oil"],
];
const DIESEL_ID = "diesel";
/** Machine log ka diesel wala stock movement — log ki id se juda */
const moveIdFor = (logDocId: string) => `ml_${logDocId}`;

interface ServerMachine {
  hoursText: string | null;
  dieselLtr: number;
  amountPaise: number | null;
  warning: string | null;
}

export function Machinery() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const machines = useMaster("masters_machines");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const { rows: logs } = useDayEntries(current?.id, "machineLogs", date);
  const { rows: moves } = useDayEntries(current?.id, "stockMoves", date);
  const { rows: deds } = useDayEntries(current?.id, "machineDeductions", date);
  const day = useDay(current?.id, date);
  const unlock = useUnlock(current?.id, date);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [dedForm, setDedForm] = useState<Entry | "new" | null>(null);
  const [removing, setRemoving] = useState<{ col: "machineLogs" | "machineDeductions"; e: Entry } | null>(null);
  const [billMachine, setBillMachine] = useState<string>("");

  const logBy = useMemo(() => new Map((logs ?? []).filter((l) => !l.deleted).map((l) => [l.machineId as string, l])), [logs]);
  const srv: Record<string, ServerMachine> = day?.machines ?? {};
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const pending = [...(logs ?? []), ...(deds ?? [])].filter((r) => !r.deleted && r.serverStatus === "PENDING").length;
  const running = [...logBy.values()].filter((l) => ["FULL", "HALF", "HOUR"].includes(l.status)).length;
  const breakdowns = [...logBy.values()].filter((l) => l.status === "BREAKDOWN");
  const liveDeds = (deds ?? []).filter((d) => !d.deleted);

  if (!current) return <div className="card empty">Select a project first.</div>;

  const removeIt = async (col: "machineLogs" | "machineDeductions", e: Entry, reason: string) => {
    try {
      const writes: EntryWrite[] = [softDeleteWrite(col, e, profile.email, reason)];
      if (col === "machineLogs") {
        const mv = (moves ?? []).find((m) => m.id === moveIdFor(e.id) && !m.deleted);
        if (mv) writes.push(softDeleteWrite("stockMoves", mv, profile.email, reason));
      }
      await writeEntries(current.id, profile.email, writes, reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <>
      <DateBar title="Machine Log & Fuel" sub={`${current.name} — running hours, meter readings, diesel and shifts`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      <PageHead title="Machinery Tracking" sub="One log per machine per day. Enter diesel here — stock is reduced automatically.">
        {open && (
          <button className="btn" onClick={() => setDedForm("new")}>
            ＋ Advance / deduction
          </button>
        )}
      </PageHead>
      <div className="stats">
        <div className="card stat" style={breakdowns.length ? { borderColor: "var(--crit)" } : undefined}>
          <span className="lab">Machines running</span>
          <span className="num">
            {running}
            <small>/ {machines.length}</small>
          </span>
          <span className="foot">{breakdowns.length ? `${breakdowns.length} breakdown` : `${logBy.size} logged`}</span>
        </div>
        <div className="card stat">
          <span className="lab">Diesel to machines</span>
          <span className="num">
            {day?.machineTotals ? day.machineTotals.dieselLtr : "—"}
            <small>Ltr</small>
          </span>
          <span className="foot">Same figure as in Inventory</span>
        </div>
        <div className="card stat">
          <span className="lab">Total running hours</span>
          <span className="num" style={{ fontSize: 28 }}>
            {day?.machineTotals ? formatHours(day.machineTotals.hours) : "—"}
          </span>
          <span className="foot">Calculated by server (CR − SR)</span>
        </div>
        <div className="card stat">
          <span className="lab">Today's rental</span>
          <span className="num" style={{ fontSize: 24 }}>
            {day?.machineTotals ? formatINR(day.machineTotals.amountPaise) : "—"}
          </span>
          <span className="foot">Day / hour-rate machines; monthly ones in the bill</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Daily Machine Log</h2>
            <p className="small muted">Tap a machine → enter SR, CR, status and diesel</p>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th>Party</th>
                <th className="r">SR</th>
                <th className="r">CR</th>
                <th className="r">Hours</th>
                <th className="r">Diesel</th>
                <th className="r">Rate</th>
                <th>Status</th>
                <th className="r">Amount</th>
                <th>Remark</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const l = logBy.get(m.id);
                const s = srv[m.id];
                const st = STATUS.find((x) => x[0] === l?.status);
                return (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                      <span className="small muted" style={{ display: "block" }}>
                        {m.kind === "COMPANY" ? "Company" : "Rental"}
                      </span>
                    </td>
                    <td>{m.ownerParty ?? "—"}</td>
                    <td className="r">{l?.sr ?? "—"}</td>
                    <td className="r">{l?.cr ?? "—"}</td>
                    <td className="r">
                      <b>{s?.hoursText ?? (l?.serverStatus === "PENDING" ? "⏳" : "—")}</b>
                    </td>
                    <td className="r">{l?.dieselLtr ? `${l.dieselLtr} L` : "—"}</td>
                    <td className="r">
                      {m.ratePaise ? formatINR(m.ratePaise) : "—"}
                      <span className="small muted">{RATE_TYPE[m.rateType] ?? ""}</span>
                    </td>
                    <td>{st ? <span className={`pill ${st[2]}`}>{st[1]}</span> : <span className="pill neutral">No log</span>}</td>
                    <td className="r">
                      <b>{s ? (s.amountPaise === null ? (m.rateType === "MONTH" ? "In monthly bill" : "—") : formatINR(s.amountPaise)) : l ? "⏳" : "—"}</b>
                      {s?.warning && <span className="small" style={{ display: "block", color: "var(--warn)" }}>{s.warning}</span>}
                    </td>
                    <td className="wrap small">{l?.remark ?? ""}</td>
                    <td>
                      <div className="actions">
                        {open && (
                          <button className={`btn sm ${l ? "" : "primary"}`} onClick={() => setEditing(m)}>
                            {l ? "✎ Edit" : "＋ Log"}
                          </button>
                        )}
                        {open && l && (
                          <button className="btn sm danger" onClick={() => setRemoving({ col: "machineLogs", e: l })}>
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {machines.length === 0 && <div className="empty">Add machines under Masters → Machines (include the DG set).</div>}
        </div>
        <p className="note">Hours = CR − SR (2951.8 − 2944.0 = 7h 48m). Breakdown / Absent rental is 0. Monthly-rate machines are settled in the bill below.</p>
      </section>

      <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <section className="card" style={breakdowns.length ? { borderColor: "var(--crit)" } : undefined}>
          <div className="card-head">
            <h2 style={breakdowns.length ? { color: "var(--crit)" } : undefined}>Breakdown register</h2>
          </div>
          {breakdowns.length === 0 && <div className="empty">No breakdowns on this day</div>}
          {breakdowns.map((b) => (
            <div key={b.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <b>{machines.find((m) => m.id === b.machineId)?.name ?? b.machineId}</b>
              <span className="small muted">
                {" "}
                · from {b.breakdownFrom ?? "?"} {b.breakdownTo ? `to ${b.breakdownTo}` : "— still down"}
              </span>
              <div className="small">{b.breakdownReason ?? "No reason entered"}</div>
            </div>
          ))}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Advances / deductions (this day)</h2>
          </div>
          {liveDeds.length === 0 && <div className="empty">No advances on this day</div>}
          {liveDeds.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <div>
                <b>{machines.find((m) => m.id === d.machineId)?.name ?? d.machineId}</b>
                <div className="small muted">
                  {DEDUCTION.find((x) => x[0] === d.kind)?.[1]} {d.remark ? `· ${d.remark}` : ""}
                </div>
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                <b>−{formatINR(d.amountPaise)}</b>
                {open && (
                  <span className="actions">
                    <button className="btn sm" onClick={() => setDedForm(d)}>
                      ✎
                    </button>
                    <button className="btn sm danger" onClick={() => setRemoving({ col: "machineDeductions", e: d })}>
                      🗑
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>

      <MonthlyBill pid={current.id} machines={machines} month={date.slice(0, 7)} selected={billMachine || machines[0]?.id || ""} onSelect={setBillMachine} />

      {editing && <LogForm machine={editing} date={date} log={logBy.get(editing.id) ?? null} moves={moves ?? []} onClose={() => setEditing(null)} />}
      {dedForm && <DeductionForm machines={machines} date={date} row={dedForm === "new" ? null : dedForm} onClose={() => setDedForm(null)} />}
      {removing && (
        <ReasonDialog
          title={removing.col === "machineLogs" ? "Delete this machine log? (its diesel returns to stock)" : "Delete this advance?"}
          onCancel={() => setRemoving(null)}
          onConfirm={(r) => {
            const x = removing;
            setRemoving(null);
            void removeIt(x.col, x.e, r);
          }}
        />
      )}
    </>
  );
}

function LogForm({ machine, date, log, moves, onClose }: { machine: MasterRow; date: string; log: Entry | null; moves: Entry[]; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [status, setStatus] = useState<RunStatus>((log?.status as RunStatus) ?? "FULL");
  const [sr, setSr] = useState(log?.sr != null ? String(log.sr) : "");
  const [cr, setCr] = useState(log?.cr != null ? String(log.cr) : "");
  const [diesel, setDiesel] = useState(log?.dieselLtr ? String(log.dieselLtr) : "");
  const [bFrom, setBFrom] = useState((log?.breakdownFrom as string) ?? "");
  const [bTo, setBTo] = useState((log?.breakdownTo as string) ?? "");
  const [bWhy, setBWhy] = useState((log?.breakdownReason as string) ?? "");
  const [remark, setRemark] = useState((log?.remark as string) ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCr, setLastCr] = useState<{ cr: number; date: string } | null>(null);

  // SR = pichhle log ka CR (kal ka closing = aaj ka opening)
  useEffect(() => {
    if (!current || log) return;
    void getDocs(query(collection(db, "projects", current.id, "machineLogs"), where("machineId", "==", machine.id), where("businessDate", "<", date), orderBy("businessDate", "desc"), limit(5))).then((s) => {
      const prev = s.docs.map((d) => d.data()).find((d) => !d.deleted && d.cr != null);
      if (prev) {
        setLastCr({ cr: prev.cr, date: prev.businessDate });
        setSr((x) => x || String(prev.cr));
      }
    });
  }, [current, machine.id, date, log]);

  const srN = sr === "" ? null : Number(sr);
  const crN = cr === "" ? null : Number(cr);
  const dN = diesel === "" ? 0 : Number(diesel);
  let preview: string | null = null;
  let readErr: string | null = null;
  if (srN != null && crN != null) {
    if (!Number.isFinite(srN) || !Number.isFinite(crN)) readErr = "Readings must be numbers";
    else
      try {
        preview = formatHours(machineHours(srN, crN));
      } catch (e) {
        readErr = (e as Error).message;
      }
  }
  const idle = status === "BREAKDOWN" || status === "ABSENT";
  const needHours = !idle && (machine.rateType === "HOUR" || status === "HOUR");
  const valid =
    !readErr && Number.isFinite(dN) && dN >= 0 && (!needHours || preview !== null) && (status !== "BREAKDOWN" || bWhy.trim().length >= 3) && (!log || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const data: DocumentData = {
      businessDate: date, machineId: machine.id, machineName: machine.name, status, sr: srN, cr: crN, dieselLtr: dN,
      breakdownFrom: status === "BREAKDOWN" ? bFrom || null : null,
      breakdownTo: status === "BREAKDOWN" ? bTo || null : null,
      breakdownReason: status === "BREAKDOWN" ? bWhy.trim() : null,
      remark: remark.trim() || null,
    };
    const id = log?.id ?? doc(collection(db, "projects", current.id, "machineLogs")).id;
    const writes: EntryWrite[] = [{ col: "machineLogs", id, data, current: log, action: log ? "UPDATE" : "CREATE" }];
    // Diesel: usi save mein stock se ghatao (ek hi jagah entry — galti #5, #7).
    // Diesel 0 kiya to movement hatta nahi, 0 ho jaata hai (wapas badhane ke liye Admin na lage).
    const mv = moves.find((m) => m.id === moveIdFor(id)) ?? null;
    const moveData = {
      businessDate: date, itemId: DIESEL_ID, itemName: "Diesel", type: "USE", qty: dN, qtyEntered: dN, unitEntered: "Ltr",
      issuedTo: machine.name, machineId: machine.id, linkedMachineLogId: id, source: "machinery", remark: null,
    };
    if (!mv && dN > 0) writes.push({ col: "stockMoves", id: moveIdFor(id), data: moveData, current: null, action: "CREATE" });
    else if (mv && !mv.deleted && (mv.qty !== dN || mv.businessDate !== date)) writes.push({ col: "stockMoves", id: mv.id, data: moveData, current: mv, action: "UPDATE" });
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, writes, log ? reason.trim() : "From machine log");
      toast(navigator.onLine ? "Log saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`${machine.name} — ${formatDate(date)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Today's run</span>
          <div className="checks">
            {STATUS.map(([k, l, tone]) => (
              <button type="button" key={k} className="tab" aria-pressed={status === k} onClick={() => setStatus(k)} style={status === k ? { background: `var(--${tone === "neutral" ? "nav-active" : tone})`, borderColor: "transparent", color: "#fff" } : undefined}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="m-sr">SR (start reading)</label>
            <input id="m-sr" className="input" inputMode="decimal" value={sr} onChange={(e) => setSr(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
            {lastCr && <span className="hint">Last CR {lastCr.cr} ({formatDate(lastCr.date)})</span>}
          </div>
          <div className="field">
            <label htmlFor="m-cr">CR (close reading)</label>
            <input id="m-cr" className="input" inputMode="decimal" value={cr} onChange={(e) => setCr(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
          </div>
        </div>
        <div className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", background: "var(--surface-2)" }}>
          <span className="small">Hours (preview — final figure from server)</span>
          <b style={{ fontSize: 22 }}>{readErr ? <span style={{ color: "var(--crit)", fontSize: 14 }}>{readErr}</span> : (preview ?? "—")}</b>
        </div>
        {needHours && preview === null && !readErr && <span className="small" style={{ color: "var(--warn)" }}>Hourly machine — enter both SR and CR</span>}
        <div className="field">
          <label htmlFor="m-d">Diesel issued (Ltr)</label>
          <input id="m-d" className="input" inputMode="decimal" value={diesel} onChange={(e) => setDiesel(e.target.value)} placeholder="0" style={{ fontSize: 22, fontWeight: 700 }} />
          <span className="hint">This reduces diesel stock in Inventory — do not enter it there again</span>
        </div>
        {status === "BREAKDOWN" && (
          <div className="grid-form">
            <div className="field">
              <label htmlFor="m-bf">Down since</label>
              <input id="m-bf" className="input" type="time" value={bFrom} onChange={(e) => setBFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="m-bt">Fixed at (blank = still down)</label>
              <input id="m-bt" className="input" type="time" value={bTo} onChange={(e) => setBTo(e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="m-bw">Fault *</label>
              <input id="m-bw" className="input" value={bWhy} onChange={(e) => setBWhy(e.target.value)} placeholder="e.g. hydraulic hose burst" />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="m-rm">Remark / work done</label>
          <input id="m-rm" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </div>
        {log && (
          <div className="field">
            <label htmlFor="m-why">Reason for change *</label>
            <input id="m-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
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

function DeductionForm({ machines, date, row, onClose }: { machines: MasterRow[]; date: string; row: Entry | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [mid, setMid] = useState((row?.machineId as string) ?? machines.find((m) => m.kind !== "COMPANY")?.id ?? "");
  const [kind, setKind] = useState((row?.kind as string) ?? "OWNER_ADVANCE");
  const [amt, setAmt] = useState(row ? String(row.amountPaise / 100) : "");
  const [remark, setRemark] = useState((row?.remark as string) ?? "");
  const [reason, setReason] = useState("");
  const n = Number(amt);
  const valid = mid && amt && Number.isFinite(n) && n > 0 && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(
        current.id,
        profile.email,
        [{ col: "machineDeductions", id: row?.id, current: row, action: row ? "UPDATE" : "CREATE", data: { businessDate: date, machineId: mid, kind, amountPaise: toPaise(n), remark: remark.trim() || null } }],
        row ? reason.trim() : null,
      );
      toast("Saved ✓ — will be deducted in the monthly bill");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title="Advance / deduction" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="d-m">Machine</label>
            <select id="d-m" className="input" value={mid} onChange={(e) => setMid(e.target.value)}>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-k">Type</label>
            <select id="d-k" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DEDUCTION.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-a">Amount (₹) *</label>
            <input id="d-a" className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
          </div>
          <div className="field">
            <label htmlFor="d-r">Remark</label>
            <input id="d-r" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. UPI, driver Ramesh" />
          </div>
        </div>
        {row && (
          <div className="field">
            <label htmlFor="d-w">Reason for change *</label>
            <input id="d-w" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MonthlyBill({ pid, machines, month, selected, onSelect }: { pid: string; machines: MasterRow[]; month: string; selected: string; onSelect: (id: string) => void }) {
  const [bill, setBill] = useState<DocumentData | null>(null);
  useEffect(() => {
    if (!selected) return;
    setBill(null);
    return onSnapshot(doc(db, "projects", pid, "machineBills", `${selected}_${month}`), (s) => setBill(s.data() ?? {}));
  }, [pid, selected, month]);
  const m = machines.find((x) => x.id === selected);
  const [y, mo] = month.split("-");
  const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Monthly bill — {label}</h2>
          <p className="small muted">Prepared by the server: rental − advances / site supplies = payable</p>
        </div>
        <select className="input" style={{ width: "auto", minHeight: 38 }} value={selected} onChange={(e) => onSelect(e.target.value)} aria-label="Machine">
          {machines.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {!bill || bill.rentalPaise === undefined ? (
        <div className="empty">{m?.kind === "COMPANY" ? "Company-owned machine — no rental bill" : "No bill for this month yet (the server prepares it once logs come in)"}</div>
      ) : (
        <div style={{ padding: 16, display: "grid", gap: 8 }}>
          <Line l={`Rate (per ${m?.rateType === "MONTH" ? "month" : m?.rateType === "HOUR" ? "hour" : "day"})`} r={formatINR(bill.ratePaise ?? 0)} />
          {bill.rateType === "MONTH" && <Line l={`Off-site ${bill.offSiteDays} days + idle ${bill.idleDays} days × ${formatINR(bill.dayRatePaise)}`} r={`−${formatINR(Math.max(0, (bill.ratePaise ?? 0) - bill.rentalPaise))}`} />}
          <Line l="Rental" r={formatINR(bill.rentalPaise)} b />
          <Line l="Advances / site supplies" r={`−${formatINR(bill.deductionPaise)}`} />
          <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 8 }}>
            <Line l="Payable" r={formatINR(bill.netPaise)} b big />
          </div>
          {bill.missingDates?.length > 0 && (
            <p className="small" style={{ color: "var(--warn)" }}>
              ⚠ No log entered for {bill.missingDates.length} days: {bill.missingDates.slice(0, 6).map((d: string) => formatDate(d)).join(", ")}
              {bill.missingDates.length > 6 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Line({ l, r, b, big }: { l: string; r: string; b?: boolean; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontWeight: b ? 800 : 500, fontSize: big ? 20 : undefined }}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
}
