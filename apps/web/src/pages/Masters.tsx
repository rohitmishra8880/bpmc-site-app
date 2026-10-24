import { collection, onSnapshot, serverTimestamp, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { checkGstin, formatINR, isIfsc, normalizeMobile, toPaise } from "@bpmc/core";
import { saveMaster } from "../lib/audit";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

type FieldType = "text" | "number" | "money" | "select" | "mobile" | "gstin" | "ifsc" | "date" | "last4";

interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: [string, string][];
  hint?: string;
  /** Table mein dikhana */
  show?: boolean;
}

const UNITS: [string, string][] = ["Ltr", "Kg", "MT", "Nos", "Mtr", "Bags", "cu.m", "Sq M", "Set"].map((u) => [u, u]);

const MASTERS: { col: string; label: string; one: string; fields: Field[] }[] = [
  {
    col: "masters_materials",
    label: "Maal (Material / Oil)",
    one: "Material",
    fields: [
      { key: "name", label: "Naam", type: "text", required: true, show: true },
      { key: "group", label: "Group", type: "select", required: true, show: true, options: [["MATERIAL", "Material"], ["FUEL", "Diesel / Fuel"], ["OIL", "Oil & Lubricants"]] },
      { key: "baseUnit", label: "Hisab ki unit", type: "select", required: true, show: true, options: UNITS, hint: "Balance isi unit mein banega" },
      { key: "conv.Bucket", label: "1 Bucket = kitna (base unit)", type: "number", hint: "jaise 20 (Ltr) — khaali chhodo agar nahi" },
      { key: "conv.Drum", label: "1 Drum = kitna (base unit)", type: "number", hint: "jaise 210 (Ltr)" },
      { key: "conv.Bags", label: "1 Bag = kitna (base unit)", type: "number", hint: "Cement Kg mein ho to 50" },
      { key: "minStock", label: "Kam stock ki limit", type: "number", show: true, hint: "Isse kam hone par alert" },
    ],
  },
  {
    col: "masters_machines",
    label: "Machine",
    one: "Machine",
    fields: [
      { key: "name", label: "Machine ka naam / no.", type: "text", required: true, show: true },
      { key: "kind", label: "Kiski", type: "select", required: true, show: true, options: [["COMPANY", "Company"], ["RENTAL", "Rental (kiraye)"]] },
      { key: "ownerParty", label: "Malik / party", type: "text", show: true },
      { key: "rateType", label: "Rate kis hisab se", type: "select", show: true, options: [["DAY", "Din ke hisab"], ["MONTH", "Mahine ke hisab"], ["HOUR", "Ghante ke hisab"]] },
      { key: "ratePaise", label: "Rate (₹)", type: "money", show: true },
      { key: "rateFrom", label: "Rate kab se lagu", type: "date" },
      { key: "siteFrom", label: "Site par kab aayi", type: "date", hint: "Mahine ke beech aayi to pehle ke din bill se minus" },
      { key: "siteTo", label: "Site se kab gayi", type: "date", hint: "Khaali = abhi site par hai" },
      { key: "dieselBy", label: "Diesel kiska", type: "select", options: [["SITE", "Site ka"], ["OWNER", "Owner ka"]] },
      { key: "driver", label: "Driver", type: "text" },
    ],
  },
  {
    col: "masters_contractors",
    label: "Thekedar",
    one: "Thekedar",
    fields: [
      { key: "name", label: "Naam", type: "text", required: true, show: true },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "work", label: "Kaam", type: "text", show: true, hint: "jaise: shuttering, bar bending" },
    ],
  },
  {
    col: "masters_parties",
    label: "Party / Vendor",
    one: "Party",
    fields: [
      { key: "name", label: "Firm ka naam", type: "text", required: true, show: true },
      { key: "contact", label: "Contact person", type: "text" },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "gstin", label: "GSTIN", type: "gstin", show: true },
      { key: "bankAccount", label: "Bank A/C", type: "text" },
      { key: "ifsc", label: "IFSC", type: "ifsc" },
      { key: "creditDays", label: "Udhaar kitne din", type: "number", show: true },
      { key: "supplies", label: "Kya deta hai", type: "text", hint: "jaise: Cement, Steel" },
    ],
  },
  {
    col: "masters_storeItems",
    label: "Saman (Store)",
    one: "Saman",
    fields: [
      { key: "name", label: "Saman ka naam", type: "text", required: true, show: true },
      { key: "category", label: "Category", type: "select", required: true, show: true, options: [["RETURNABLE", "Returnable (wapas aata hai)"], ["CONSUMABLE", "Consumable (khatam hota hai)"]] },
      { key: "unit", label: "Unit", type: "select", required: true, show: true, options: UNITS },
      { key: "tagPrefix", label: "Item no. prefix", type: "text", show: true, hint: "Bade saman ke liye, jaise RCM → RCM-01" },
      { key: "minStock", label: "Kam stock ki limit", type: "number" },
    ],
  },
  {
    col: "masters_staff",
    label: "Staff",
    one: "Staff",
    fields: [
      { key: "name", label: "Naam", type: "text", required: true, show: true },
      { key: "designation", label: "Pad", type: "text", show: true },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "aadhaarLast4", label: "Aadhaar ke aakhri 4 ank", type: "last4", hint: "Poora Aadhaar app mein nahi rakhte" },
      { key: "salaryPaise", label: "Tankhwah / mahina (₹)", type: "money", show: true },
      { key: "ifsc", label: "IFSC", type: "ifsc" },
    ],
  },
];

