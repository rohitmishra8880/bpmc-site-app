// Daily Work: Concrete / Excavation (M³), Shuttering (Sq M), Steel (Kg). Naap phone par core ke formule se, total + thekedar ka bill server se.
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  canEditDate, formatDate, formatINR, formatQtyShort, toBusinessDateIST, toPaise, workAmount, workQuantity,
  type WorkTotals, type WorkType,
} from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { PhotoDialog, refKey, useDayPhotos } from "../components/Photos";
import { can, useProfile } from "../lib/auth";
import { softDeleteWrite, useDay, useDayEntries, useUnlock, writeEntries, type Entry } from "../lib/entries";
import { db } from "../lib/firebase";
import { useMaster } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

const TYPES: { k: WorkType; ic: string; label: string; unit: string; hint: string }[] = [
  { k: "CONCRETE", ic: "🧱", label: "Concrete", unit: "M³", hint: "L × W × H" },
  { k: "EXCAVATION", ic: "⛏️", label: "Excavation", unit: "M³", hint: "L × W × depth" },
  { k: "SHUTTERING", ic: "🪵", label: "Shuttering", unit: "Sq M", hint: "L × height" },
  { k: "STEEL", ic: "🔩", label: "Steel", unit: "Kg", hint: "D² ÷ 162 × length" },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.k, t.label])) as Record<WorkType, string>;
const COMPANY = "COMPANY";

