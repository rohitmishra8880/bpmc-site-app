// Labour attendance — hafte ka sheet (Mon–Sun). Rohit ka design: PLAN.md Phase 2 "Labour Attendance".
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { addDays, canEditDate, formatDate, formatINR, labourVisibleInWeek, toBusinessDateIST, toPaise, weekDates, type LabourType, type StaffMark } from "@bpmc/core";
import { deviceLabel } from "../lib/audit";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { softDeleteWrite, useUnlocks, writeEntries, type Entry } from "../lib/entries";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, ReasonDialog, useToast } from "../lib/ui";

const TYPES: [LabourType, string][] = [
  ["MISTRI", "Mistri"],
  ["KULI", "Kuli"],
  ["REJA", "Reja"],
];
const TYPE_LABEL = Object.fromEntries(TYPES) as Record<string, string>;
const MARK_TONE: Record<StaffMark, string> = { P: "ok", HD: "warn", A: "crit" };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PAY_MODES: [string, string][] = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["NEFT", "NEFT"],
  ["RTGS", "RTGS"],
  ["CHEQUE", "Cheque"],
];
const COMPANY: MasterRow = { id: "COMPANY", name: "Company labour" };

type Mode = "NAMED" | "COUNT";


export function LabourWeek() {
  const profile = useProfile();
  const { current } = useProjects();
  const contractors = useMaster("masters_contractors");
  const [anchor, setAnchor] = useState(() => toBusinessDateIST(new Date()));
  const days = weekDates(anchor);
  const ws = days[0]!;
  const we = days[6]!;
  const today = toBusinessDateIST(new Date());

  const [labour, setLabour] = useState<MasterRow[]>([]);
  const [att, setAtt] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Entry[]>([]);
  const [week, setWeek] = useState<DocumentData | null>(null);
  const [balances, setBalances] = useState<Record<string, DocumentData>>({});
  const unlocks = useUnlocks(current?.id);
  const [chosen, setChosen] = useState<Record<string, Mode>>({});
  const [cell, setCell] = useState<{ l: MasterRow; date: string } | null>(null);
  const [countDay, setCountDay] = useState<{ g: MasterRow; date: string } | null>(null);
  const [adding, setAdding] = useState<MasterRow | null>(null);
  const [paying, setPaying] = useState<MasterRow | null>(null);
  const [editing, setEditing] = useState<MasterRow | null>(null);

  const pid = current?.id;
  useEffect(() => {
    if (!pid) return;
    return onSnapshot(collection(db, "projects", pid, "labour"), (s) =>
      setLabour(s.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string }) })).filter((l) => !(l as DocumentData).deleted).sort((a, b) => a.name.localeCompare(b.name))),
    );
  }, [pid]);
  useEffect(() => {
    if (!pid) return;
    const range = (col: string, set: (e: Entry[]) => void) =>
      onSnapshot(query(collection(db, "projects", pid, col), where("businessDate", ">=", ws), where("businessDate", "<=", we)), (s) =>
        set(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).filter((e) => !e.deleted)),
      );
    const a = range("labourAttendance", setAtt);
    const b = range("labourMuster", setCounts);
    const c = onSnapshot(doc(db, "projects", pid, "labourWeeks", ws), (s) => setWeek(s.data() ?? null));
    return () => {
      a();
      b();
      c();
    };
  }, [pid, ws, we]);
  useEffect(() => {
    if (!pid) return;
    return onSnapshot(collection(db, "projects", pid, "labourBalances"), (s) => setBalances(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
  }, [pid]);

  const markMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of att) m.set(`${e.labourId}_${e.businessDate}`, e);
    return m;
  }, [att]);
  const countMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of counts) m.set(`${e.contractorId}_${e.businessDate}`, e);
    return m;
  }, [counts]);

  if (!current) return <div className="card empty">Select a project first.</div>;
  const canEnter = can(profile, "entry.create");
  const isOpen = (d: string) => canEnter && canEditDate(d, new Date(), unlocks[d] ? { expiresAt: unlocks[d] } : null);
  const pending = [...att, ...counts].filter((e) => e.serverStatus === "PENDING").length;
  const groups = [COMPANY, ...contractors];

  const modeOf = (g: MasterRow): Mode | null => {
    if (g.id === "COMPANY") return "NAMED";
    if (att.some((e) => e.group === g.id)) return "NAMED";
    if (counts.some((e) => e.contractorId === g.id)) return "COUNT";
    return chosen[g.id] ?? null;
  };

  return (
    <>
      <section className="card" style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
        <div className="actions">
          <b>Labour attendance — week</b>
          <span className="pill neutral">
            {formatDate(ws)} – {formatDate(we)}
          </span>
          {!!pending && <span className="pill warn">⏳ Calculating {pending} {pending === 1 ? "entry" : "entries"} (up to 5 min)</span>}
        </div>
        <div className="actions">
          <button className="btn sm" onClick={() => setAnchor(addDays(ws, -7))} aria-label="Previous week">
            ‹ Previous week
          </button>
          <button className="btn sm" onClick={() => setAnchor(addDays(ws, 7))} disabled={addDays(ws, 7) > today} aria-label="Next week">
            Next week ›
          </button>
          {!days.includes(today) && (
            <button className="btn sm" onClick={() => setAnchor(today)}>
              This week
            </button>
          )}
          <span className="small muted">Entries can be changed only for the last 2 days (with a reason); older days are locked.</span>
        </div>
      </section>

      {groups.map((g) => {
        const mode = modeOf(g);
        const paidByUs = g.id === "COMPANY" || g.labourPaidBy === "US";
        // Site chhod chuka labour sirf un hafton mein jahan woh tha (purana hisab kabhi na chhupe)
        const people = labour.filter((l) => (l.group ?? "COMPANY") === g.id && labourVisibleInWeek(l as { active?: boolean; leftOn?: string | null }, ws, att.some((e) => e.labourId === l.id)));
        return (
          <section className="card" key={g.id}>
            <div className="card-head">
              <div>
                <h2>{g.name}</h2>
                <p className="small muted">
                  {g.id === "COMPANY" ? "Company's own labour — name-wise" : mode === "NAMED" ? "Name-wise this week" : mode === "COUNT" ? "Head-count only this week (Mistri / Kuli / Reja)" : "Choose how to record this week"}
                  {g.id !== "COMPANY" && ` · ${paidByUs ? "We pay the labour" : "Contractor pays the labour (record only)"}`}
                </p>
              </div>
              {mode === "NAMED" && canEnter && (
                <button className="btn sm" onClick={() => setAdding(g)}>
                  ＋ Add labour
                </button>
              )}
            </div>

            {mode === null && (
              <div className="form">
                <p>How do you want to record {g.name}'s labour this week?</p>
                <div className="actions">
                  <button className="btn primary" onClick={() => setChosen({ ...chosen, [g.id]: "NAMED" })}>
                    Name-wise (each person)
                  </button>
                  <button className="btn" onClick={() => setChosen({ ...chosen, [g.id]: "COUNT" })}>
                    Head-count only (Mistri / Kuli / Reja)
                  </button>
                </div>
              </div>
            )}

            {mode === "NAMED" && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      {days.map((d, i) => (
                        <th key={d} className="r" style={d === today ? { color: "var(--ink)" } : undefined}>
                          {DAY_NAMES[i]}
                          <span style={{ display: "block", fontWeight: 500 }}>{d.slice(8)}</span>
                        </th>
                      ))}
                      <th className="r">Days</th>
                      <th className="r">OT hrs</th>
                      <th className="r">Rate</th>
                      <th className="r">Amount</th>
                      {paidByUs && <th className="r">Balance</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((l) => {
                      const w = week?.labour?.[l.id];
                      const b = balances[l.id];
                      const rowPending = att.some((e) => e.labourId === l.id && e.serverStatus === "PENDING");
                      return (
                        <tr key={l.id}>
                          <td>
                            <button className="link-btn" onClick={() => canEnter && setEditing(l)} disabled={!canEnter} aria-label={`Edit ${l.name}`}>
                              <b>{l.name}</b> {canEnter && <span className="small muted">✎</span>}
                            </button>
                            <span className="small muted" style={{ display: "block" }}>
                              {TYPE_LABEL[l.type] ?? l.type}
                              {l.aadhaarLast4 ? ` · XXXX-${l.aadhaarLast4}` : ""}
                              {l.active === false && <span className="pill neutral" style={{ marginLeft: 6 }}>Left {l.leftOn ? formatDate(l.leftOn) : ""}</span>}
                            </span>
                          </td>
                          {days.map((d) => {
                            const e = markMap.get(`${l.id}_${d}`);
                            const open = isOpen(d) && d <= today;
                            return (
                              <td key={d} className="r" style={{ padding: 4 }}>
                                <button
                                  className="tab"
                                  disabled={!open}
                                  onClick={() => setCell({ l, date: d })}
                                  style={{ minWidth: 48, padding: "6px 8px", ...(e ? { background: `var(--${MARK_TONE[e.mark as StaffMark]})`, color: "#fff", borderColor: "transparent" } : {}) }}
                                  aria-label={`${l.name} ${formatDate(d)}`}
                                >
                                  {e ? e.mark : "·"}
                                  {e?.otHours ? <small style={{ display: "block", fontSize: 10 }}>+{e.otHours}h</small> : null}
                                </button>
                              </td>
                            );
                          })}
                          <td className="r">{w ? w.days : rowPending ? "⏳" : "—"}</td>
                          <td className="r">{w ? w.otHours : "—"}</td>
                          <td className="r">{l.ratePaise ? formatINR(l.ratePaise) : "—"}</td>
                          <td className="r">
                            <b>{w ? formatINR(w.amountPaise) : rowPending ? "⏳" : "—"}</b>
                          </td>
                          {paidByUs && (
                            <td className="r">
                              <b style={b && b.balancePaise < 0 ? { color: "var(--crit)" } : undefined}>{b ? formatINR(b.balancePaise) : "—"}</b>
                            </td>
                          )}
                          <td>
                            {paidByUs && (
                              <button className="btn sm" onClick={() => setPaying(l)}>
                                Pay / advance
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {people.length === 0 && <div className="empty">No labour added yet — tap "＋ Add labour".</div>}
                <p className="note">P = full day, HD = half day, A = absent. Amount = days × rate + OT hours × (rate ÷ 8). Totals and balances are calculated by the server.</p>
              </div>
            )}

            {mode === "COUNT" && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th />
                      {days.map((d, i) => (
                        <th key={d} className="r">
                          {DAY_NAMES[i]}
                          <span style={{ display: "block", fontWeight: 500 }}>{d.slice(8)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(["mistri", "kuli", "reja", "otHours"] as const).map((k) => (
                      <tr key={k}>
                        <td>
                          <b>{k === "otHours" ? "OT hours" : k[0]!.toUpperCase() + k.slice(1)}</b>
                        </td>
                        {days.map((d) => {
                          const e = countMap.get(`${g.id}_${d}`);
                          return (
                            <td key={d} className="r">
                              {e ? (e[k] ?? 0) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {days.map((d) => {
                        const e = countMap.get(`${g.id}_${d}`);
                        const open = isOpen(d) && d <= today;
                        return (
                          <td key={d} className="r" style={{ padding: 4 }}>
                            {open && (
                              <button className={`btn sm ${e ? "" : "primary"}`} onClick={() => setCountDay({ g, date: d })}>
                                {e ? "✎" : "＋"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                <p className="note">Head-count only — the contractor is paid by measured work (Sq M / Sq Ft).</p>
              </div>
            )}
          </section>
        );
      })}

      {cell && <CellDialog l={cell.l} date={cell.date} row={markMap.get(`${cell.l.id}_${cell.date}`) ?? null} onClose={() => setCell(null)} />}
      {countDay && <CountDialog g={countDay.g} date={countDay.date} row={countMap.get(`${countDay.g.id}_${countDay.date}`) ?? null} onClose={() => setCountDay(null)} />}
      {adding && <AddLabourDialog group={adding} onClose={() => setAdding(null)} />}
      {paying && <PayDialog l={paying} balance={balances[paying.id]} onClose={() => setPaying(null)} />}
      {editing && <EditLabourDialog l={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CellDialog({ l, date, row, onClose }: { l: MasterRow; date: string; row: Entry | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [mark, setMark] = useState<StaffMark>((row?.mark as StaffMark) ?? "P");
  const [ot, setOt] = useState(row?.otHours ? String(row.otHours) : "");
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const otN = ot.trim() === "" ? 0 : Number(ot);
  const otErr = !Number.isFinite(otN) || otN < 0 || otN > 16 ? "Overtime must be 0–16 hours" : mark === "A" && otN > 0 ? "No overtime on an Absent day" : null;
  const valid = !otErr && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(
        current.id,
        profile.email,
        [{ col: "labourAttendance", id: row?.id, current: row, action: row ? "UPDATE" : "CREATE", data: { businessDate: date, labourId: l.id, labourName: l.name, group: l.group ?? "COMPANY", type: l.type, mark, otHours: otN, ratePaise: row?.ratePaise ?? l.ratePaise ?? null } }],
        row ? reason.trim() : null,
      );
      toast("Saved ✓ · server is calculating ⏳");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  const remove = async (why: string) => {
    if (!current || !row) return;
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("labourAttendance", row, profile.email, why)], why);
      toast("Cleared — moved to Recycle Bin");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={`${l.name} — ${formatDate(date)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="checks">
          {(["P", "HD", "A"] as StaffMark[]).map((m) => (
            <button type="button" key={m} className="tab" aria-pressed={mark === m} onClick={() => setMark(m)} style={mark === m ? { background: `var(--${MARK_TONE[m]})`, color: "#fff", borderColor: "transparent", minWidth: 64 } : { minWidth: 64 }}>
              {m === "P" ? "P — Present" : m === "HD" ? "HD — Half day" : "A — Absent"}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="c-ot">Overtime (hours)</label>
          <input id="c-ot" className="input" inputMode="decimal" value={ot} onChange={(e) => setOt(e.target.value)} placeholder="0" disabled={mark === "A"} />
          {otErr ? <span className="err">{otErr}</span> : <span className="hint">OT pay = rate ÷ 8 × hours</span>}
        </div>
        {row && (
          <div className="field">
            <label htmlFor="c-why">Reason for change *</label>
            <input id="c-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {row && (
            <button type="button" className="btn danger" onClick={() => setRemoving(true)}>
              Clear
            </button>
          )}
          <button className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
      {removing && (
        <ReasonDialog
          title="Clear this day's attendance?"
          onCancel={() => setRemoving(false)}
          onConfirm={(why) => {
            setRemoving(false);
            void remove(why);
          }}
        />
      )}
    </Dialog>
  );
}

function CountDialog({ g, date, row, onClose }: { g: MasterRow; date: string; row: Entry | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [v, setV] = useState({
    mistri: row ? String(row.mistri) : "",
    kuli: row ? String(row.kuli) : "",
    reja: row ? String(row.reja) : "",
    otHours: row?.otHours ? String(row.otHours) : "",
    work: (row?.work as string) ?? "",
  });
  const [reason, setReason] = useState("");
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const bad = (["mistri", "kuli", "reja"] as const).filter((k) => !Number.isInteger(n(v[k])) || n(v[k]) < 0);
  const otBad = !Number.isFinite(n(v.otHours)) || n(v.otHours) < 0;
  const valid = !bad.length && !otBad && n(v.mistri) + n(v.kuli) + n(v.reja) > 0 && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      await writeEntries(
        current.id,
        profile.email,
        [{ col: "labourMuster", id: row?.id, current: row, action: row ? "UPDATE" : "CREATE", data: { businessDate: date, contractorId: g.id, contractorName: g.name, mistri: n(v.mistri), kuli: n(v.kuli), reja: n(v.reja), otHours: n(v.otHours), work: v.work.trim() || null } }],
        row ? reason.trim() : null,
      );
      toast("Saved ✓ · server is calculating ⏳");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={`${g.name} — ${formatDate(date)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {(["mistri", "kuli", "reja", "otHours"] as const).map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`cd-${k}`}>{k === "otHours" ? "OT hours" : k[0]!.toUpperCase() + k.slice(1)}</label>
              <input id={`cd-${k}`} className="input" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="0" style={{ fontSize: 22, fontWeight: 700, textAlign: "center" }} />
            </div>
          ))}
        </div>
        {bad.length > 0 && <span className="err">Mistri / Kuli / Reja must be whole numbers</span>}
        <div className="field">
          <label htmlFor="cd-work">Work</label>
          <input id="cd-work" className="input" value={v.work} onChange={(e) => setV({ ...v, work: e.target.value })} placeholder="e.g. shuttering, bar bending" />
        </div>
        {row && (
          <div className="field">
            <label htmlFor="cd-why">Reason for change *</label>
            <input id="cd-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
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

function AddLabourDialog({ group, onClose }: { group: MasterRow; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [v, setV] = useState({ name: "", type: "KULI" as LabourType, rate: "", aadhaar: "" });
  const rateN = Number(v.rate);
  const valid = v.name.trim().length >= 2 && v.rate !== "" && Number.isFinite(rateN) && rateN > 0 && (v.aadhaar === "" || /^\d{4}$/.test(v.aadhaar));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    try {
      // Project ki labour list + project audit — ek batch (rules: labourAudit)
      const batch = writeBatch(db);
      const ref = doc(collection(db, "projects", current.id, "labour"));
      const auditRef = doc(collection(db, "projects", current.id, "auditLog"));
      const data = { name: v.name.trim(), type: v.type, ratePaise: toPaise(rateN), aadhaarLast4: v.aadhaar || null, group: group.id };
      batch.set(ref, { ...data, projectId: current.id, rev: 1, lastAuditId: auditRef.id, createdBy: profile.email, createdAt: serverTimestamp(), updatedBy: profile.email, updatedAt: serverTimestamp(), deleted: null });
      batch.set(auditRef, { entity: `labour/${ref.id}`, action: "CREATE", rev: 1, by: profile.email, at: serverTimestamp(), reason: null, before: null, after: data, device: deviceLabel() });
      await batch.commit();
      toast(`${data.name} added ✓`);
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={`Add labour — ${group.name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="al-name">Name *</label>
            <input id="al-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
          </div>
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Type *</span>
            <div className="checks">
              {TYPES.map(([k, l]) => (
                <button type="button" key={k} className="tab" aria-pressed={v.type === k} onClick={() => setV({ ...v, type: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="al-rate">Daily rate (₹) *</label>
            <input id="al-rate" className="input" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="al-aad">Aadhaar — last 4 digits (optional)</label>
            <input id="al-aad" className="input" inputMode="numeric" value={v.aadhaar} onChange={(e) => setV({ ...v, aadhaar: e.target.value })} />
            {v.aadhaar !== "" && !/^\d{4}$/.test(v.aadhaar) && <span className="err">Exactly 4 digits</span>}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PaymentFields({ v, setV, accounts }: { v: PayState; setV: (p: PayState) => void; accounts: MasterRow[] }) {
  return (
    <>
      <div className="field">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Mode</span>
        <div className="checks">
          {PAY_MODES.map(([k, l]) => (
            <button type="button" key={k} className="tab" aria-pressed={v.mode === k} onClick={() => setV({ ...v, mode: k })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {v.mode !== "CASH" && (
        <div className="grid-form">
          <div className="field">
            <label htmlFor="p-acc">From company account *</label>
            <select id="p-acc" className="input" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.bankName} ••{String(a.accountNo ?? "").slice(-4)})
                </option>
              ))}
            </select>
            {accounts.length === 0 && <span className="hint">Admin adds company accounts under Masters → Company bank accounts</span>}
          </div>
          <div className="field">
            <label htmlFor="p-ref">{v.mode === "CHEQUE" ? "Cheque no. *" : "UTR / reference no. *"}</label>
            <input id="p-ref" className="input" value={v.refNo} onChange={(e) => setV({ ...v, refNo: e.target.value })} />
          </div>
        </div>
      )}
    </>
  );
}

export interface PayState {
  mode: string;
  accountId: string;
  refNo: string;
}
export const payStateValid = (v: PayState) => v.mode === "CASH" || (v.accountId !== "" && v.refNo.trim().length >= 3);
export function payData(v: PayState, accounts: MasterRow[]) {
  const a = accounts.find((x) => x.id === v.accountId);
  return v.mode === "CASH"
    ? { mode: "CASH", accountId: null, accountName: null, refNo: null }
    : { mode: v.mode, accountId: v.accountId, accountName: a ? `${a.name} ••${String(a.accountNo ?? "").slice(-4)}` : null, refNo: v.refNo.trim() };
}

function PayDialog({ l, balance, onClose }: { l: MasterRow; balance: DocumentData | undefined; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const accounts = useMaster("masters_companyAccounts");
  const unlocks = useUnlocks(current?.id);
  const today = toBusinessDateIST(new Date());
  const [rows, setRows] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [kind, setKind] = useState<"ADVANCE" | "PAYMENT">("PAYMENT");
  const [amt, setAmt] = useState("");
  const [remark, setRemark] = useState("");
  const [reason, setReason] = useState("");
  const [pay, setPay] = useState<PayState>({ mode: "CASH", accountId: "", refNo: "" });
  const [removing, setRemoving] = useState<Entry | null>(null);

  useEffect(() => {
    if (!current) return;
    return onSnapshot(query(collection(db, "projects", current.id, "labourPassbook"), where("labourId", "==", l.id)), (s) =>
      setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).sort((a, b) => b.businessDate.localeCompare(a.businessDate))),
    );
  }, [current, l.id]);

  // 2 din tak, ya Admin ne din khola ho to (Rohit ka niyam)
  const canChange = (d: string) => can(profile, "entry.edit") && canEditDate(d, new Date(), unlocks[d] ? { expiresAt: unlocks[d] } : null);
  const startEdit = (r: Entry) => {
    setEditing(r);
    setKind(r.kind as "ADVANCE" | "PAYMENT");
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
    setPay({ mode: "CASH", accountId: "", refNo: "" });
  };

  const a = Number(amt);
  const valid = amt !== "" && Number.isFinite(a) && a > 0 && payStateValid(pay) && (!editing || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const data = { businessDate: editing?.businessDate ?? today, labourId: l.id, labourName: l.name, group: l.group ?? "COMPANY", kind, amountPaise: toPaise(a), remark: remark.trim() || null, ...payData(pay, accounts) };
    try {
      await writeEntries(current.id, profile.email, [{ col: "labourPassbook", id: editing?.id, current: editing, action: editing ? "UPDATE" : "CREATE", data }], editing ? reason.trim() : null);
      toast(editing ? "Payment updated ✓" : `${kind === "ADVANCE" ? "Advance" : "Payment"} recorded ✓`);
      reset();
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  const remove = async (r: Entry, why: string) => {
    if (!current) return;
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("labourPassbook", r, profile.email, why)], why);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  const weeks = (balance?.weeks as DocumentData[] | undefined) ?? [];

  return (
    <Dialog title={`${l.name} — payments & statement`} onClose={onClose}>
      <div className="form">
        {balance ? (
          <div className="stats">
            <div className="card stat">
              <span className="lab">Earned</span>
              <span className="num" style={{ fontSize: 22 }}>{formatINR(balance.earnedPaise)}</span>
              <span className="foot">
                {balance.days} days · {balance.otHours} OT hrs
              </span>
            </div>
            <div className="card stat">
              <span className="lab">Paid</span>
              <span className="num" style={{ fontSize: 22 }}>{formatINR(balance.paidPaise)}</span>
              <span className="foot">Advances + payments</span>
            </div>
            <div className="card stat" style={{ gridColumn: "1 / -1" }}>
              <span className="lab">Balance</span>
              <span className="num" style={{ fontSize: 26, color: balance.balancePaise < 0 ? "var(--crit)" : undefined }}>{formatINR(balance.balancePaise)}</span>
              <span className="foot">{balance.balancePaise < 0 ? "Labour owes (advance exceeds earnings)" : "Payable to labour"}</span>
            </div>
          </div>
        ) : (
          <p className="small muted">No ledger yet — the server prepares it within 5 minutes of the first attendance or payment.</p>
        )}

        <h3>Week-by-week statement</h3>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th className="r">Days</th>
                <th className="r">OT hrs</th>
                <th className="r">Earned</th>
                <th className="r">Paid</th>
                <th className="r">Balance</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w) => (
                <tr key={w.weekStart}>
                  <td>
                    {formatDate(w.weekStart)} – {formatDate(addDays(w.weekStart, 6))}
                  </td>
                  <td className="r">{w.days}</td>
                  <td className="r">{w.otHours}</td>
                  <td className="r">{formatINR(w.earnedPaise)}</td>
                  <td className="r">{formatINR(w.paidPaise)}</td>
                  <td className="r">
                    <b style={w.balancePaise < 0 ? { color: "var(--crit)" } : undefined}>{formatINR(w.balancePaise)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {weeks.length === 0 && <div className="empty">No weeks yet</div>}
        </div>

        <form onSubmit={save} className="form" style={{ padding: 0 }}>
          <h3>{editing ? `Edit ${editing.kind === "ADVANCE" ? "advance" : "payment"} of ${formatDate(editing.businessDate)}` : `New entry for ${formatDate(today)}`}</h3>
          <div className="checks">
            <button type="button" className="tab" aria-pressed={kind === "PAYMENT"} onClick={() => setKind("PAYMENT")}>
              Weekly payment
            </button>
            <button type="button" className="tab" aria-pressed={kind === "ADVANCE"} onClick={() => setKind("ADVANCE")}>
              Advance
            </button>
          </div>
          <div className="grid-form">
            <div className="field">
              <label htmlFor="lp-amt">Amount (₹) *</label>
              <input id="lp-amt" className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
            </div>
            <div className="field">
              <label htmlFor="lp-rm">Remark</label>
              <input id="lp-rm" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
          </div>
          <PaymentFields v={pay} setV={setPay} accounts={accounts} />
          {editing && (
            <div className="field">
              <label htmlFor="lp-why">Reason for change *</label>
              <input id="lp-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount" />
            </div>
          )}
          <div className="actions">
            {editing && (
              <button type="button" className="btn" onClick={reset}>
                Cancel edit
              </button>
            )}
            <button className="btn primary" disabled={!valid}>
              {editing ? "Save changes" : `Record for ${formatDate(today)}`}
            </button>
          </div>
        </form>

        <h3>All payments</h3>
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
                  <td>{r.kind === "ADVANCE" ? "Advance" : "Payment"}</td>
                  <td className="r">{formatINR(r.amountPaise)}</td>
                  <td className="small">
                    {r.mode}
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
          <p className="note">Payments can be changed for 2 days (with a reason). After that 🔒 — the Admin reopens that day from Recycle Bin → "Reopen a locked day".</p>
        </div>
      </div>
      {removing && (
        <ReasonDialog
          title="Delete this payment?"
          onCancel={() => setRemoving(null)}
          onConfirm={(why) => {
            const r = removing;
            setRemoving(null);
            void remove(r, why);
          }}
        />
      )}
    </Dialog>
  );
}

function EditLabourDialog({ l, onClose }: { l: MasterRow; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [v, setV] = useState({
    name: l.name,
    type: (l.type as LabourType) ?? "KULI",
    rate: l.ratePaise ? String(l.ratePaise / 100) : "",
    aadhaar: (l.aadhaarLast4 as string) ?? "",
    active: l.active !== false,
    leftOn: (l.leftOn as string) ?? toBusinessDateIST(new Date()),
  });
  const [reason, setReason] = useState("");
  const rateN = Number(v.rate);
  const valid = v.name.trim().length >= 2 && Number.isFinite(rateN) && rateN > 0 && (v.aadhaar === "" || /^\d{4}$/.test(v.aadhaar)) && reason.trim().length >= 3;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const data = { name: v.name.trim(), type: v.type, ratePaise: toPaise(rateN), aadhaarLast4: v.aadhaar || null, active: v.active, leftOn: v.active ? null : v.leftOn };
    const before: DocumentData = {};
    const after: DocumentData = {};
    for (const [k, nv] of Object.entries(data)) {
      const ov = (l as DocumentData)[k] ?? (k === "active" ? true : null);
      if (JSON.stringify(ov) !== JSON.stringify(nv)) {
        before[k] = ov;
        after[k] = nv;
      }
    }
    try {
      const batch = writeBatch(db);
      const auditRef = doc(collection(db, "projects", current.id, "auditLog"));
      const rev = Number((l as DocumentData).rev ?? 1) + 1;
      batch.update(doc(db, "projects", current.id, "labour", l.id), { ...data, rev, lastAuditId: auditRef.id, updatedBy: profile.email, updatedAt: serverTimestamp() });
      batch.set(auditRef, { entity: `labour/${l.id}`, action: "UPDATE", rev, by: profile.email, at: serverTimestamp(), reason: reason.trim(), before, after, device: deviceLabel() });
      await batch.commit();
      toast(v.active ? "Labour updated ✓" : `${v.name} marked as left ✓ — history kept`);
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={`Edit labour — ${l.name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="el-name">Name *</label>
            <input id="el-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Type</span>
            <div className="checks">
              {TYPES.map(([k, lab]) => (
                <button type="button" key={k} className="tab" aria-pressed={v.type === k} onClick={() => setV({ ...v, type: k })}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="el-rate">Daily rate (₹) *</label>
            <input id="el-rate" className="input" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
            <span className="hint">A new rate applies to new attendance only — past days keep the rate they were saved with.</span>
          </div>
          <div className="field">
            <label htmlFor="el-aad">Aadhaar — last 4 digits</label>
            <input id="el-aad" className="input" inputMode="numeric" value={v.aadhaar} onChange={(e) => setV({ ...v, aadhaar: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Status</span>
          <div className="checks">
            <button type="button" className="tab" aria-pressed={v.active} onClick={() => setV({ ...v, active: true })}>
              Working on site
            </button>
            <button type="button" className="tab" aria-pressed={!v.active} onClick={() => setV({ ...v, active: false })}>
              Left site
            </button>
          </div>
        </div>
        {!v.active && (
          <div className="field">
            <label htmlFor="el-left">Left on</label>
            <input id="el-left" type="date" className="input" value={v.leftOn} onChange={(e) => setV({ ...v, leftOn: e.target.value })} />
            <span className="hint">Hidden from weeks after this date. All past attendance, payments and balance stay.</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="el-why">Reason for change *</label>
          <input id="el-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. rate increased, left site" />
        </div>
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
