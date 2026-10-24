import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { canEditDate, formatINR, formatQty, toBaseQty, toBusinessDateIST, toPaise, type DayItemBalance, type Unit } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { softDeleteWrite, useDay, useDayEntries, useUnlock, writeEntries, type Entry } from "../lib/entries";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";

const GROUP_LABEL: Record<string, string> = { FUEL: "Diesel / Fuel", MATERIAL: "Material", OIL: "Oil & Lubricants" };
const PAY: [string, string][] = [["NAKAD", "Cash"], ["UDHAAR", "Credit"], ["UPI", "UPI"], ["CHEQUE", "Cheque"]];
const PAY_LABEL = Object.fromEntries(PAY) as Record<string, string>;

export function Inventory() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const materials = useMaster("masters_materials");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const [itemId, setItemId] = useState("diesel");
  const [form, setForm] = useState<{ kind: "IN" | "USE"; row: Entry | null } | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const day = useDay(current?.id, date);
  const { rows } = useDayEntries(current?.id, "stockMoves", date);
  const unlock = useUnlock(current?.id, date);

  const item = materials.find((m) => m.id === itemId) ?? materials[0];
  const live = useMemo(() => (rows ?? []).filter((r) => !r.deleted), [rows]);
  const mine = live.filter((r) => r.itemId === item?.id);
  const inward = mine.filter((r) => r.type === "IN" || r.type === "TRANSFER_IN");
  const uses = mine.filter((r) => r.type === "USE" || r.type === "TRANSFER_OUT");
  const pending = live.filter((r) => r.serverStatus === "PENDING").length;
  const bal: DayItemBalance | undefined = item ? day?.stock?.[item.id] : undefined;
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");

  if (!current) return <div className="card empty">Select a project first.</div>;
  if (!item) return <div className="card empty">No materials yet. Add them under Masters → Material.</div>;
  const u = item.baseUnit as string;

  const remove = async (e: Entry, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("stockMoves", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  const groups = ["FUEL", "MATERIAL", "OIL"];
  const isLow = bal && item.minStock != null && bal.closing < Number(item.minStock);

  return (
    <>
      <DateBar title="Inventory & Material Stock" sub={`${current.name} — received, used and balance`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      <div className="tabs" role="group" aria-label="Material">
        {groups.flatMap((g) =>
          materials
            .filter((m) => (m.group ?? "MATERIAL") === g)
            .map((m) => (
              <button key={m.id} className="tab" aria-pressed={m.id === item.id} onClick={() => setItemId(m.id)} title={GROUP_LABEL[g]}>
                {g === "OIL" ? "🛢️ " : g === "FUEL" ? "⛽ " : ""}
                {m.name}
              </button>
            )),
        )}
        {can(profile, "masters.edit") && (
          <Link className="tab" to="/masters" style={{ textDecoration: "none", color: "inherit" }}>
            ＋ Add material
          </Link>
        )}
      </div>
      <PageHead title={`${item.name}`} sub={`${GROUP_LABEL[item.group as string] ?? "Material"} · tracked in ${u}`}>
        {open && (
          <>
            <button className="btn dark" onClick={() => setForm({ kind: "IN", row: null })}>
              ＋ Received (Inward)
            </button>
            <button className="btn primary" onClick={() => setForm({ kind: "USE", row: null })}>
              ＋ Used / Issued
            </button>
          </>
        )}
      </PageHead>
      <div className="stats">
        <Stat label="Opening stock" v={bal?.opening} u={u} foot="Yesterday's closing = today's opening" />
        <Stat label="Received" v={bal?.inward} u={u} foot={`${inward.length} ${inward.length === 1 ? "entry" : "entries"}`} />
        <Stat label="Used" v={bal?.uses} u={u} foot={`${uses.length} ${uses.length === 1 ? "entry" : "entries"}`} />
        <Stat label="Balance" v={bal?.closing} u={u} foot={isLow ? `Below limit of ${item.minStock}!` : "Calculated by server"} tone={isLow ? "crit" : "ok"} />
      </div>
      {!bal && <p className="small muted">No calculation for this day yet — the server calculates within 5 minutes of an entry.</p>}
      {bal && bal.adjust !== 0 && <p className="small muted">Adjustment (count correction): {formatQty(bal.adjust, 3)} {u}</p>}

      <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <MoveList title="Received (new stock)" rows={inward} unit={u} empty={`No ${item.name} received on this day`} open={open} onEdit={(r) => setForm({ kind: "IN", row: r })} onDelete={setRemoving} />
        <MoveList title="Used / issued" rows={uses} unit={u} empty="Nothing used on this day" open={open} onEdit={(r) => setForm({ kind: "USE", row: r })} onDelete={setRemoving} />
      </div>
      {bal && (
        <section className="card" style={{ padding: 16 }}>
          <b>Stock calculation</b>
          <p style={{ marginTop: 6 }}>
            {formatQty(bal.opening, 3)} + {formatQty(bal.inward, 3)} − {formatQty(bal.uses, 3)}
            {bal.adjust ? ` ${bal.adjust > 0 ? "+" : "−"} ${formatQty(Math.abs(bal.adjust), 3)}` : ""} = <b>{formatQty(bal.closing, 3)} {u}</b>
          </p>
          <p className="small muted">Calculated by the server — never typed by hand. Editing a past day updates all later days automatically.</p>
        </section>
      )}

      {form && <StockForm kind={form.kind} item={item} row={form.row} date={date} onClose={() => setForm(null)} />}
      {removing && (
        <ReasonDialog
          title="Delete this entry?"
          onCancel={() => setRemoving(null)}
          onConfirm={(r) => {
            const e = removing;
            setRemoving(null);
            void remove(e, r);
          }}
        />
      )}
    </>
  );
}

function Stat({ label, v, u, foot, tone }: { label: string; v: number | undefined; u: string; foot: string; tone?: "ok" | "crit" }) {
  return (
    <div className="card stat" style={tone === "crit" ? { borderColor: "var(--crit)" } : undefined}>
      <span className="lab">{label}</span>
      <span className="num">
        {v === undefined ? "—" : formatQty(v, v % 1 ? 3 : 0)}
        {v !== undefined && <small>{u}</small>}
      </span>
      <span className="foot" style={tone === "crit" ? { color: "var(--crit)", fontWeight: 700 } : undefined}>
        {foot}
      </span>
    </div>
  );
}

function MoveList({ title, rows, unit, empty, open, onEdit, onDelete }: {
  title: string;
  rows: Entry[];
  unit: string;
  empty: string;
  open: boolean;
  onEdit: (r: Entry) => void;
  onDelete: (r: Entry) => void;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 && <div className="empty">{empty}</div>}
      {rows.map((r) => {
        const fromMachine = r.source === "machinery";
        return (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {r.partyName || r.issuedTo || r.zone || "—"}
                {r.serverStatus === "PENDING" && <span className="pill warn" style={{ marginLeft: 6 }}>⏳</span>}
              </div>
              <div className="small muted">
                {[
                  r.unitEntered && r.unitEntered !== unit ? `${formatQty(r.qtyEntered, 3)} ${r.unitEntered}` : null,
                  r.payMode && PAY_LABEL[r.payMode],
                  r.billNo && `Bill ${r.billNo}`,
                  r.ratePaise != null && `${formatINR(r.ratePaise)}/${unit}${r.gstPct ? ` + ${r.gstPct}% GST` : ""}`,
                  r.vehicle,
                  fromMachine && "From machine log",
                  r.remark,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
              <b style={{ whiteSpace: "nowrap" }}>
                {r.type === "IN" || r.type === "TRANSFER_IN" ? "+" : "−"}
                {formatQty(r.qty, 3)} {unit}
              </b>
              {open && !fromMachine && (
                <span className="actions">
                  <button className="btn sm" onClick={() => onEdit(r)} aria-label="Edit">
                    ✎
                  </button>
                  <button className="btn sm danger" onClick={() => onDelete(r)} aria-label="Delete">
                    🗑
                  </button>
                </span>
              )}
              {fromMachine && (
                <Link className="small" to="/machinery">
                  Edit in Machinery
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function StockForm({ kind, item, row, date, onClose }: { kind: "IN" | "USE"; item: MasterRow; row: Entry | null; date: string; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const parties = useMaster("masters_parties");
  const base = item.baseUnit as Unit;
  const units = [base, ...Object.keys(item.conversions ?? {})] as Unit[];
  const [v, setV] = useState({
    qty: row ? String(row.qtyEntered ?? row.qty) : "",
    unit: (row?.unitEntered as Unit) ?? base,
    partyId: (row?.partyId as string) ?? "",
    billNo: (row?.billNo as string) ?? "",
    payMode: (row?.payMode as string) ?? "NAKAD",
    rate: row?.ratePaise != null ? String(row.ratePaise / 100) : "",
    gst: row?.gstPct != null ? String(row.gstPct) : "",
    vehicle: (row?.vehicle as string) ?? "",
    zone: (row?.zone as string) ?? "",
    issuedTo: (row?.issuedTo as string) ?? "",
    remark: (row?.remark as string) ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const qtyNum = Number(v.qty);
  let baseQty: number | null = null;
  let qtyErr: string | null = null;
  if (v.qty) {
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) qtyErr = "Enter a valid quantity (more than 0)";
    else
      try {
        baseQty = toBaseQty(qtyNum, v.unit, { baseUnit: base, conversions: item.conversions ?? {} });
      } catch (e) {
        qtyErr = (e as Error).message;
      }
  }
  const needParty = kind === "IN" && v.payMode === "UDHAAR";
  const valid = baseQty !== null && !qtyErr && (!needParty || v.partyId) && (!row || reason.trim().length >= 3);
  const isDiesel = item.id === "diesel";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const party = parties.find((p) => p.id === v.partyId);
    const data =
      kind === "IN"
        ? {
            businessDate: date, itemId: item.id, itemName: item.name, type: "IN", qty: baseQty, qtyEntered: qtyNum, unitEntered: v.unit,
            partyId: v.partyId || null, partyName: party?.name ?? null, billNo: v.billNo.trim() || null, payMode: v.payMode,
            ratePaise: v.rate ? toPaise(Number(v.rate)) : null, gstPct: v.gst ? Number(v.gst) : null, vehicle: v.vehicle.trim() || null,
            remark: v.remark.trim() || null, source: "inventory",
          }
        : {
            businessDate: date, itemId: item.id, itemName: item.name, type: "USE", qty: baseQty, qtyEntered: qtyNum, unitEntered: v.unit,
            zone: v.zone || null, issuedTo: v.issuedTo.trim() || null, remark: v.remark.trim() || null, source: "inventory",
          };
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "stockMoves", id: row?.id, data, current: row, action: row ? "UPDATE" : "CREATE" }], row ? reason.trim() : null);
      toast(navigator.onLine ? "Saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`${item.name} — ${kind === "IN" ? "received" : "used / issued"}${row ? " (edit)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {kind === "USE" && isDiesel && (
          <p className="small" style={{ background: "var(--accent-soft)", padding: 10, borderRadius: 10 }}>
            Diesel given to a machine? Enter it in the <Link to="/machinery">Machinery log</Link> — it will appear here automatically. Use this form only for others (vehicles, tankers, etc.).
          </p>
        )}
        <div className="grid-form">
          <div className="field">
            <label htmlFor="s-qty">Quantity *</label>
            <input id="s-qty" className="input" inputMode="decimal" value={v.qty} onChange={set("qty")} autoFocus style={{ fontSize: 22, fontWeight: 700 }} />
            {qtyErr ? <span className="err">{qtyErr}</span> : baseQty !== null && v.unit !== base ? <span className="hint">= {formatQty(baseQty, 3)} {base}</span> : null}
          </div>
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Unit</span>
            <div className="checks">
              {units.map((un) => (
                <button type="button" key={un} className="tab" aria-pressed={v.unit === un} onClick={() => setV({ ...v, unit: un })}>
                  {un}
                  {un !== base && item.conversions?.[un] ? ` (${item.conversions[un]} ${base})` : ""}
                </button>
              ))}
            </div>
          </div>
          {kind === "IN" ? (
            <>
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Payment</span>
                <div className="checks">
                  {PAY.map(([k, l]) => (
                    <button type="button" key={k} className="tab" aria-pressed={v.payMode === k} onClick={() => setV({ ...v, payMode: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-party">Supplier / Party {needParty && "*"}</label>
                <select id="s-party" className="input" value={v.partyId} onChange={set("partyId")}>
                  <option value="">—</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{needParty ? "Credit → a bill is added to this party's ledger automatically" : "Parties are managed under Masters"}</span>
              </div>
              <div className="field">
                <label htmlFor="s-rate">Rate ₹ / {base}</label>
                <input id="s-rate" className="input" inputMode="decimal" value={v.rate} onChange={set("rate")} />
              </div>
              <div className="field">
                <label htmlFor="s-gst">GST %</label>
                <input id="s-gst" className="input" inputMode="decimal" value={v.gst} onChange={set("gst")} placeholder="0" />
              </div>
              <div className="field">
                <label htmlFor="s-bill">Bill / Challan no.</label>
                <input id="s-bill" className="input" value={v.billNo} onChange={set("billNo")} />
              </div>
              <div className="field">
                <label htmlFor="s-veh">Brought by / vehicle no.</label>
                <input id="s-veh" className="input" value={v.vehicle} onChange={set("vehicle")} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="s-zone">Where / which work</label>
                <select id="s-zone" className="input" value={v.zone} onChange={set("zone")}>
                  <option value="">—</option>
                  {(current?.zones ?? []).map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="s-to">Issued to</label>
                <input id="s-to" className="input" value={v.issuedTo} onChange={set("issuedTo")} placeholder={isDiesel ? "e.g. water tanker, bike" : "e.g. Suraj (contractor)"} />
              </div>
            </>
          )}
        </div>
        <div className="field">
          <label htmlFor="s-rm">Remark</label>
          <input id="s-rm" className="input" value={v.remark} onChange={set("remark")} />
        </div>
        {row && (
          <div className="field">
            <label htmlFor="s-why">Reason for change *</label>
            <input id="s-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong quantity" />
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