export function Work() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const contractors = useMaster("masters_contractors");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const [form, setForm] = useState<{ type: WorkType; row: Entry | null } | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [photoFor, setPhotoFor] = useState<{ refCol: string; refId: string; title: string; label: string } | null>(null);
  const photos = useDayPhotos(current?.id, date);
  const { rows } = useDayEntries(current?.id, "workEntries", date);
  const day = useDay(current?.id, date);
  const unlock = useUnlock(current?.id, date);

  const live = useMemo(() => (rows ?? []).filter((r) => !r.deleted), [rows]);
  const pending = live.filter((r) => r.serverStatus === "PENDING").length;
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const totals = day?.work as WorkTotals | undefined;
  const cName = (id: string) => (id === COMPANY ? "Company (own work)" : (contractors.find((c) => c.id === id)?.name ?? id));

  if (!current) return <div className="card empty">Select a project first.</div>;

  const remove = async (e: Entry, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("workEntries", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <>
      <DateBar title="Daily Work" sub={`${current.name} — measurement of work done (M³, Sq M, Kg)`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      <PageHead title={formatDate(date)} sub="One entry per measurement. Contractor bill is added to the contractor's khata automatically.">
        <Link className="btn" to="/reports?r=work">⬇ PDF</Link>
        <button className="btn" onClick={() => setPhotoFor({ refCol: "site", refId: date, title: `Site photos — ${formatDate(date)}`, label: "Site" })}>
          📷 Site photos{photos.filter((p) => p.refKey === refKey("site", date)).length ? ` (${photos.filter((p) => p.refKey === refKey("site", date)).length})` : ""}
        </button>
        {open && TYPES.map((t) => (
          <button key={t.k} className={`btn ${t.k === "CONCRETE" ? "primary" : ""}`} onClick={() => setForm({ type: t.k, row: null })}>
            ＋ {t.label}
          </button>
        ))}
      </PageHead>

      <div className="stats">
        {TYPES.map((t) => {
          const x = totals?.byType?.[t.k];
          return (
            <div className="card stat" key={t.k}>
              <span className="lab">{t.ic} {t.label}</span>
              <span className="num">
                {x ? formatQtyShort(x.qty) : "—"}
                {x && <small>{t.unit}</small>}
              </span>
              <span className="foot">{x ? `${x.entries} ${x.entries === 1 ? "entry" : "entries"}` : t.hint}</span>
            </div>
          );
        })}
      </div>
      {!totals && live.length > 0 && <p className="small muted">Totals appear after the server calculates (within 5 minutes).</p>}

      {totals && Object.keys(totals.byContractor).length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>By contractor</h2>
            <span className="small muted">Billable today: <b>{formatINR(totals.billablePaise)}</b></span>
          </div>
          {Object.entries(totals.byContractor).map(([cid, c]) => (
            <div key={cid} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <div>
                <b>{cName(cid)}</b>
                <div className="small muted">
                  {Object.entries(c.byType).map(([k, v]) => `${TYPE_LABEL[k as WorkType]} ${formatQtyShort(v!.qty)} ${v!.unit}`).join(" · ")}
                </div>
              </div>
              <b>{cid === COMPANY ? "—" : formatINR(c.amountPaise)}</b>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Entries</h2>
        </div>
        {rows !== null && live.length === 0 && <div className="empty">No work entered on this day</div>}
        {live.map((r) => {
          const amount = workAmount(Number(r.qty) || 0, r.ratePaise);
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {TYPE_LABEL[r.type as WorkType] ?? r.type} · {cName(r.contractorId)}
                  {r.serverStatus === "PENDING" && <span className="pill warn" style={{ marginLeft: 6 }}>⏳</span>}
                </div>
                <div className="small muted">
                  {[r.zone, r.workLabel, measureText(r), r.ratePaise ? `${formatINR(r.ratePaise)}/${r.unit}` : null, r.remark].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
                <b style={{ whiteSpace: "nowrap" }}>{formatQtyShort(Number(r.qty))} {r.unit}</b>
                {r.contractorId !== COMPANY && amount > 0 && <span className="small">{formatINR(amount)}</span>}
                <span className="actions">
                  <button
                    className="btn sm"
                    onClick={() => setPhotoFor({ refCol: "workEntries", refId: r.id, title: `Photos — ${TYPE_LABEL[r.type as WorkType]} · ${cName(r.contractorId)}`, label: `${TYPE_LABEL[r.type as WorkType]} ${r.workLabel ?? r.zone ?? ""}` })}
                    aria-label="Photos"
                  >
                    📷 {photos.filter((p) => p.refKey === refKey("workEntries", r.id)).length || ""}
                  </button>
                </span>
                {open && (
                  <span className="actions">
                    <button className="btn sm" onClick={() => setForm({ type: r.type, row: r })} aria-label="Edit">✎</button>
                    <button className="btn sm danger" onClick={() => setRemoving(r)} aria-label="Delete">🗑</button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {photoFor && <PhotoDialog pid={current.id} date={date} photos={photos} onClose={() => setPhotoFor(null)} {...photoFor} />}
      {form && <WorkForm type={form.type} row={form.row} date={date} contractors={contractors} onClose={() => setForm(null)} />}
      {removing && (
        <ReasonDialog
          title="Delete this work entry?"
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const e = removing;
            setRemoving(null);
            void remove(e, reason);
          }}
        />
      )}
    </>
  );
}

/** "10 × 5 × 2.41" / "16 mm × 12 m × 10" — entry ka naap, jaisa daala gaya */
export function measureText(r: Record<string, unknown>): string {
  const n = Number(r.nos) > 1 ? ` × ${r.nos} nos` : "";
  if (r.type === "STEEL") return `${r.diaMm} mm × ${r.lengthM} m${n}`;
  if (r.type === "SHUTTERING") return `${r.l} × ${r.w}${n}`;
  return `${r.l} × ${r.w} × ${r.h}${n}`;
}

function WorkForm({ type, row, date, contractors, onClose }: { type: WorkType; row: Entry | null; date: string; contractors: { id: string; name: string }[]; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const meta = TYPES.find((t) => t.k === type)!;
  const [v, setV] = useState({
    contractorId: (row?.contractorId as string) ?? "",
    zone: (row?.zone as string) ?? "",
    label: (row?.workLabel as string) ?? "",
    l: row?.l != null ? String(row.l) : "",
    w: row?.w != null ? String(row.w) : "",
    h: row?.h != null ? String(row.h) : "",
    dia: row?.diaMm != null ? String(row.diaMm) : "",
    len: row?.lengthM != null ? String(row.lengthM) : "",
    nos: row?.nos != null ? String(row.nos) : "1",
    rate: row?.ratePaise != null ? String(row.ratePaise / 100) : "",
    remark: (row?.remark as string) ?? "",
  });
  const [rateTouched, setRateTouched] = useState(row != null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  // Is thekedar ka isi kaam ka pichla rate bhar do (badal sakte hain)
  useEffect(() => {
    if (rateTouched || !current || !v.contractorId || v.contractorId === COMPANY) return;
    let stop = false;
    void getDocs(query(collection(db, "projects", current.id, "workEntries"), where("contractorId", "==", v.contractorId))).then((s) => {
      const last = s.docs.map((d) => d.data()).filter((d) => d.type === type && !d.deleted && d.ratePaise).sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate)))[0];
      if (!stop && last) setV((x) => (x.rate ? x : { ...x, rate: String(last.ratePaise / 100) }));
    });
    return () => {
      stop = true;
    };
  }, [rateTouched, current, v.contractorId, type]);

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  let qty: { qty: number; unit: string } | null = null;
  let err: string | null = null;
  try {
    qty = workQuantity({ type, l: num(v.l), w: num(v.w), h: num(v.h), diaMm: num(v.dia), lengthM: num(v.len), nos: num(v.nos) });
  } catch (e) {
    err = (e as Error).message;
  }
  const started = type === "STEEL" ? v.dia || v.len : v.l || v.w || v.h;
  const rateN = v.rate === "" ? 0 : Number(v.rate);
  const amount = qty ? workAmount(qty.qty, toPaise(rateN || 0)) : 0;
  const valid = !!qty && !!v.contractorId && Number.isFinite(rateN) && rateN >= 0 && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !qty || !current) return;
    const data = {
      businessDate: row?.businessDate ?? date, type, contractorId: v.contractorId,
      contractorName: v.contractorId === COMPANY ? "Company (own work)" : (contractors.find((c) => c.id === v.contractorId)?.name ?? null),
      zone: v.zone.trim() || null, workLabel: v.label.trim() || null,
      l: type === "STEEL" ? null : num(v.l) ?? null, w: type === "STEEL" ? null : num(v.w) ?? null, h: type === "CONCRETE" || type === "EXCAVATION" ? num(v.h) ?? null : null,
      diaMm: type === "STEEL" ? num(v.dia) ?? null : null, lengthM: type === "STEEL" ? num(v.len) ?? null : null, nos: num(v.nos) ?? 1,
      qty: qty.qty, unit: qty.unit, ratePaise: rateN ? toPaise(rateN) : null, remark: v.remark.trim() || null,
    };
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "workEntries", id: row?.id, data, current: row, action: row ? "UPDATE" : "CREATE" }], row ? reason.trim() : null);
      toast(navigator.onLine ? "Saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (er) {
      toast(errorText(er), true);
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, k: keyof typeof v, ph?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" inputMode="decimal" value={v[k]} onChange={set(k)} placeholder={ph} />
    </div>
  );

  return (
    <Dialog title={`${meta.ic} ${meta.label}${row ? " (edit)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="w-con">Contractor *</label>
            <select id="w-con" className="input" value={v.contractorId} onChange={(e) => { setRateTouched(false); setV({ ...v, contractorId: e.target.value, rate: row ? v.rate : "" }); }} autoFocus>
              <option value="">— select —</option>
              <option value={COMPANY}>Company (own work — no bill)</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="w-zone">Where (zone / sector)</label>
            <input id="w-zone" className="input" value={v.zone} onChange={set("zone")} list="w-zones" />
            <datalist id="w-zones">
              {(current?.zones ?? []).map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="w-label">Part of work</label>
            <input id="w-label" className="input" value={v.label} onChange={set("label")} placeholder="e.g. Footing F1, column C3, slab" />
          </div>
          {type === "STEEL" ? (
            <>
              {field("w-dia", "Bar diameter (mm) *", "dia", "e.g. 16")}
              {field("w-len", "Length of one bar (m) *", "len", "e.g. 12")}
            </>
          ) : (
            <>
              {field("w-l", "Length (m) *", "l")}
              {field("w-w", type === "SHUTTERING" ? "Height (m) *" : "Width (m) *", "w")}
              {(type === "CONCRETE" || type === "EXCAVATION") && field("w-h", type === "EXCAVATION" ? "Depth (m) *" : "Height / thickness (m) *", "h")}
            </>
          )}
          {field("w-nos", type === "STEEL" ? "No. of bars" : "Nos (same size)", "nos")}
        </div>
        <div className="card pad" style={{ background: "var(--surface-2)" }}>
          {qty ? (
            <>
              <div className="small muted">{meta.hint}{Number(v.nos) > 1 ? " × nos" : ""}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{formatQtyShort(qty.qty)} <small style={{ fontSize: 15 }}>{qty.unit}</small></div>
            </>
          ) : (
            <span className={started ? "err small" : "small muted"}>{started ? err : `Enter the measurement (${meta.hint})`}</span>
          )}
        </div>
        {v.contractorId !== COMPANY && (
          <div className="grid-form">
            <div className="field">
              <label htmlFor="w-rate">Contractor rate ₹ / {meta.unit}</label>
              <input id="w-rate" className="input" inputMode="decimal" value={v.rate} onChange={(e) => { setRateTouched(true); setV({ ...v, rate: e.target.value }); }} placeholder="0 = no bill" />
              <span className="hint">Saved with this entry, so a later rate change never alters old bills</span>
            </div>
            <div className="field">
              <span style={{ fontWeight: 600, fontSize: 14 }}>Bill amount</span>
              <div style={{ fontSize: 22, fontWeight: 800, paddingTop: 6 }}>{formatINR(amount)}</div>
              <span className="hint">Added to the contractor's khata (Creditors)</span>
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="w-rm">Remark</label>
          <input id="w-rm" className="input" value={v.remark} onChange={set("remark")} />
        </div>
        {row && (
          <div className="field">
            <label htmlFor="w-why">Reason for change *</label>
            <input id="w-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong length" />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}
