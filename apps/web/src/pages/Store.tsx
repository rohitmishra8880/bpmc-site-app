// Store / Saman Register (CLAUDE.md R3): aaya, thekedar ko diya, wapas, kharch, doosri site; bade saman ke number + service.
// Phone sirf movement likhta hai; stock, thekedar ke paas, alert, mahine ka statement server (storeSummary) banata hai.
import { collection, doc, getDocs, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { canEditDate, formatDate, formatINR, formatQtyShort, lineAmount, toBusinessDateIST, toPaise, type Holding, type StoreAlert, type StoreBalance, type StoreStatementRow } from "@bpmc/core";
import { Link } from "react-router-dom";
import { DateBar } from "../components/DateBar";
import { PhotoDialog, refKey, useDayPhotos } from "../components/Photos";
import { saveMaster } from "../lib/audit";
import { can, useProfile } from "../lib/auth";
import { softDeleteWrite, useDayEntries, useUnlock, useUnlocks, writeEntries, type Entry } from "../lib/entries";
import { db } from "../lib/firebase";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";
import { PAY } from "./Inventory";

type Kind = "INWARD" | "ISSUE" | "RETURN" | "CONSUME" | "TRANSFER_OUT";
type Tab = "day" | "stock" | "contractors" | "assets" | "month";

const KIND: Record<string, { label: string; tone: string }> = {
  INWARD: { label: "Received", tone: "ok" },
  ISSUE: { label: "Issued", tone: "info" },
  RETURN: { label: "Returned", tone: "ok" },
  CONSUME: { label: "Used up", tone: "neutral" },
  TRANSFER_OUT: { label: "Sent to other site", tone: "warn" },
  TRANSFER_IN: { label: "From other site", tone: "ok" },
};
const COND: [string, string][] = [["OK", "Good"], ["DAMAGED", "Damaged (repairable)"], ["BROKEN", "Broken"], ["LOST", "Lost"]];
const COND_LABEL = Object.fromEntries(COND) as Record<string, string>;
const PAY_LABEL = Object.fromEntries(PAY) as Record<string, string>;
const UNITS = ["Nos", "Kg", "Mtr", "Ltr", "Bags", "Set"];
const COMPANY = "COMPANY";

interface Summary {
  asOf: string;
  items: Record<string, StoreBalance>;
  holdings: Holding[];
  alerts: StoreAlert[];
  overdueDays: number;
}

const daysSince = (since: string, today: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(since)) / 864e5));
const nowTimeIST = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(11, 16);
const qtyOf = (r: Entry) => Number(r.qty) || 0;

/** Sign of a move for the store (broken / lost return does not come back to the store) */
function signOf(r: Entry): "+" | "−" | "" {
  if (r.type === "RETURN") return r.condition === "BROKEN" || r.condition === "LOST" ? "" : "+";
  return r.type === "INWARD" || r.type === "TRANSFER_IN" ? "+" : "−";
}

function useProjDoc(pid: string | undefined, col: string, id: string) {
  const [d, setD] = useState<DocumentData | null | undefined>(undefined);
  useEffect(() => {
    if (!pid) return;
    setD(undefined);
    return onSnapshot(doc(db, "projects", pid, col, id), (s) => setD(s.exists() ? s.data() : null));
  }, [pid, col, id]);
  return d;
}

function useProjCol(pid: string | undefined, col: string) {
  const [rows, setRows] = useState<Entry[]>([]);
  useEffect(() => {
    if (!pid) return;
    setRows([]);
    return onSnapshot(collection(db, "projects", pid, col), (s) => setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry)));
  }, [pid, col]);
  return rows;
}

