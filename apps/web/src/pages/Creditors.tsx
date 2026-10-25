// Creditors / Party Ledger: bill, bhugtan (mode / account / ref), debit note. Bakaya + overdue server (ledgerSummary) banata hai.
// Udhaar maal (Inventory / Store) ka bill aur thekedar ki katauti server khud jodta hai — woh yahan badle nahi jaate.
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { canEditDate, formatDate, formatINR, lineAmount, runningLedger, toBusinessDateIST, toPaise, type PartyStatus } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { softDeleteWrite, useUnlock, useUnlocks, writeEntries, type Entry } from "../lib/entries";
import { db } from "../lib/firebase";
import { useMaster, type MasterRow } from "../lib/masters";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, ReasonDialog, useToast } from "../lib/ui";
import { PaymentFields, payData, payStateValid, type PayState } from "./LabourWeek";

type Kind = "BILL" | "PAYMENT" | "DEBIT_NOTE";
const TYPE_LABEL: Record<string, string> = { BILL: "Bill", PAYMENT: "Payment", DEBIT_NOTE: "Debit note", RECOVERY: "Recovery" };
const SOURCE_LABEL = (src?: string) => (src?.startsWith("stockMoves") ? "Auto · Inventory credit" : src?.startsWith("storeMoves") ? "Auto · Store" : "Auto");

interface Summary {
  asOf: string;
  parties: Record<string, PartyStatus & { name: string; kind: "PARTY" | "CONTRACTOR"; creditDays: number | null }>;
  totals: { billPaise: number; paidPaise: number; bakayaPaise: number; toRecoverPaise?: number; overduePaise: number };
}

