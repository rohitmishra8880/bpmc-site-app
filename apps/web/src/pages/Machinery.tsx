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
  ["HOUR", "Ghante", "warn"],
  ["BREAKDOWN", "Breakdown", "crit"],
  ["ABSENT", "Absent", "neutral"],
];
const RATE_TYPE: Record<string, string> = { DAY: "/din", MONTH: "/mahina", HOUR: "/ghanta" };
const DEDUCTION: [string, string][] = [
  ["OWNER_ADVANCE", "Owner ko advance"],
  ["DRIVER_ADVANCE", "Driver ko advance"],
  ["SITE_MATERIAL", "Site se saman (repair)"],
  ["SITE_DIESEL", "Site ka diesel / oil"],
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

  if (!current) return <div className="card empty">Pehle project chuno.</div>;

  const removeIt = async (col: "machineLogs" | "machineDeductions", e: Entry, reason: string) => {
    try {
      const writes: EntryWrite[] = [softDeleteWrite(col, e, profile.email, reason)];
      if (col === "machineLogs") {
        const mv = (moves ?? []).find((m) => m.id === moveIdFor(e.id) && !m.deleted);
        if (mv) writes.push(softDeleteWrite("stockMoves", mv, profile.email, reason));
      }
      await writeEntries(current.id, profile.email, writes, reason);
      toast("Hata diya — Recycle Bin mein");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <>
      <DateBar title="Machine Log & Fuel" sub={`${current.name} — ghante, meter reading, diesel aur shift`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      <PageHead title="Machinery Tracking" sub="Har machine ka ek din mein ek log. Diesel yahin bharo — stock khud ghatega.">
        {open && (
          <button className="btn" onClick={() => setDedForm("new")}>
            ＋ Advance / katauti
          </button>
        )}
      </PageHead>
      <div className="stats">
        <div className="card stat" style={breakdowns.length ? { borderColor: "var(--crit)" } : undefined}>
          <span className="lab">Chalu machine</span>
          <span className="num">
            {running}
            <small>/ {machines.length}</small>
          </span>
          <span className="foot">{breakdowns.length ? `${breakdowns.length} breakdown` : `${logBy.size} ka log bhara`}</span>
        </div>
        <div className="card stat">
          <span className="lab">Machine ko diesel</span>
          <span className="num">
            {day?.machineTotals ? day.machineTotals.dieselLtr : "—"}
            <small>Ltr</small>
          </span>
          <span className="foot">Wahi number Inventory mein</span>
        </div>
        <div className="card stat">
          <span className="lab">Kul ghante</span>
          <span className="num" style={{ fontSize: 28 }}>
            {day?.machineTotals ? formatHours(day.machineTotals.hours) : "—"}
          </span>
          <span className="foot">Server ka hisab (CR − SR)</span>
        </div>
        <div className="card stat">
          <span className="lab">Aaj ka rental</span>
          <span className="num" style={{ fontSize: 24 }}>
            {day?.machineTotals ? formatINR(day.machineTotals.amountPaise) : "—"}
          </span>
          <span className="foot">Din / ghante wali machine; mahine wali bill mein</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Daily Machine Log</h2>
            <p className="small muted">Machine par dabao → SR, CR, status, diesel bharo</p>
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
                <th className="r">Ghante</th>
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
                    <td>{st ? <span className={`pill ${st[2]}`}>{st[1]}</span> : <span className="pill neutral">Log nahi</span>}</td>
                    <td className="r">
                      <b>{s ? (s.amountPaise === null ? (m.rateType === "MONTH" ? "Mahine mein" : "—") : formatINR(s.amountPaise)) : l ? "⏳" : "—"}</b>
                      {s?.warning && <span className="small" style={{ display: "block", color: "var(--warn)" }}>{s.warning}</span>}
                    </td>
                    <td className="wrap small">{l?.remark ?? ""}</td>
                    <td>
                      <div className="actions">
                        {open && (
                          <button className={`btn sm ${l ? "" : "primary"}`} onClick={() => setEditing(m)}>
                            {l ? "✎ Badlo" : "＋ Log"}
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
          {machines.length === 0 && <div className="empty">Masters → Machine mein machine jodo (DG set bhi).</div>}
        </div>
        <p className="note">Ghante = CR − SR (2951.8 − 2944.0 = 7h 48m). Breakdown / Absent ka rental 0. Mahine wali machine ka hisab neeche bill mein.</p>
      </section>

      <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <section className="card" style={breakdowns.length ? { borderColor: "var(--crit)" } : undefined}>
          <div className="card-head">
            <h2 style={breakdowns.length ? { color: "var(--crit)" } : undefined}>Breakdown register</h2>
          </div>
          {breakdowns.length === 0 && <div className="empty">Is din koi breakdown nahi</div>}
          {breakdowns.map((b) => (
            <div key={b.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <b>{machines.find((m) => m.id === b.machineId)?.name ?? b.machineId}</b>
              <span className="small muted">
                {" "}
                · {b.breakdownFrom ?? "?"} se {b.breakdownTo ? `${b.breakdownTo} tak` : "— abhi band"}
              </span>
              <div className="small">{b.breakdownReason ?? "Kaaran nahi likha"}</div>
            </div>
          ))}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Advance / katauti (aaj)</h2>
          </div>
          {liveDeds.length === 0 && <div className="empty">Is din koi advance nahi</div>}
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
          title={removing.col === "machineLogs" ? "Yeh machine log hatana hai? (diesel bhi stock mein wapas)" : "Yeh advance hatana hai?"}
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
    if (!Number.isFinite(srN) || !Number.isFinite(crN)) readErr = "Reading number honi chahiye";
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
      await writeEntries(current.id, profile.email, writes, log ? reason.trim() : "Machine log se");
      toast(navigator.onLine ? "Log save ✓ · server hisab kar raha hai ⏳" : "Phone mein save — network aate hi jayega");
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>Aaj kaisi chali</span>
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
            <label htmlFor="m-sr">SR (shuru reading)</label>
            <input id="m-sr" className="input" inputMode="decimal" value={sr} onChange={(e) => setSr(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
            {lastCr && <span className="hint">Pichhla CR {lastCr.cr} ({formatDate(lastCr.date)})</span>}
          </div>
          <div className="field">
            <label htmlFor="m-cr">CR (band reading)</label>
            <input id="m-cr" className="input" inputMode="decimal" value={cr} onChange={(e) => setCr(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
          </div>
        </div>
        <div className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", background: "var(--surface-2)" }}>
          <span className="small">Ghante (jaanch ke liye — pakka hisab server)</span>
          <b style={{ fontSize: 22 }}>{readErr ? <span style={{ color: "var(--crit)", fontSize: 14 }}>{readErr}</span> : (preview ?? "—")}</b>
        </div>
        {needHours && preview === null && !readErr && <span className="small" style={{ color: "var(--warn)" }}>Ghante wali machine — SR aur CR dono bharo</span>}
        <div className="field">
          <label htmlFor="m-d">Diesel diya (Ltr)</label>
          <input id="m-d" className="input" inputMode="decimal" value={diesel} onChange={(e) => setDiesel(e.target.value)} placeholder="0" style={{ fontSize: 22, fontWeight: 700 }} />
          <span className="hint">Yahin se Inventory ka diesel ghatega — wahan alag mat likho</span>
        </div>
        {status === "BREAKDOWN" && (
          <div className="grid-form">
            <div className="field">
              <label htmlFor="m-bf">Kab se band</label>
              <input id="m-bf" className="input" type="time" value={bFrom} onChange={(e) => setBFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="m-bt">Kab theek hui (khaali = abhi band)</label>
              <input id="m-bt" className="input" type="time" value={bTo} onChange={(e) => setBTo(e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="m-bw">Kya kharabi *</label>
              <input id="m-bw" className="input" value={bWhy} onChange={(e) => setBWhy(e.target.value)} placeholder="jaise: hydraulic pipe phata" />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="m-rm">Remark / kya kaam hua</label>
          <input id="m-rm" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </div>
        {log && (
          <div className="field">
            <label htmlFor="m-why">Badalne ka kaaran *</label>
            <input id="m-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Radd
          </button>
          <button className="btn primary" disabled={!valid || busy}>
            Save karo
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
      toast("Save ✓ — mahine ke bill mein minus hoga");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title="Advance / katauti" onClose={onClose}>
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
            <label htmlFor="d-k">Kya</label>
            <select id="d-k" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DEDUCTION.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-a">Rakam (₹) *</label>
            <input id="d-a" className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
          </div>
          <div className="field">
            <label htmlFor="d-r">Remark</label>
            <input id="d-r" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="jaise: UPI, driver Ramesh" />
          </div>
        </div>
        {row && (
          <div className="field">
            <label htmlFor="d-w">Badalne ka kaaran *</label>
            <input id="d-w" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Radd
          </button>
          <button className="btn primary" disabled={!valid}>
            Save karo
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
          <h2>Mahine ka bill — {label}</h2>
          <p className="small muted">Server banata hai: rental − advance / site se liya = dena</p>
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
        <div className="empty">{m?.kind === "COMPANY" ? "Company machine — rental bill nahi" : "Is mahine ka bill abhi nahi bana (log aate hi server banayega)"}</div>
      ) : (
        <div style={{ padding: 16, display: "grid", gap: 8 }}>
          <Line l={`Rate (${m?.rateType === "MONTH" ? "mahina" : m?.rateType === "HOUR" ? "ghanta" : "din"})`} r={formatINR(bill.ratePaise ?? 0)} />
          {bill.rateType === "MONTH" && <Line l={`Site se bahar ${bill.offSiteDays} din + na chalne ke ${bill.idleDays} din × ${formatINR(bill.dayRatePaise)}`} r={`−${formatINR(Math.max(0, (bill.ratePaise ?? 0) - bill.rentalPaise))}`} />}
          <Line l="Rental" r={formatINR(bill.rentalPaise)} b />
          <Line l="Advance / site se liya" r={`−${formatINR(bill.deductionPaise)}`} />
          <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 8 }}>
            <Line l="Dena" r={formatINR(bill.netPaise)} b big />
          </div>
          {bill.missingDates?.length > 0 && (
            <p className="small" style={{ color: "var(--warn)" }}>
              ⚠ {bill.missingDates.length} din ka log nahi bhara: {bill.missingDates.slice(0, 6).map((d: string) => formatDate(d)).join(", ")}
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
