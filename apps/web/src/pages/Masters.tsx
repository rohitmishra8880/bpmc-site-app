import { collection, onSnapshot, serverTimestamp, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { checkGstin, formatINR, isIfsc, normalizeBankAccount, normalizeMobile, toPaise } from "@bpmc/core";
import { saveMaster } from "../lib/audit";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

type FieldType = "text" | "number" | "money" | "select" | "mobile" | "gstin" | "ifsc" | "date" | "last4" | "account";

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

const MASTERS: { col: string; label: string; one: string; fields: Field[]; adminOnly?: boolean }[] = [
  {
    col: "masters_materials",
    label: "Material (incl. Oil)",
    one: "material",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, show: true },
      { key: "group", label: "Group", type: "select", required: true, show: true, options: [["MATERIAL", "Material"], ["FUEL", "Diesel / Fuel"], ["OIL", "Oil & Lubricants"]] },
      { key: "baseUnit", label: "Stock unit", type: "select", required: true, show: true, options: UNITS, hint: "Balances are kept in this unit" },
      { key: "conv.Bucket", label: "1 Bucket = (in stock unit)", type: "number", hint: "e.g. 20 (Ltr) — leave blank if not used" },
      { key: "conv.Drum", label: "1 Drum = (in stock unit)", type: "number", hint: "e.g. 210 (Ltr)" },
      { key: "conv.Bags", label: "1 Bag = (in stock unit)", type: "number", hint: "50 if cement is tracked in Kg" },
      { key: "minStock", label: "Low-stock limit", type: "number", show: true, hint: "Alert when balance falls below this" },
    ],
  },
  {
    col: "masters_machines",
    label: "Machines",
    one: "machine",
    fields: [
      { key: "name", label: "Machine name / no.", type: "text", required: true, show: true },
      { key: "kind", label: "Ownership", type: "select", required: true, show: true, options: [["COMPANY", "Company-owned"], ["RENTAL", "Rental"]] },
      { key: "ownerParty", label: "Owner / party", type: "text", show: true },
      { key: "rateType", label: "Rate basis", type: "select", show: true, options: [["DAY", "Per day"], ["MONTH", "Per month"], ["HOUR", "Per hour"]] },
      { key: "ratePaise", label: "Rate (₹)", type: "money", show: true },
      { key: "rateFrom", label: "Rate effective from", type: "date" },
      { key: "siteFrom", label: "Arrived at site on", type: "date", hint: "If it arrived mid-month, earlier days are deducted from the bill" },
      { key: "siteTo", label: "Left site on", type: "date", hint: "Blank = still on site" },
      { key: "dieselBy", label: "Diesel paid by", type: "select", options: [["SITE", "Site"], ["OWNER", "Owner"]] },
      { key: "driver", label: "Driver", type: "text" },
    ],
  },
  {
    col: "masters_contractors",
    label: "Contractors",
    one: "contractor",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, show: true },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "work", label: "Work type", type: "text", show: true, hint: "e.g. shuttering, bar bending" },
      { key: "labourPaidBy", label: "Who pays this contractor's labour", type: "select", required: true, show: true, options: [["CONTRACTOR", "Contractor pays (we only record)"], ["US", "We pay the labour"]] },
      { key: "accountName", label: "Account holder name", type: "text" },
      { key: "bankName", label: "Bank name", type: "text", hint: "e.g. State Bank of India" },
      { key: "accountNo", label: "Account no.", type: "account", show: true },
      { key: "ifsc", label: "IFSC", type: "ifsc" },
    ],
  },
  {
    col: "masters_parties",
    label: "Parties / Vendors",
    one: "party",
    fields: [
      { key: "name", label: "Firm name", type: "text", required: true, show: true },
      { key: "contact", label: "Contact person", type: "text" },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "gstin", label: "GSTIN", type: "gstin", show: true },
      { key: "bankAccount", label: "Bank A/C", type: "text" },
      { key: "ifsc", label: "IFSC", type: "ifsc" },
      { key: "creditDays", label: "Credit period (days)", type: "number", show: true },
      { key: "supplies", label: "Supplies", type: "text", hint: "e.g. Cement, Steel" },
    ],
  },
  {
    col: "masters_storeItems",
    label: "Store items",
    one: "store item",
    fields: [
      { key: "name", label: "Item name", type: "text", required: true, show: true },
      { key: "category", label: "Category", type: "select", required: true, show: true, options: [["RETURNABLE", "Returnable (comes back)"], ["CONSUMABLE", "Consumable (used up)"]] },
      { key: "unit", label: "Unit", type: "select", required: true, show: true, options: UNITS },
      { key: "tagPrefix", label: "Asset no. prefix", type: "text", show: true, hint: "For large items, e.g. RCM → RCM-01" },
      { key: "minStock", label: "Low-stock limit", type: "number" },
    ],
  },
  {
    col: "masters_staff",
    label: "Staff",
    one: "staff member",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, show: true },
      { key: "designation", label: "Designation", type: "text", show: true },
      { key: "mobile", label: "Mobile", type: "mobile", show: true },
      { key: "aadhaarLast4", label: "Aadhaar — last 4 digits", type: "last4", hint: "The full Aadhaar number is never stored" },
      { key: "salaryPaise", label: "Monthly salary (₹)", type: "money", show: true },
      { key: "accountName", label: "Account holder name", type: "text" },
      { key: "bankName", label: "Bank name", type: "text", hint: "e.g. State Bank of India" },
      { key: "accountNo", label: "Account no.", type: "account", show: true },
      { key: "ifsc", label: "IFSC", type: "ifsc" },
    ],
  },
  {
    col: "masters_companyAccounts",
    label: "Company bank accounts",
    one: "company account",
    adminOnly: true,
    fields: [
      { key: "name", label: "Account label", type: "text", required: true, show: true, hint: "e.g. SBI Current — Keshkal" },
      { key: "bankName", label: "Bank name", type: "text", required: true, show: true },
      { key: "accountNo", label: "Account no.", type: "account", required: true, show: true },
      { key: "ifsc", label: "IFSC", type: "ifsc", show: true },
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
  const editable = m.adminOnly ? profile.isAdmin : can(profile, "masters.edit");

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
      toast(`"${r.name}" deleted — moved to Recycle Bin`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const restore = async (r: Row) => {
    try {
      await saveMaster(m.col, r.id, { deleted: null }, profile.email, r, "RESTORE", "Restored by Admin");
      toast(`"${r.name}" restored`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };

  return (
    <>
      <PageHead title="Masters" sub="Add once here — they appear in every entry dropdown">
        {editable && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            ＋ New {m.one}
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
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted
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
                            ✎ Edit
                          </button>
                          <button className="btn sm danger" onClick={() => setRemoving(r)}>
                            🗑 Delete
                          </button>
                        </>
                      )}
                      {r.deleted && (
                        <>
                          <span className="small muted" style={{ textDecoration: "none" }}>
                            Reason: {String(r.deleted.reason)}
                          </span>
                          {can(profile, "recycle.restore") && (
                            <button className="btn sm" onClick={() => restore(r)}>
                              ↺ Restore
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
          {visible.length === 0 && <div className="empty">No {m.one} yet. {editable ? `Tap "＋ New ${m.one}".` : ""}</div>}
        </div>
      </section>
      {editing && <MasterForm m={m} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ReasonDialog
          title={`Delete "${removing.name}"?`}
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
    if (!v) return f.required ? { err: "Required" } : {};
    if ((f.type === "number" || f.type === "money") && (!Number.isFinite(Number(v)) || Number(v) < 0)) return { err: "Enter a valid number" };
    if (f.type === "mobile" && !normalizeMobile(v)) return { err: "10-digit mobile starting with 6–9" };
    if (f.type === "ifsc" && !isIfsc(v)) return { err: "IFSC like SBIN0001842" };
    if (f.type === "account" && !normalizeBankAccount(v)) return { err: "Account no. must be 9–18 digits" };
    if (f.type === "last4" && !/^\d{4}$/.test(v)) return { err: "Exactly 4 digits" };
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
      if (v !== "" && f.type === "account") out = normalizeBankAccount(v);
      if (v !== "" && (f.type === "gstin" || f.type === "ifsc")) out = v.toUpperCase();
      if (f.key.startsWith("conv.")) {
        if (out !== null) conversions[f.key.slice(5)] = out as number;
      } else data[f.key] = out;
    }
    if (m.col === "masters_materials") data.conversions = conversions;
    setBusy(true);
    try {
      await saveMaster(m.col, row?.id ?? null, data, profile.email, row, row ? "UPDATE" : "CREATE", row ? reason.trim() : null);
      toast(row ? "Updated ✓" : `New ${m.one} added ✓`);
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={row ? `Edit ${m.one}` : `New ${m.one}`} onClose={onClose}>
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
                    inputMode={f.type === "number" || f.type === "money" || f.type === "mobile" || f.type === "last4" || f.type === "account" ? "decimal" : undefined}
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
            <label htmlFor="edit-reason">Reason for change *</label>
            <input id="edit-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. rate changed, name was wrong" />
            <span className="hint">Saved in Edit History with the old and new values.</span>
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