export function Creditors() {
  const profile = useProfile();
  const { current } = useProjects();
  const parties = useMaster("masters_parties");
  const contractors = useMaster("masters_contractors");
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const [sum, setSum] = useState<Summary | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: Kind; partyId: string; row: Entry | null } | null>(null);
  const [filter, setFilter] = useState<"all" | "due" | "overdue">("all");
  const unlock = useUnlock(current?.id, date);

  useEffect(() => {
    if (!current) return;
    setSum(undefined);
    return onSnapshot(doc(db, "projects", current.id, "ledgerSummary", "current"), (s) => setSum(s.exists() ? (s.data() as Summary) : null));
  }, [current]);

  if (!current) return <div className="card empty">Select a project first.</div>;
  const canAdd = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? contractors.find((c) => c.id === id)?.name ?? sum?.parties?.[id]?.name ?? id;
  const rows = Object.entries(sum?.parties ?? {})
    .filter(([, s]) => (filter === "all" ? true : filter === "due" ? s.bakayaPaise > 0 : s.overduePaise > 0))
    .sort((a, b) => b[1].overduePaise - a[1].overduePaise || b[1].bakayaPaise - a[1].bakayaPaise);
  const t = sum?.totals;

  return (
    <>
      <DateBar title="Creditors / Party Ledger" sub={`${current.name} — bills, payments and bakaya (outstanding)`} date={date} onChange={setDate} unlockedTill={unlock} />
      <PageHead title="Party ledger" sub="Bakaya = total bills − total paid (− debit notes / recoveries). Credit-period overdue is shown in red.">
        <Link className="btn" to="/reports?r=ledger">⬇ PDF</Link>
        {canAdd && (
          <>
            <button className="btn dark" onClick={() => setForm({ kind: "BILL", partyId: "", row: null })}>＋ Bill</button>
            <button className="btn primary" onClick={() => setForm({ kind: "PAYMENT", partyId: "", row: null })}>＋ Payment</button>
            <button className="btn" onClick={() => setForm({ kind: "DEBIT_NOTE", partyId: "", row: null })}>＋ Debit note</button>
          </>
        )}
      </PageHead>
      <div className="stats">
        <Stat label="Total bills" v={t?.billPaise} foot="All parties, this site" />
        <Stat label="Total paid" v={t?.paidPaise} foot="Cash / UPI / NEFT / RTGS / Cheque" />
        <Stat label="Bakaya" v={t?.bakayaPaise} foot={t?.toRecoverPaise ? `To pay · to recover / advance ${formatINR(t.toRecoverPaise)}` : "Outstanding to pay"} />
        <Stat label="Overdue" v={t?.overduePaise} foot={sum ? `Past credit period · as on ${formatDate(sum.asOf)}` : "Calculated by server"} crit={!!t?.overduePaise} />
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Parties & contractors</h2>
          <div className="checks">
            {(
              [
                ["all", "All"],
                ["due", "Bakaya"],
                ["overdue", "Overdue"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className="tab" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Party</th>
                <th>Credit</th>
                <th className="r">Bills</th>
                <th className="r">Paid</th>
                <th className="r">Less (DN / recovery)</th>
                <th className="r">Bakaya</th>
                <th>Overdue</th>
                <th>Last payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, s]) => (
                <tr key={id}>
                  <td>
                    <b>{s.name ?? nameOf(id)}</b>
                    {s.kind === "CONTRACTOR" && <span className="pill neutral" style={{ marginLeft: 6, fontSize: 11 }}>Contractor</span>}
                  </td>
                  <td>{s.creditDays != null ? `${s.creditDays} days` : "—"}</td>
                  <td className="r">{formatINR(s.billPaise)}</td>
                  <td className="r">{formatINR(s.paidPaise)}</td>
                  <td className="r">{s.lessPaise ? formatINR(s.lessPaise) : "—"}</td>
                  <td className="r" style={{ fontWeight: 800, color: s.bakayaPaise < 0 ? "var(--info)" : undefined }}>{formatINR(s.bakayaPaise)}</td>
                  <td>{s.overduePaise ? <span className="pill crit">{formatINR(s.overduePaise)} · {s.overdueDays} days</span> : <span className="pill ok">On time</span>}</td>
                  <td>{s.lastPayment ? formatDate(s.lastPayment) : "—"}</td>
                  <td className="r"><button className="btn sm" onClick={() => setOpen(id)}>Khata</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sum === undefined ? <div className="empty">Loading…</div> : rows.length === 0 && <div className="empty">{sum ? "No party in this filter" : "No bills or payments yet — add a bill, or buy material on credit in Inventory / Store."}</div>}
        </div>
        <p className="note">− Bakaya (blue) = advance paid / to recover from the party. Overdue = bill not cleared within the party's credit period (Masters → Parties). Oldest bill is cleared first.</p>
      </section>

      {open && (
        <KhataDialog
          pid={current.id}
          partyId={open}
          name={nameOf(open)}
          status={sum?.parties?.[open] ?? null}
          canAdd={canAdd}
          onAdd={(kind) => setForm({ kind, partyId: open, row: null })}
          onEdit={(row) => setForm({ kind: row.type as Kind, partyId: open, row })}
          onClose={() => setOpen(null)}
        />
      )}
      {form && <EntryForm kind={form.kind} partyId={form.partyId} row={form.row} date={date} parties={parties} contractors={contractors} status={sum?.parties ?? {}} onClose={() => setForm(null)} />}
    </>
  );
}

function Stat({ label, v, foot, crit }: { label: string; v: number | undefined; foot: string; crit?: boolean }) {
  return (
    <div className="card stat" style={crit ? { borderColor: "var(--crit)" } : undefined}>
      <span className="lab">{label}</span>
      <span className="num" style={{ fontSize: 26 }}>{v === undefined ? "—" : formatINR(v)}</span>
      <span className="foot">{foot}</span>
    </div>
  );
}

function KhataDialog({ pid, partyId, name, status, canAdd, onAdd, onEdit, onClose }: {
  pid: string;
  partyId: string;
  name: string;
  status: PartyStatus | null;
  canAdd: boolean;
  onAdd: (k: Kind) => void;
  onEdit: (row: Entry) => void;
  onClose: () => void;
}) {
  const profile = useProfile();
  const toast = useToast();
  const unlocks = useUnlocks(pid);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  useEffect(
    () => onSnapshot(query(collection(db, "projects", pid, "ledger"), where("partyId", "==", partyId)), (s) => setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry))),
    [pid, partyId],
  );
  const lines = useMemo(() => runningLedger((rows ?? []).map((r) => ({ id: r.id, businessDate: r.businessDate, type: r.type, amountPaise: r.amountPaise ?? 0, deleted: r.deleted }))), [rows]);
  const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
  const editable = (r: Entry) =>
    r.createdBy !== "server" && can(profile, "entry.edit") && canEditDate(r.businessDate, new Date(), unlocks[r.businessDate] ? { expiresAt: unlocks[r.businessDate]! } : null);
  const remove = async (e: Entry, reason: string) => {
    try {
      await writeEntries(pid, profile.email, [softDeleteWrite("ledger", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin");
    } catch (err) {
      toast(errorText(err), true);
    }
  };
  return (
    <Dialog title={`Khata — ${name}`} onClose={onClose}>
      <div className="form">
        <div className="actions">
          {status && (
            <span className={`pill ${status.overduePaise ? "crit" : status.bakayaPaise > 0 ? "warn" : "ok"}`}>
              Bakaya {formatINR(status.bakayaPaise)}
              {status.overduePaise ? ` · overdue ${formatINR(status.overduePaise)}` : ""}
            </span>
          )}
          <Link className="btn sm" to={`/reports?r=ledger&p=${partyId}`}>⬇ PDF</Link>
          {canAdd && (
            <>
              <button className="btn sm" onClick={() => onAdd("BILL")}>＋ Bill</button>
              <button className="btn sm primary" onClick={() => onAdd("PAYMENT")}>＋ Payment</button>
              <button className="btn sm" onClick={() => onAdd("DEBIT_NOTE")}>＋ Debit note</button>
            </>
          )}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Details</th>
                <th className="r">Bill</th>
                <th className="r">Paid / less</th>
                <th className="r">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const r = byId[l.id]!;
                return (
                  <tr key={l.id}>
                    <td>{formatDate(l.businessDate)}</td>
                    <td>
                      {TYPE_LABEL[l.type] ?? l.type}
                      {r.serverStatus === "PENDING" && " ⏳"}
                    </td>
                    <td className="wrap small">
                      {[
                        r.createdBy === "server" && SOURCE_LABEL(r.source),
                        r.itemName,
                        r.billNo && `Bill ${r.billNo}`,
                        r.description,
                        r.mode,
                        r.accountName,
                        r.refNo && `Ref ${r.refNo}`,
                        r.remark,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td className="r">{l.debitPaise ? formatINR(l.debitPaise) : ""}</td>
                    <td className="r">{l.creditPaise ? formatINR(l.creditPaise) : ""}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{formatINR(l.balancePaise)}</td>
                    <td className="r">
                      {editable(r) ? (
                        <span className="actions">
                          <button className="btn sm" onClick={() => onEdit(r)} aria-label="Edit">✎</button>
                          <button className="btn sm danger" onClick={() => setRemoving(r)} aria-label="Delete">🗑</button>
                        </span>
                      ) : r.createdBy === "server" ? (
                        <span className="small muted">Edit the source entry</span>
                      ) : (
                        <span title="Day locked — Admin can reopen">🔒</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows === null ? <div className="empty">Loading…</div> : lines.length === 0 && <div className="empty">No entries yet</div>}
        </div>
      </div>
      {removing && (
        <ReasonDialog
          title="Delete this ledger entry?"
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const e = removing;
            setRemoving(null);
            void remove(e, reason);
          }}
        />
      )}
    </Dialog>
  );
}

function EntryForm({ kind, partyId, row, date, parties, contractors, status, onClose }: {
  kind: Kind;
  partyId: string;
  row: Entry | null;
  date: string;
  parties: MasterRow[];
  contractors: MasterRow[];
  status: Summary["parties"];
  onClose: () => void;
}) {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const accounts = useMaster("masters_companyAccounts");
  const [v, setV] = useState({
    partyId: (row?.partyId as string) ?? partyId,
    amount: row ? String(((kind === "BILL" ? row.basePaise ?? row.amountPaise : row.amountPaise) ?? 0) / 100) : "",
    gst: row?.gstPct != null ? String(row.gstPct) : "",
    billNo: (row?.billNo as string) ?? "",
    description: (row?.description as string) ?? "",
    remark: (row?.remark as string) ?? "",
  });
  const [pay, setPay] = useState<PayState>({ mode: (row?.mode as string) ?? "CASH", accountId: (row?.accountId as string) ?? "", refNo: (row?.refNo as string) ?? "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const amt = Number(v.amount);
  const amtOk = v.amount !== "" && Number.isFinite(amt) && amt > 0;
  const gst = Number(v.gst) || 0;
  const bill = kind === "BILL" && amtOk ? lineAmount(1, toPaise(amt), gst) : null;
  const isContractor = contractors.some((c) => c.id === v.partyId);
  const bakaya = status[v.partyId]?.bakayaPaise;
  const valid =
    !!v.partyId && amtOk && gst >= 0 && gst <= 100 &&
    (kind !== "PAYMENT" || payStateValid(pay)) &&
    (kind !== "DEBIT_NOTE" || v.remark.trim().length >= 3) &&
    (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    const name = parties.find((p) => p.id === v.partyId)?.name ?? contractors.find((c) => c.id === v.partyId)?.name ?? null;
    const base = { businessDate: row?.businessDate ?? date, type: kind, partyId: v.partyId, partyName: name, partyKind: isContractor ? "CONTRACTOR" : "PARTY", remark: v.remark.trim() || null };
    const data =
      kind === "BILL"
        ? { ...base, amountPaise: bill!.totalPaise, basePaise: bill!.basePaise, gstPct: gst || null, gstPaise: bill!.gstPaise, billNo: v.billNo.trim() || null, description: v.description.trim() || null }
        : kind === "PAYMENT"
          ? { ...base, amountPaise: toPaise(amt), ...payData(pay, accounts) }
          : { ...base, amountPaise: toPaise(amt) };
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "ledger", id: row?.id, data, current: row, action: row ? "UPDATE" : "CREATE" }], row ? reason.trim() : null);
      toast(navigator.onLine ? "Saved ✓ · server is calculating ⏳" : "Saved on this phone — will sync when online");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  const title = { BILL: "Bill (purchase / work bill)", PAYMENT: "Payment to party", DEBIT_NOTE: "Debit note (less from bill)" }[kind];
  return (
    <Dialog title={`${title}${row ? " (edit)" : ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="c-party">Party / contractor *</label>
            <select id="c-party" className="input" value={v.partyId} onChange={(e) => setV({ ...v, partyId: e.target.value })} disabled={!!row}>
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
            {bakaya != null && <span className="hint">Current bakaya: {formatINR(bakaya)}</span>}
          </div>
          <div className="field">
            <label htmlFor="c-amt">{kind === "BILL" ? "Amount before GST ₹ *" : "Amount ₹ *"}</label>
            <input id="c-amt" className="input" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} style={{ fontSize: 22, fontWeight: 700 }} />
            {kind === "PAYMENT" && amtOk && bakaya != null && toPaise(amt) > bakaya + (row ? (row.amountPaise ?? 0) : 0) && (
              <span className="warn">More than the bakaya — the extra will show as advance</span>
            )}
          </div>
          {kind === "BILL" && (
            <>
              <div className="field">
                <label htmlFor="c-gst">GST %</label>
                <input id="c-gst" className="input" inputMode="decimal" value={v.gst} onChange={(e) => setV({ ...v, gst: e.target.value })} placeholder="0" />
                {bill && <span className="hint">Total = <b>{formatINR(bill.totalPaise)}</b>{bill.gstPaise ? ` (GST ${formatINR(bill.gstPaise)})` : ""}</span>}
              </div>
              <div className="field">
                <label htmlFor="c-bill">Bill no.</label>
                <input id="c-bill" className="input" value={v.billNo} onChange={(e) => setV({ ...v, billNo: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="c-desc">For what</label>
                <input id="c-desc" className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="e.g. 200 bags cement, RA bill 1" />
              </div>
            </>
          )}
          {kind === "PAYMENT" && <PaymentFields v={pay} setV={setPay} accounts={accounts} />}
        </div>
        <div className="field">
          <label htmlFor="c-rm">{kind === "DEBIT_NOTE" ? "Reason *" : "Remark"}</label>
          <input id="c-rm" className="input" value={v.remark} onChange={(e) => setV({ ...v, remark: e.target.value })} placeholder={kind === "DEBIT_NOTE" ? "e.g. 10 bags returned damaged" : ""} />
        </div>
        {kind === "BILL" && <p className="small muted">Material bought on credit in Inventory / Store is added here automatically — don't enter it again.</p>}
        {row && (
          <div className="field">
            <label htmlFor="c-why">Reason for change *</label>
            <input id="c-why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
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