export function Store() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const items = useMaster("masters_storeItems");
  const contractors = useMaster("masters_contractors");
  const [tab, setTab] = useState<Tab>("day");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const [form, setForm] = useState<{ kind: Kind; row: Entry | null; preset?: { contractorId?: string; itemId?: string } } | null>(null);
  const [service, setService] = useState<{ row: Entry | null; tag?: string; itemId?: string } | null>(null);
  const [removing, setRemoving] = useState<{ col: "storeMoves" | "storeService"; e: Entry } | null>(null);
  const [photoFor, setPhotoFor] = useState<{ refId: string; title: string; label: string } | null>(null);
  const photos = useDayPhotos(current?.id, date);
  const { rows } = useDayEntries(current?.id, "storeMoves", date);
  const unlock = useUnlock(current?.id, date);
  const summary = useProjDoc(current?.id, "storeSummary", "current") as Summary | null | undefined;

  const today = toBusinessDateIST(new Date());
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cName = (id: string) => (id === COMPANY ? "Company (own labour)" : (contractors.find((c) => c.id === id)?.name ?? id));
  const iName = (id: string) => itemById.get(id)?.name ?? id;
  const live = useMemo(() => (rows ?? []).filter((r) => !r.deleted).sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? ""))), [rows]);
  const pending = live.filter((r) => r.serverStatus === "PENDING").length;
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");

  if (!current) return <div className="card empty">Select a project first.</div>;

  const remove = async (col: "storeMoves" | "storeService", e: Entry, reason: string) => {
    try {
      await writeEntries(current.id, profile.email, [softDeleteWrite(col, e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  const alerts = summary?.alerts ?? [];
  const overdue = summary?.overdueDays ?? 7;

  return (
    <>
      <DateBar title="Store Register" sub={`${current.name} — tools, machines and materials`} date={date} onChange={setDate} pending={pending} unlockedTill={unlock} />
      {alerts.length > 0 && (
        <section className="card" style={{ borderColor: "var(--crit)" }}>
          <div className="card-head">
            <h2>⚠️ Store alerts</h2>
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              {a.kind === "LOW_STOCK" ? (
                <>
                  <b>{iName(a.itemId)}</b>: only {formatQtyShort(a.qty)} {itemById.get(a.itemId)?.unit ?? ""} left (limit {formatQtyShort(a.limit)})
                </>
              ) : (
                <>
                  <b>{cName(a.contractorId)}</b>: {iName(a.itemId)} × {formatQtyShort(a.qty)} — not returned for{" "}
                  <b>{daysSince(sinceOf(summary, a), today)} days</b>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="tabs" role="group" aria-label="Store view">
        {(
          [
            ["day", "Day register"],
            ["stock", "Stock"],
            ["contractors", "With contractors"],
            ["assets", "Large items & service"],
            ["month", "Monthly statement"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "day" && (
        <>
          <PageHead title={formatDate(date)} sub="Everything that came in or went out of the store on this day">
            <Link className="btn" to="/reports?r=store">⬇ PDF</Link>
            {open && (
              <>
                <button className="btn dark" onClick={() => setForm({ kind: "INWARD", row: null })}>＋ Received</button>
                <button className="btn primary" onClick={() => setForm({ kind: "ISSUE", row: null })}>＋ Issue to contractor</button>
                <button className="btn" onClick={() => setForm({ kind: "RETURN", row: null })}>＋ Return</button>
                <button className="btn" onClick={() => setForm({ kind: "CONSUME", row: null })}>＋ Used up</button>
                <button className="btn" onClick={() => setForm({ kind: "TRANSFER_OUT", row: null })}>＋ Send to other site</button>
              </>
            )}
          </PageHead>
          <section className="card">
            {live.length === 0 && <div className="empty">No store entries on this day</div>}
            {live.map((r) => (
              <MoveRow
                key={r.id}
                r={r}
                unit={itemById.get(r.itemId)?.unit ?? r.unit ?? ""}
                itemName={r.itemName ?? iName(r.itemId)}
                cName={cName}
                open={open}
                onEdit={() => setForm({ kind: r.type as Kind, row: r })}
                onDelete={() => setRemoving({ col: "storeMoves", e: r })}
                photoCount={r.type === "INWARD" ? photos.filter((p) => p.refKey === refKey("storeMoves", r.id)).length : null}
                onPhotos={() => setPhotoFor({ refId: r.id, title: `Bill photo — ${r.itemName ?? iName(r.itemId)}`, label: `Bill ${r.billNo ?? r.itemName ?? ""}` })}
              />
            ))}
          </section>
        </>
      )}

      {tab === "stock" && <StockTab summary={summary} items={items} />}

      {tab === "contractors" && (
        <ContractorsTab
          summary={summary}
          today={today}
          overdue={overdue}
          cName={cName}
          iName={iName}
          unitOf={(id) => itemById.get(id)?.unit ?? ""}
          onReturn={open ? (h) => setForm({ kind: "RETURN", row: null, preset: { contractorId: h.contractorId, itemId: h.itemId } }) : null}
        />
      )}

      {tab === "assets" && (
        <AssetsTab
          pid={current.id}
          open={open}
          iName={iName}
          onService={(tag, itemId) => setService({ row: null, tag, itemId })}
          onEdit={(row) => setService({ row })}
          onDelete={(e) => setRemoving({ col: "storeService", e })}
        />
      )}

      {tab === "month" && <MonthTab pid={current.id} initial={date.slice(0, 7)} iName={iName} unitOf={(id) => itemById.get(id)?.unit ?? ""} />}

      {form && (
        <MoveForm
          kind={form.kind}
          row={form.row}
          preset={form.preset}
          date={date}
          items={items}
          contractors={contractors}
          summary={summary ?? null}
          onClose={() => setForm(null)}
        />
      )}
      {photoFor && <PhotoDialog pid={current.id} date={date} photos={photos} refCol="storeMoves" onClose={() => setPhotoFor(null)} {...photoFor} />}
      {service && <ServiceForm row={service.row} tag={service.tag} itemId={service.itemId} date={date} items={items} onClose={() => setService(null)} />}
      {removing && (
        <ReasonDialog
          title="Delete this entry?"
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const x = removing;
            setRemoving(null);
            void remove(x.col, x.e, reason);
          }}
        />
      )}
    </>
  );
}

/** Alert ke saath "kab se" — holdings se (alert mein sirf din hain, jo server ke din ke hain) */
function sinceOf(summary: Summary | null | undefined, a: Extract<StoreAlert, { kind: "NOT_RETURNED" }>): string {
  return summary?.holdings.find((h) => h.contractorId === a.contractorId && h.itemId === a.itemId)?.since ?? summary?.asOf ?? "";
}

function MoveRow({ r, unit, itemName, cName, open, onEdit, onDelete, photoCount, onPhotos }: {
  photoCount: number | null;
  onPhotos: () => void;
  r: Entry;
  unit: string;
  itemName: string;
  cName: (id: string) => string;
  open: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const k = KIND[r.type] ?? { label: r.type, tone: "neutral" };
  const fromServer = r.createdBy === "server";
  const sign = signOf(r);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {itemName} <span className={`pill ${k.tone}`}>{k.label}</span>
          {r.condition && r.condition !== "OK" && <span className={`pill ${r.condition === "DAMAGED" ? "warn" : "crit"}`} style={{ marginLeft: 4 }}>{COND_LABEL[r.condition]}</span>}
          {r.serverStatus === "PENDING" && <span className="pill warn" style={{ marginLeft: 6 }}>⏳</span>}
        </div>
        <div className="small muted">
          {[
            r.time,
            r.contractorId && cName(r.contractorId),
            r.purpose,
            r.partyName,
            r.payMode && PAY_LABEL[r.payMode],
            r.billNo && `Bill ${r.billNo}`,
            r.ratePaise != null && `${formatINR(r.ratePaise)}/${unit}${r.gstPct ? ` + ${r.gstPct}% GST` : ""}`,
            r.amountPaise != null && `Total ${formatINR(r.amountPaise)}`,
            r.recoveryPaise ? `Recovery ${formatINR(r.recoveryPaise)}` : null,
            r.otherProjectName || r.otherProjectId,
            r.vehicle,
            r.remark,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
        <b style={{ whiteSpace: "nowrap" }}>
          {sign}
          {formatQtyShort(qtyOf(r))} {unit}
        </b>
        {open && !fromServer && (
          <span className="actions">
            <button className="btn sm" onClick={onEdit} aria-label="Edit">✎</button>
            <button className="btn sm danger" onClick={onDelete} aria-label="Delete">🗑</button>
          </span>
        )}
        {photoCount !== null && (
          <button className="btn sm" onClick={onPhotos} aria-label="Bill photo">
            📷 Bill {photoCount || ""}
          </button>
        )}
        {fromServer && <span className="small muted">Edit at the sending site</span>}
      </div>
    </div>
  );
}

function StockTab({ summary, items }: { summary: Summary | null | undefined; items: MasterRow[] }) {
  if (summary === undefined) return <div className="card empty">Loading…</div>;
  const rows = items.filter((i) => summary?.items?.[i.id]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Stock</h2>
        <span className="small muted">{summary ? `Calculated by server · ${formatDate(summary.asOf)}` : "No entries yet"}</span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th className="r">Received</th>
              <th className="r">In store</th>
              <th className="r">With contractors</th>
              <th className="r">Used up</th>
              <th className="r">Damaged / Broken / Lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const b = summary!.items[i.id]!;
              const low = i.category === "CONSUMABLE" && i.minStock != null && Number(i.minStock) > 0 && b.inStore < Number(i.minStock);
              return (
                <tr key={i.id}>
                  <td>
                    <b>{i.name}</b>
                    {i.tagPrefix && <span className="small muted"> · {i.tagPrefix}-01…</span>}
                  </td>
                  <td>{i.category === "CONSUMABLE" ? "Consumable" : "Returnable"}</td>
                  <td className="r">{formatQtyShort(b.inward + b.transferIn)}</td>
                  <td className="r" style={low ? { color: "var(--crit)", fontWeight: 800 } : { fontWeight: 800 }}>
                    {formatQtyShort(b.inStore)} {i.unit}
                    {low && <div className="small">below {i.minStock}</div>}
                  </td>
                  <td className="r">{i.category === "CONSUMABLE" ? "—" : formatQtyShort(b.withContractors)}</td>
                  <td className="r">{formatQtyShort(b.consumed)}</td>
                  <td className="r">
                    {formatQtyShort(b.damaged)} / {formatQtyShort(b.broken)} / {formatQtyShort(b.lost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Nothing in the store register yet</div>}
      </div>
      <p className="note">In store = Received − Issued + Returned (good / damaged) − Used up ± Transfers. Broken and lost items are written off. Never typed by hand.</p>
    </section>
  );
}

function ContractorsTab({ summary, today, overdue, cName, iName, unitOf, onReturn }: {
  summary: Summary | null | undefined;
  today: string;
  overdue: number;
  cName: (id: string) => string;
  iName: (id: string) => string;
  unitOf: (id: string) => string;
  onReturn: ((h: Holding) => void) | null;
}) {
  const groups = new Map<string, Holding[]>();
  for (const h of summary?.holdings ?? []) groups.set(h.contractorId, [...(groups.get(h.contractorId) ?? []), h]);
  if (groups.size === 0) return <div className="card empty">No items are with any contractor right now</div>;
  return (
    <>
      {[...groups].map(([cid, hs]) => (
        <section className="card" key={cid}>
          <div className="card-head">
            <h2>{cName(cid)}</h2>
            <span className="small muted">{hs.length} {hs.length === 1 ? "item" : "items"}</span>
          </div>
          {hs.map((h) => {
            const d = daysSince(h.since, today);
            return (
              <div key={h.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <b>{iName(h.itemId)}</b> × {formatQtyShort(h.qty)} {unitOf(h.itemId)}
                  <div className="small muted">Since {formatDate(h.since)}</div>
                </div>
                <div className="actions">
                  <span className={`pill ${d >= overdue ? "crit" : "neutral"}`}>{d} days</span>
                  {onReturn && <button className="btn sm" onClick={() => onReturn(h)}>Return</button>}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <p className="small muted">Oldest issue is closed first when something comes back. Red = not returned for {overdue}+ days.</p>
    </>
  );
}

function AssetsTab({ pid, open, iName, onService, onEdit, onDelete }: {
  pid: string;
  open: boolean;
  iName: (id: string) => string;
  onService: (tag?: string, itemId?: string) => void;
  onEdit: (r: Entry) => void;
  onDelete: (r: Entry) => void;
}) {
  const profile = useProfile();
  const assets = useProjCol(pid, "storeAssets");
  const services = useProjCol(pid, "storeService");
  const unlocks = useUnlocks(pid);
  const active = assets.filter((a) => a.status !== "CANCELLED").sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const hist = services.filter((s) => !s.deleted).sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const canEdit = (r: Entry) => can(profile, "entry.edit") && canEditDate(r.businessDate, new Date(), unlocks[r.businessDate] ? { expiresAt: unlocks[r.businessDate]! } : null);
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Large items (numbered)</h2>
          {open && <button className="btn sm" onClick={() => onService()}>＋ Service / repair</button>}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Item</th>
                <th>Received</th>
                <th>Last service</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((a) => {
                const last = hist.find((s) => s.tag === a.id);
                return (
                  <tr key={a.id}>
                    <td><b>{a.id}</b></td>
                    <td>{a.itemName ?? iName(a.itemId)}</td>
                    <td>{a.businessDate ? formatDate(a.businessDate) : "—"}</td>
                    <td className="small">{last ? `${formatDate(last.businessDate)} · ${last.kind === "REPAIR" ? "Repair" : "Service"}` : "—"}</td>
                    <td className="r">{open && <button className="btn sm" onClick={() => onService(a.id, a.itemId)}>Service</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {active.length === 0 && <div className="empty">No numbered items yet. Give a store item an "Asset no. prefix" in Masters (e.g. RCM) — every unit received gets a number like RCM-01.</div>}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Service & repair history</h2>
        </div>
        {hist.length === 0 && <div className="empty">No service or repair entries</div>}
        {hist.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div>
              <b>{s.tag ?? iName(s.itemId)}</b> <span className={`pill ${s.kind === "REPAIR" ? "warn" : "info"}`}>{s.kind === "REPAIR" ? "Repair" : "Service"}</span>
              {s.serverStatus === "PENDING" && <span className="pill warn" style={{ marginLeft: 6 }}>⏳</span>}
              <div className="small muted">{[formatDate(s.businessDate), s.tag && iName(s.itemId), s.doneBy, s.remark].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
              <b>{s.costPaise ? formatINR(s.costPaise) : "—"}</b>
              {canEdit(s) && (
                <span className="actions">
                  <button className="btn sm" onClick={() => onEdit(s)} aria-label="Edit">✎</button>
                  <button className="btn sm danger" onClick={() => onDelete(s)} aria-label="Delete">🗑</button>
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function MonthTab({ pid, initial, iName, unitOf }: { pid: string; initial: string; iName: (id: string) => string; unitOf: (id: string) => string }) {
  const [month, setMonth] = useState(initial);
  const st = useProjDoc(pid, "storeSummary", `m_${month}`) as { items: Record<string, StoreStatementRow> } | null | undefined;
  const rows = Object.entries(st?.items ?? {}).sort((a, b) => iName(a[0]).localeCompare(iName(b[0])));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Monthly statement</h2>
        <input type="month" className="input" style={{ width: "auto", minHeight: 38 }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Opening (store)</th>
              <th className="r">Received</th>
              <th className="r">Issued</th>
              <th className="r">Returned</th>
              <th className="r">Used up</th>
              <th className="r">Transfer in / out</th>
              <th className="r">Broken / Lost</th>
              <th className="r">Closing (store)</th>
              <th className="r">With contractors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, s]) => (
              <tr key={id}>
                <td><b>{iName(id)}</b> <span className="small muted">{unitOf(id)}</span></td>
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
        {st === undefined ? <div className="empty">Loading…</div> : rows.length === 0 && <div className="empty">No store activity in this month</div>}
      </div>
      <p className="note">Opening = closing of the previous month. Editing an old entry updates every later month automatically.</p>
    </section>
  );
}

function MoveForm({ kind, row, preset, date, items, contractors, summary, onClose }: {
  kind: Kind;
  row: Entry | null;
  preset?: { contractorId?: string; itemId?: string };
  date: string;
  items: MasterRow[];
  contractors: MasterRow[];
  summary: Summary | null;
  onClose: () => void;
}) {
  const profile = useProfile();
  const toast = useToast();
  const { current, projects } = useProjects();
  const parties = useMaster("masters_parties");
  const [v, setV] = useState({
    itemId: (row?.itemId as string) ?? preset?.itemId ?? "",
    qty: row ? String(row.qty) : "",
    time: (row?.time as string) ?? (date === toBusinessDateIST(new Date()) ? nowTimeIST() : ""),
    contractorId: (row?.contractorId as string) ?? preset?.contractorId ?? "",
    purpose: (row?.purpose as string) ?? "",
    condition: (row?.condition as string) ?? "OK",
    recovery: row?.recoveryPaise != null ? String(row.recoveryPaise / 100) : "",
    rate: row?.ratePaise != null ? String(row.ratePaise / 100) : "",
    gst: row?.gstPct != null ? String(row.gstPct) : "",
    partyId: (row?.partyId as string) ?? "",
    billNo: (row?.billNo as string) ?? "",
    payMode: (row?.payMode as string) ?? "NAKAD",
    vehicle: (row?.vehicle as string) ?? "",
    toProject: (row?.otherProjectId as string) ?? "",
    remark: (row?.remark as string) ?? "",
  });
  const [recoveryTouched, setRecoveryTouched] = useState(row != null);
  const [lastRate, setLastRate] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const held = (summary?.holdings ?? []).filter((h) => h.contractorId === v.contractorId);
  const choices =
    kind === "ISSUE" ? items.filter((i) => i.category !== "CONSUMABLE")
    : kind === "CONSUME" ? items.filter((i) => i.category === "CONSUMABLE")
    : kind === "RETURN" && held.length ? items.filter((i) => held.some((h) => h.itemId === i.id) || i.id === row?.itemId)
    : kind === "RETURN" ? items.filter((i) => i.category !== "CONSUMABLE")
    : items;
  const item = items.find((i) => i.id === v.itemId);
  const unit = (item?.unit as string) ?? "";
  const qtyNum = Number(v.qty);
  const qtyErr = v.qty && !(Number.isFinite(qtyNum) && qtyNum > 0) ? "Enter a valid quantity (more than 0)" : null;
  const lossy = kind === "RETURN" && (v.condition === "BROKEN" || v.condition === "LOST");

  // Toota / kho gaya: katauti = qty × aakhri kharid rate (badal sakte hain)
  useEffect(() => {
    if (kind !== "RETURN" || !current || !v.itemId) return;
    let stop = false;
    void getDocs(query(collection(db, "projects", current.id, "storeMoves"), where("itemId", "==", v.itemId))).then((s) => {
      const ins = s.docs.map((d) => d.data()).filter((d) => d.type === "INWARD" && !d.deleted && d.ratePaise != null).sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate)));
      if (!stop) setLastRate(ins[0]?.ratePaise ?? null);
    });
    return () => {
      stop = true;
    };
  }, [kind, current, v.itemId]);
  useEffect(() => {
    if (lossy && !recoveryTouched && lastRate != null && qtyNum > 0) setV((x) => ({ ...x, recovery: String(Math.round(qtyNum * lastRate) / 100) }));
  }, [lossy, recoveryTouched, lastRate, qtyNum]);

  // Sirf chetavni — server ka hisab 5 min purana ho sakta hai
  const sameRow = row && row.itemId === v.itemId ? qtyOf(row) : 0;
  const inStore = summary?.items?.[v.itemId]?.inStore;
  const holding = held.find((h) => h.itemId === v.itemId)?.qty;
  let warn: string | null = null;
  if ((kind === "ISSUE" || kind === "CONSUME" || kind === "TRANSFER_OUT") && inStore != null && qtyNum > inStore + sameRow) warn = `Only ${formatQtyShort(inStore + sameRow)} ${unit} in store as per the last calculation`;
  if (kind === "RETURN" && v.contractorId && v.itemId && qtyNum > (holding ?? 0) + (row && row.contractorId === v.contractorId ? sameRow : 0)) warn = `${formatQtyShort(holding ?? 0)} ${unit} is with this contractor as per the last calculation`;

  const amount = kind === "INWARD" && qtyNum > 0 && v.rate !== "" ? lineAmount(qtyNum, toPaise(Number(v.rate) || 0), Number(v.gst) || 0) : null;
  const others = projects.filter((p) => p.id !== current?.id);
  const valid =
    !!item && !qtyErr && qtyNum > 0 &&
    (kind !== "ISSUE" && kind !== "RETURN" ? true : !!v.contractorId) &&
    (kind !== "INWARD" || (!!v.partyId && v.rate !== "" && Number(v.rate) >= 0)) &&
    (kind !== "TRANSFER_OUT" || !!v.toProject) &&
    (!lossy || v.recovery === "" || Number(v.recovery) >= 0) &&
    (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current || !item) return;
    const c = contractors.find((x) => x.id === v.contractorId);
    const contractorName = v.contractorId === COMPANY ? "Company (own labour)" : (c?.name ?? null);
    const base = {
      businessDate: row?.businessDate ?? date, time: v.time || null, type: kind, itemId: item.id, itemName: item.name, unit, category: item.category ?? null,
      qty: qtyNum, remark: v.remark.trim() || null,
    };
    const party = parties.find((p) => p.id === v.partyId);
    const to = projects.find((p) => p.id === v.toProject);
    const data =
      kind === "INWARD"
        ? { ...base, ratePaise: toPaise(Number(v.rate) || 0), gstPct: v.gst ? Number(v.gst) : null, amountPaise: amount?.totalPaise ?? null, partyId: v.partyId, partyName: party?.name ?? null, billNo: v.billNo.trim() || null, payMode: v.payMode, vehicle: v.vehicle.trim() || null }
        : kind === "ISSUE"
          ? { ...base, contractorId: v.contractorId, contractorName, purpose: v.purpose.trim() || null }
          : kind === "RETURN"
            ? { ...base, contractorId: v.contractorId, contractorName, condition: v.condition, recoveryPaise: lossy && v.recovery ? toPaise(Number(v.recovery)) : null }
            : kind === "CONSUME"
              ? { ...base, contractorId: v.contractorId || null, contractorName: v.contractorId ? contractorName : null, purpose: v.purpose.trim() || null }
              : { ...base, otherProjectId: v.toProject, otherProjectName: to?.name ?? null };
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "storeMoves", id: row?.id, data, current: row, action: row ? "UPDATE" : "CREATE" }], row ? reason.trim() : null);
      toast(navigator.onLine ? "Saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  const title = { INWARD: "Received in store", ISSUE: "Issue to contractor", RETURN: "Returned to store", CONSUME: "Used up", TRANSFER_OUT: "Send to other site" }[kind];
  const contractorSelect = (required: boolean) => (
    <div className="field">
      <label htmlFor="m-con">Contractor {required && "*"}</label>
      <select id="m-con" className="input" value={v.contractorId} onChange={set("contractorId")}>
        <option value="">—</option>
        <option value={COMPANY}>Company (own labour)</option>
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Dialog title={`${title}${row ? " (edit)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          {(kind === "ISSUE" || kind === "RETURN") && contractorSelect(true)}
          <div className="field">
            <label htmlFor="m-item">Item *</label>
            <select id="m-item" className="input" value={v.itemId} onChange={set("itemId")} autoFocus={!preset?.itemId}>
              <option value="">— select —</option>
              {choices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit}){kind === "RETURN" && held.find((h) => h.itemId === i.id) ? ` — has ${formatQtyShort(held.find((h) => h.itemId === i.id)!.qty)}` : ""}
                </option>
              ))}
            </select>
            {kind === "INWARD" && can(profile, "masters.edit") && !adding && (
              <button type="button" className="link-btn small" onClick={() => setAdding(true)} style={{ color: "var(--accent)" }}>
                ＋ New item
              </button>
            )}
          </div>
          {adding && <QuickItem onDone={(id) => { setAdding(false); if (id) setV((x) => ({ ...x, itemId: id })); }} />}
          <div className="field">
            <label htmlFor="m-qty">Quantity {unit && `(${unit})`} *</label>
            <input id="m-qty" className="input" inputMode="decimal" value={v.qty} onChange={set("qty")} style={{ fontSize: 22, fontWeight: 700 }} />
            {qtyErr ? <span className="err">{qtyErr}</span> : warn ? <span className="warn">{warn}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="m-time">Time (IST)</label>
            <input id="m-time" type="time" className="input" value={v.time} onChange={set("time")} />
          </div>

          {kind === "INWARD" && (
            <>
              <div className="field">
                <label htmlFor="m-rate">Rate ₹ / {unit || "unit"} *</label>
                <input id="m-rate" className="input" inputMode="decimal" value={v.rate} onChange={set("rate")} />
              </div>
              <div className="field">
                <label htmlFor="m-gst">GST %</label>
                <input id="m-gst" className="input" inputMode="decimal" value={v.gst} onChange={set("gst")} placeholder="0" />
                {amount && <span className="hint">Total = <b>{formatINR(amount.totalPaise)}</b>{amount.gstPaise ? ` (incl. GST ${formatINR(amount.gstPaise)})` : ""}</span>}
              </div>
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Payment *</span>
                <div className="checks">
                  {PAY.map(([k, l]) => (
                    <button type="button" key={k} className="tab" aria-pressed={v.payMode === k} onClick={() => setV({ ...v, payMode: k })}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="m-party">Shop / Party *</label>
                <select id="m-party" className="input" value={v.partyId} onChange={set("partyId")}>
                  <option value="">—</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="hint">{v.payMode === "UDHAAR" ? "Credit → a bill is added to this party's ledger automatically" : "Parties are managed under Masters"}</span>
              </div>
              <div className="field">
                <label htmlFor="m-bill">Bill / Challan no.</label>
                <input id="m-bill" className="input" value={v.billNo} onChange={set("billNo")} />
              </div>
              <div className="field">
                <label htmlFor="m-veh">Brought by / vehicle no.</label>
                <input id="m-veh" className="input" value={v.vehicle} onChange={set("vehicle")} />
              </div>
              {item?.tagPrefix && <p className="small muted">Each unit gets a number automatically ({item.tagPrefix}-01, {item.tagPrefix}-02 …).</p>}
            </>
          )}

          {(kind === "ISSUE" || kind === "CONSUME") && (
            <div className="field">
              <label htmlFor="m-purpose">For which work</label>
              <input id="m-purpose" className="input" value={v.purpose} onChange={set("purpose")} list="m-zones" placeholder="e.g. Footing F1, boundary wall" />
              <datalist id="m-zones">
                {(current?.zones ?? []).map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>
          )}
          {kind === "CONSUME" && contractorSelect(false)}

          {kind === "RETURN" && (
            <>
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Condition *</span>
                <div className="checks">
                  {COND.map(([k, l]) => (
                    <button type="button" key={k} className="tab" aria-pressed={v.condition === k} onClick={() => setV({ ...v, condition: k })}>{l}</button>
                  ))}
                </div>
                {lossy && <span className="hint">Broken / lost items do not come back to the store.</span>}
              </div>
              {lossy && (
                <div className="field">
                  <label htmlFor="m-rec">Recovery from contractor ₹</label>
                  <input id="m-rec" className="input" inputMode="decimal" value={v.recovery} onChange={(e) => { setRecoveryTouched(true); setV({ ...v, recovery: e.target.value }); }} placeholder="0 = no recovery" />
                  <span className="hint">{lastRate != null ? `Suggested: qty × last purchase rate ${formatINR(lastRate)}. ` : ""}Deducted in the contractor's ledger.</span>
                </div>
              )}
            </>
          )}

          {kind === "TRANSFER_OUT" && (
            <div className="field">
              <label htmlFor="m-to">To site *</label>
              <select id="m-to" className="input" value={v.toProject} onChange={set("toProject")}>
                <option value="">—</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="hint">{others.length ? "The other site's stock goes up automatically" : "You have no other site — ask the Admin"}</span>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="m-rm">Remark</label>
          <input id="m-rm" className="input" value={v.remark} onChange={set("remark")} />
        </div>
        {kind === "INWARD" && <p className="small muted">Bill photo: after saving, tap 📷 Bill on the entry.</p>}
        {row && (
          <div className="field">
            <label htmlFor="m-why">Reason for change *</label>
            <input id="m-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong quantity" />
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

/** Saman aaya form ke andar hi naya item master mein jodo */
function QuickItem({ onDone }: { onDone: (id: string | null) => void }) {
  const profile = useProfile();
  const toast = useToast();
  const [v, setV] = useState({ name: "", category: "RETURNABLE", unit: "Nos", tagPrefix: "", minStock: "" });
  const [busy, setBusy] = useState(false);
  const ok = v.name.trim().length >= 2;
  const add = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const data = {
        name: v.name.trim(), category: v.category, unit: v.unit,
        tagPrefix: v.tagPrefix.trim().toUpperCase() || null, minStock: v.minStock ? Number(v.minStock) : null,
      };
      const id = await saveMaster("masters_storeItems", null, data, profile.email, null, "CREATE", null);
      toast("Item added");
      onDone(id);
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card pad" style={{ display: "grid", gap: 10, background: "var(--surface-2)" }}>
      <b>New store item</b>
      <input className="input" placeholder="Item name, e.g. Rod cutter machine" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Item name" />
      <div className="checks">
        {[["RETURNABLE", "Returnable"], ["CONSUMABLE", "Consumable"]].map(([k, l]) => (
          <button type="button" key={k} className="tab" aria-pressed={v.category === k} onClick={() => setV({ ...v, category: k! })}>{l}</button>
        ))}
      </div>
      <div className="checks">
        {UNITS.map((u) => (
          <button type="button" key={u} className="tab" aria-pressed={v.unit === u} onClick={() => setV({ ...v, unit: u })}>{u}</button>
        ))}
      </div>
      {v.category === "RETURNABLE" ? (
        <input className="input" placeholder="Asset no. prefix for large items, e.g. RCM (optional)" value={v.tagPrefix} onChange={(e) => setV({ ...v, tagPrefix: e.target.value })} aria-label="Asset no. prefix" />
      ) : (
        <input className="input" inputMode="decimal" placeholder="Low-stock limit (optional)" value={v.minStock} onChange={(e) => setV({ ...v, minStock: e.target.value })} aria-label="Low-stock limit" />
      )}
      <div className="actions">
        <button type="button" className="btn sm" onClick={() => onDone(null)}>Cancel</button>
        <button type="button" className="btn sm primary" disabled={!ok || busy} onClick={add}>Add item</button>
      </div>
    </div>
  );
}

function ServiceForm({ row, tag, itemId, date, items, onClose }: { row: Entry | null; tag?: string; itemId?: string; date: string; items: MasterRow[]; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const assets = useProjCol(current?.id, "storeAssets").filter((a) => a.status !== "CANCELLED");
  const [v, setV] = useState({
    tag: (row?.tag as string) ?? tag ?? "",
    itemId: (row?.itemId as string) ?? itemId ?? "",
    kind: (row?.kind as string) ?? "SERVICE",
    cost: row?.costPaise != null ? String(row.costPaise / 100) : "",
    doneBy: (row?.doneBy as string) ?? "",
    remark: (row?.remark as string) ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const asset = assets.find((a) => a.id === v.tag);
  const effItem = asset?.itemId ?? v.itemId;
  const item = items.find((i) => i.id === effItem);
  const valid = !!effItem && (v.cost === "" || Number(v.cost) >= 0) && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const data = {
      businessDate: row?.businessDate ?? date, itemId: effItem, itemName: item?.name ?? asset?.itemName ?? null, tag: v.tag || null, kind: v.kind,
      costPaise: v.cost ? toPaise(Number(v.cost)) : null, doneBy: v.doneBy.trim() || null, remark: v.remark.trim() || null,
    };
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "storeService", id: row?.id, data, current: row, action: row ? "UPDATE" : "CREATE" }], row ? reason.trim() : null);
      toast("Saved ✓");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Service / repair${row ? " (edit)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="v-tag">Item no.</label>
            <select id="v-tag" className="input" value={v.tag} onChange={(e) => setV({ ...v, tag: e.target.value })}>
              <option value="">— not numbered —</option>
              {assets.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })).map((a) => (
                <option key={a.id} value={a.id}>{a.id} · {a.itemName}</option>
              ))}
            </select>
          </div>
          {!v.tag && (
            <div className="field">
              <label htmlFor="v-item">Item *</label>
              <select id="v-item" className="input" value={v.itemId} onChange={(e) => setV({ ...v, itemId: e.target.value })}>
                <option value="">— select —</option>
                {items.filter((i) => i.category !== "CONSUMABLE").map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Type</span>
            <div className="checks">
              {[["SERVICE", "Service"], ["REPAIR", "Repair"]].map(([k, l]) => (
                <button type="button" key={k} className="tab" aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k! })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="v-cost">Cost ₹</label>
            <input id="v-cost" className="input" inputMode="decimal" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="v-by">Done by (mechanic / shop)</label>
            <input id="v-by" className="input" value={v.doneBy} onChange={(e) => setV({ ...v, doneBy: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="v-rm">What was done</label>
          <input id="v-rm" className="input" value={v.remark} onChange={(e) => setV({ ...v, remark: e.target.value })} placeholder="e.g. blade changed, motor rewinding" />
        </div>
        {row && (
          <div className="field">
            <label htmlFor="v-why">Reason for change *</label>
            <input id="v-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
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