type Row = DocumentData & { id: string };

function getPath(o: DocumentData, key: string): unknown {
  return key.split(".").reduce<unknown>((v, k) => (v as DocumentData | undefined)?.[k === "conv" ? "conversions" : k], o);
}

function display(f: Field, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (f.type === "money") return formatINR(v as number);
  if (f.type === "select") return f.options?.find((o) => o[0] === v)?.[1] ?? String(v);
  return String(v);
}

export function Masters() {
  const profile = useProfile();
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const m = MASTERS[tab]!;
  const [rows, setRows] = useState<Row[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const editable = can(profile, "masters.edit");

  useEffect(() => {
    setRows([]);
    return onSnapshot(
      collection(db, m.col),
      (s) => setRows(s.docs.map((d): Row => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)))),
      (e) => toast(errorText(e), true),
    );
  }, [m.col, toast]);

  const visible = useMemo(() => rows.filter((r) => showDeleted || !r.deleted), [rows, showDeleted]);
  const cols = m.fields.filter((f) => f.show);

  const softDelete = async (r: Row, reason: string) => {
    try {
      await saveMaster(m.col, r.id, { deleted: { by: profile.email, reason, at: serverTimestamp() } }, profile.email, r, "DELETE", reason);
      toast(`"${r.name}" hata diya — Recycle Bin mein`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const restore = async (r: Row) => {
    try {
      await saveMaster(m.col, r.id, { deleted: null }, profile.email, r, "RESTORE", "Admin ne wapas laya");
      toast(`"${r.name}" wapas aa gaya`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };

  return (
    <>
      <PageHead title="Master list" sub="Ek baar yahan jodo — har entry mein dropdown mein aayega">
        {editable && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            ＋ Naya {m.one}
          </button>
        )}
      </PageHead>
      <div className="tabs" role="group" aria-label="Master">
        {MASTERS.map((x, i) => (
          <button key={x.col} className="tab" aria-pressed={i === tab} onClick={() => setTab(i)}>
            {x.label}
          </button>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>
            {m.label} <span className="muted small">({visible.filter((r) => !r.deleted).length})</span>
          </h2>
          <label className="check small">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Hataye hue bhi dikhao
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                {cols.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={r.deleted ? "deleted" : ""}>
                  {cols.map((f) => (
                    <td key={f.key}>{f.key === "name" ? <b>{display(f, getPath(r, f.key))}</b> : display(f, getPath(r, f.key))}</td>
                  ))}
                  <td>
                    <div className="actions">
                      {!r.deleted && editable && (
                        <>
                          <button className="btn sm" onClick={() => setEditing(r)}>
                            ✎ Badlo
                          </button>
                          <button className="btn sm danger" onClick={() => setRemoving(r)}>
                            🗑 Hatao
                          </button>
                        </>
                      )}
                      {r.deleted && (
                        <>
                          <span className="small muted" style={{ textDecoration: "none" }}>
                            Kyun: {String(r.deleted.reason)}
                          </span>
                          {can(profile, "recycle.restore") && (
                            <button className="btn sm" onClick={() => restore(r)}>
                              ↺ Wapas lao
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <div className="empty">Abhi koi {m.one} nahi. {editable ? `"＋ Naya ${m.one}" dabao.` : ""}</div>}
        </div>
      </section>
      {editing && <MasterForm m={m} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ReasonDialog
          title={`"${removing.name}" hatana hai?`}
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const r = removing;
            setRemoving(null);
            void softDelete(r, reason);
          }}
        />
      )}
    </>
  );
}

function MasterForm({ m, row, onClose }: { m: (typeof MASTERS)[number]; row: Row | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of m.fields) {
      const x = row ? getPath(row, f.key) : undefined;
      v[f.key] = x === undefined || x === null ? (f.type === "select" && f.required ? f.options![0]![0] : "") : f.type === "money" ? String((x as number) / 100) : String(x);
    }
    return v;
  });
  const [reason, setReason] = useState("");

  const check = (f: Field): { err?: string; warn?: string } => {
    const v = vals[f.key]?.trim() ?? "";
    if (!v) return f.required ? { err: "Zaroori hai" } : {};
    if ((f.type === "number" || f.type === "money") && (!Number.isFinite(Number(v)) || Number(v) < 0)) return { err: "Sahi number likho" };
    if (f.type === "mobile" && !normalizeMobile(v)) return { err: "10 ank ka mobile (6–9 se shuru)" };
    if (f.type === "ifsc" && !isIfsc(v)) return { err: "IFSC jaise SBIN0001842" };
    if (f.type === "last4" && !/^\d{4}$/.test(v)) return { err: "Sirf 4 ank" };
    if (f.type === "gstin") {
      const g = checkGstin(v);
      return g.ok ? (g.warning ? { warn: g.warning } : {}) : { err: g.error! };
    }
    return {};
  };
  const errors = m.fields.map(check);
  const valid = errors.every((e) => !e.err) && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const data: DocumentData = {};
    const conversions: Record<string, number> = {};
    for (const f of m.fields) {
      const v = vals[f.key]?.trim() ?? "";
      let out: unknown = v === "" ? null : v;
      if (v !== "" && f.type === "number") out = Number(v);
      if (v !== "" && f.type === "money") out = toPaise(Number(v));
      if (v !== "" && f.type === "mobile") out = normalizeMobile(v);
      if (v !== "" && (f.type === "gstin" || f.type === "ifsc")) out = v.toUpperCase();
      if (f.key.startsWith("conv.")) {
        if (out !== null) conversions[f.key.slice(5)] = out as number;
      } else data[f.key] = out;
    }
    if (m.col === "masters_materials") data.conversions = conversions;
    setBusy(true);
    try {
      await saveMaster(m.col, row?.id ?? null, data, profile.email, row, row ? "UPDATE" : "CREATE", row ? reason.trim() : null);
      toast(row ? "Badal diya ✓" : `${m.one} jud gaya ✓`);
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={row ? `${m.one} badlo` : `Naya ${m.one}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          {m.fields.map((f, i) => {
            const id = `f-${f.key}`;
            const e = errors[i]!;
            return (
              <div className="field" key={f.key}>
                <label htmlFor={id}>
                  {f.label}
                  {f.required && " *"}
                </label>
                {f.type === "select" ? (
                  <select id={id} className="input" value={vals[f.key]} onChange={(ev) => setVals({ ...vals, [f.key]: ev.target.value })}>
                    {!f.required && <option value="">—</option>}
                    {f.options!.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input"
                    type={f.type === "date" ? "date" : "text"}
                    inputMode={f.type === "number" || f.type === "money" || f.type === "mobile" || f.type === "last4" ? "decimal" : undefined}
                    value={vals[f.key]}
                    onChange={(ev) => setVals({ ...vals, [f.key]: ev.target.value })}
                  />
                )}
                {e.err && vals[f.key] ? <span className="err">{e.err}</span> : e.warn ? <span className="warn">{e.warn}</span> : f.hint ? <span className="hint">{f.hint}</span> : null}
              </div>
            );
          })}
        </div>
        {row && (
          <div className="field">
            <label htmlFor="edit-reason">Badalne ka kaaran *</label>
            <input id="edit-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="jaise: rate badla, naam galat tha" />
            <span className="hint">Edit History mein purani aur nayi value ke saath rahega.</span>
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Radd
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {busy ? "Save ho raha…" : "Save karo"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
