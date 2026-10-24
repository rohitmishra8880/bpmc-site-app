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
const PAY: [string, string][] = [["NAKAD", "Nakad"], ["UDHAAR", "Udhaar"], ["UPI", "UPI"], ["CHEQUE", "Cheque"]];

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

  if (!current) return <div className="card empty">Pehle project chuno.</div>;
  if (!item) return <div className="card empty">Masters mein koi material nahi. Pehle Masters → Maal mein jodo.</div>;
  const u = item.baseUnit as string;

  const remove = async (e: Entry, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite("stockMoves", e, profile.email, reason)], reason);
      toast("Hata diya — Recycle Bin mein");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  const groups = ["FUEL", "MATERIAL", "OIL"];
  const isLow = bal && item.minStock != null && bal.closing < Number(item.minStock);

  return (
    <>
      <DateBar title="Inventory & Material Stock" sub={`${current.name} — maal aaya, kharch aur baaki`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
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
            ＋ Material jodo
          </Link>
        )}
      </div>
      <PageHead title={`${item.name}`} sub={`${GROUP_LABEL[item.group as string] ?? "Material"} · hisab ${u} mein`}>
        {open && (
          <>
            <button className="btn dark" onClick={() => setForm({ kind: "IN", row: null })}>
              ＋ Aaya (Inward)
            </button>
            <button className="btn primary" onClick={() => setForm({ kind: "USE", row: null })}>
              ＋ Kharch / Diya
            </button>
          </>
        )}
      </PageHead>
      <div className="stats">
        <Stat label="Purana stock" v={bal?.opening} u={u} foot="Kal ka closing = aaj ka opening" />
        <Stat label="Naya (aaya)" v={bal?.inward} u={u} foot={`${inward.length} entry`} />
        <Stat label="Kul kharch" v={bal?.uses} u={u} foot={`${uses.length} entry`} />
        <Stat label="Abhi baaki" v={bal?.closing} u={u} foot={isLow ? `Limit ${item.minStock} se kam!` : "Server ka hisab"} tone={isLow ? "crit" : "ok"} />
      </div>
      {!bal && <p className="small muted">Is din ka hisab abhi nahi bana — entry hote hi server 5 minute mein banayega.</p>}
      {bal && bal.adjust !== 0 && <p className="small muted">Adjust (gin-ti sudhaar): {formatQty(bal.adjust, 3)} {u}</p>}

      <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <MoveList title="Aaya (naya stock)" rows={inward} unit={u} empty={`Is din ${item.name} nahi aaya`} open={open} onEdit={(r) => setForm({ kind: "IN", row: r })} onDelete={setRemoving} />
        <MoveList title="Kharch / diya" rows={uses} unit={u} empty="Is din kharch nahi" open={open} onEdit={(r) => setForm({ kind: "USE", row: r })} onDelete={setRemoving} />
      </div>
      {bal && (
        <section className="card" style={{ padding: 16 }}>
          <b>Stock ka hisab</b>
          <p style={{ marginTop: 6 }}>
            {formatQty(bal.opening, 3)} + {formatQty(bal.inward, 3)} − {formatQty(bal.uses, 3)}
            {bal.adjust ? ` ${bal.adjust > 0 ? "+" : "−"} ${formatQty(Math.abs(bal.adjust), 3)}` : ""} = <b>{formatQty(bal.closing, 3)} {u}</b>
          </p>
          <p className="small muted">Server ka hisab — haath se type nahi. Pichhla din badla to aage ke din khud theek hote hain.</p>
        </section>
      )}

      {form && <StockForm kind={form.kind} item={item} row={form.row} date={date} onClose={() => setForm(null)} />}
      {removing && (
        <ReasonDialog
          title="Yeh entry hatani hai?"
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
                  r.payMode,
                  r.billNo && `Bill ${r.billNo}`,
                  r.ratePaise != null && `${formatINR(r.ratePaise)}/${unit}${r.gstPct ? ` + ${r.gstPct}% GST` : ""}`,
                  r.vehicle,
                  fromMachine && "Machinery log se",
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
                  <button className="btn sm" onClick={() => onEdit(r)}>
                    ✎
                  </button>
                  <button className="btn sm danger" onClick={() => onDelete(r)}>
                    🗑
                  </button>
                </span>
              )}
              {fromMachine && (
                <Link className="small" to="/machinery">
                  Machinery mein badlo
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
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) qtyErr = "Sahi matra likho (0 se zyada)";
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
      toast(navigator.onLine ? "Save ho gaya ✓ · server hisab kar raha hai ⏳" : "Phone mein save — network aate hi jayega");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`${item.name} — ${kind === "IN" ? "aaya" : "kharch / diya"}${row ? " (badlo)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {kind === "USE" && isDiesel && (
          <p className="small" style={{ background: "var(--accent-soft)", padding: 10, borderRadius: 10 }}>
            Machine ko diesel diya? <Link to="/machinery">Machinery log</Link> mein bharo — wahi se yahan aa jayega. Yahan sirf baaki (gaadi, tanker, aur) ke liye.
          </p>
        )}
        <div className="grid-form">
          <div className="field">
            <label htmlFor="s-qty">Kitna *</label>
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
                <span style={{ fontWeight: 600, fontSize: 14 }}>Bhugtan</span>
                <div className="checks">
                  {PAY.map(([k, l]) => (
                    <button type="button" key={k} className="tab" aria-pressed={v.payMode === k} onClick={() => setV({ ...v, payMode: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-party">Dukaan / Party {needParty && "*"}</label>
                <select id="s-party" className="input" value={v.partyId} onChange={set("partyId")}>
                  <option value="">—</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{needParty ? "Udhaar → is party ke khate mein bill khud banega" : "Party list Masters mein"}</span>
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
                <label htmlFor="s-veh">Kisne laaya / gaadi no.</label>
                <input id="s-veh" className="input" value={v.vehicle} onChange={set("vehicle")} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="s-zone">Kahan / kis kaam</label>
                <select id="s-zone" className="input" value={v.zone} onChange={set("zone")}>
                  <option value="">—</option>
                  {(current?.zones ?? []).map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="s-to">Kisko diya</label>
                <input id="s-to" className="input" value={v.issuedTo} onChange={set("issuedTo")} placeholder={isDiesel ? "jaise: paani tanker, bike" : "jaise: Suraj (thekedar)"} />
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
            <label htmlFor="s-why">Badalne ka kaaran *</label>
            <input id="s-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="jaise: galat number" />
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
