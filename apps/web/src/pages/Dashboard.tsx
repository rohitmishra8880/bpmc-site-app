import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatHours, formatQty, formatQtyShort, toBusinessDateIST, type DayItemBalance, type WorkTotals, type WorkType } from "@bpmc/core";
import { KIND_IC, SEV_PILL, useAlerts } from "../lib/alerts";
import { useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

interface DayDoc {
  stock?: Record<string, DayItemBalance>;
  stockComputedAt?: { toDate(): Date };
  machineTotals?: { running: number; breakdown: number; hours: number; dieselLtr: number };
  labour?: { totals: { mistri: number; kuli: number; reja: number; total: number } };
  staff?: { present: number; halfDay: number; absent: number; marked: number };
  work?: WorkTotals;
}

const WORK_ORDER: [WorkType, string][] = [["CONCRETE", "Concrete"], ["EXCAVATION", "Excavation"], ["SHUTTERING", "Shuttering"], ["STEEL", "Steel"]];

/** Dashboard v3 — light: safed card + rangeen border; dark: gradient + glow (Rohit ki image). Har number server ke hisab se. */
export function Dashboard() {
  const profile = useProfile();
  const { current, loading } = useProjects();
  const today = toBusinessDateIST(new Date());
  const [day, setDay] = useState<DayDoc | null>(null);
  // Alerts: server ki ek hi list (alerts/current) — ghanti aur Alerts page bhi yahi padhte hain
  const { items: alerts } = useAlerts(current?.id);

  useEffect(() => {
    if (!current) return;
    setDay(null);
    // Numbers only from the server calculation (days/) — the phone never adds them up
    return onSnapshot(doc(db, "projects", current.id, "days", today), (s) => setDay((s.data() as DayDoc) ?? {}));
  }, [current, today]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!current)
    return (
      <div className="card empty">
        <h2>Welcome, {profile.name}</h2>
        <p style={{ marginTop: 8 }}>{profile.isAdmin ? "No projects yet — add the first one under Projects." : "No project has been assigned to you yet. Please ask the Admin."}</p>
      </div>
    );

  const diesel = day?.stock?.["diesel"];
  const mt = day?.machineTotals;
  const computed = day?.stockComputedAt?.toDate();
  const staffToday = day?.staff ? day.staff.present + day.staff.halfDay : 0;
  const lt = day?.labour?.totals;
  const hasAtt = !!(day?.labour || day?.staff);
  const workParts = WORK_ORDER.flatMap(([k, label]) => (day?.work?.byType?.[k] ? [{ label, qty: day.work.byType[k]!.qty, unit: day.work.byType[k]!.unit }] : []));

  return (
    <>
      <PageHead title="Dashboard Overview" sub={`${current.name} · ${formatDate(today)} — every number comes from real entries`} />
      <div className="kpis">
        <Link className="kpi t-blue" to="/attendance">
          <span className="lab">Today's attendance</span>
          <span className="num">
            {hasAtt ? (lt?.total ?? 0) + staffToday : "—"}
            {hasAtt && <small>people</small>}
          </span>
          <span className="foot">
            {hasAtt ? `${staffToday} staff · ${lt?.total ?? 0} labour (M ${lt?.mistri ?? 0} · K ${lt?.kuli ?? 0} · R ${lt?.reja ?? 0})` : "No attendance entered today"}
          </span>
          {hasAtt && <Bars values={[staffToday, lt?.mistri ?? 0, lt?.kuli ?? 0, lt?.reja ?? 0]} />}
        </Link>
        <Link className="kpi t-coral" to="/inventory">
          <span className="lab">Diesel balance</span>
          <span className="num">
            {diesel ? formatQty(diesel.closing, 1) : "—"}
            {diesel && <small>L</small>}
          </span>
          <span className="foot">
            {diesel ? `${formatQtyShort(diesel.opening)} + ${formatQtyShort(diesel.inward)} − ${formatQtyShort(diesel.uses)}` : "No calculation for today yet (no entries)"}
          </span>
          <Gauge part={diesel ? diesel.closing : 0} whole={diesel ? diesel.opening + diesel.inward : 0} />
        </Link>
        <Link className="kpi t-teal" to="/work">
          <span className="lab">Work progress</span>
          {workParts.length ? (
            <>
              <span className="num">
                {formatQtyShort(workParts[0]!.qty)}
                <small>{workParts[0]!.unit} {workParts[0]!.label.toLowerCase()}</small>
              </span>
              <span className="foot">{workParts.length > 1 ? workParts.slice(1).map((x) => `${x.label} ${formatQtyShort(x.qty)} ${x.unit}`).join(" · ") : "Today"}</span>
            </>
          ) : (
            <>
              <span className="num">—</span>
              <span className="foot">No work entered today</span>
            </>
          )}
          <span className="deco" aria-hidden="true" style={{ fontSize: 44, opacity: 0.5 }}>📐</span>
        </Link>
        <Link className={`kpi t-violet ${mt?.breakdown ? "alarm" : ""}`} to="/machinery">
          <span className="lab">Machines running</span>
          <span className="num">{mt ? mt.running : "—"}</span>
          <span className="foot">{mt ? `${formatHours(mt.hours)} total · ${mt.breakdown} breakdown` : "No machine log today yet"}</span>
          <Pulse />
        </Link>
      </div>

      {alerts.length > 0 && (
        <section className="card alerts-card" style={{ borderColor: alerts.some((a) => a.severity === "crit") ? "var(--crit)" : "var(--warn)" }}>
          <div className="card-head">
            <h2>⚠️ Critical alerts</h2>
            <Link className={`pill ${alerts.some((a) => a.severity === "crit") ? "crit" : "warn"}`} to="/alerts">{alerts.length} active →</Link>
          </div>
          {alerts.slice(0, 6).map((a) => (
            <Link key={a.key} className="row" to={a.link}>
              {KIND_IC[a.kind]}
              <span style={{ flex: 1 }}>{a.text}</span>
              <span className={`pill ${SEV_PILL[a.severity]}`}>{a.title}</span>
            </Link>
          ))}
          {alerts.length > 6 && (
            <Link className="row" to="/alerts">
              … and {alerts.length - 6} more — see all alerts
            </Link>
          )}
        </section>
      )}

      <div className="dash-mods">
        <Mod tone="t-sky" to="/work" ic="📅" title="Daily Work" sub="M³, Sq M, Kg, photos" />
        <Mod tone="t-orange" to="/inventory" ic="📦" title="Inventory" sub="Received, used, balance" />
        <Mod tone="t-mint" to="/store" ic="🧰" title="Store Register" sub="Tools issued / returned" />
        <Mod tone="t-purple" to="/attendance" ic="👥" title="Attendance" sub="Staff + contractor muster" />
        <Mod tone="t-indigo" to="/machinery" ic="🔧" title="Machinery" sub="SR / CR, diesel, breakdowns" />
        <Mod tone="t-gold" to="/creditors" ic="📒" title="Creditors" sub="Bills, payments, bakaya" />
        <Mod tone="t-violet" to="/dpr" ic="📝" title="Daily Report (DPR)" sub="Lock, PDF, WhatsApp" />
        <Mod tone="t-coral" to="/alerts" ic="🔔" title="Alerts" sub="Breakdown, low stock, overdue" />
        <Mod tone="t-slate" to="/reports" ic="📄" title="Reports & PDF" sub="Every hisab as a PDF" />
      </div>
      <p className="small muted">
        {computed ? `Server last calculated at ${computed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.` : "The server recalculates every 5 minutes."}
      </p>
    </>
  );
}

function Mod({ tone, to, ic, title, sub, soon }: { tone: string; to: string; ic: string; title: string; sub: string; soon?: boolean }) {
  return (
    <Link className={`dmod ${tone}`} to={to}>
      <span className="tile" aria-hidden="true">{ic}</span>
      <span className="ghost" aria-hidden="true">{ic}</span>
      <b>{title}</b>
      <span className="sub">{sub}</span>
      {soon && <span className="pill neutral" style={{ fontSize: 11 }}>Coming in Phase 2</span>}
    </Link>
  );
}

/** Asli gin-ti: Staff / Mistri / Kuli / Reja */
function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg className="deco" width="76" height="46" viewBox="0 0 76 46" role="img" aria-label={`Staff ${values[0]}, Mistri ${values[1]}, Kuli ${values[2]}, Reja ${values[3]}`}>
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * 42);
        return <rect key={i} x={4 + i * 18} y={44 - h} width="12" height={h} rx="3" fill="currentColor" opacity={0.45 + i * 0.15} />;
      })}
    </svg>
  );
}

/** Kitna diesel bacha: closing ÷ (opening + aaya) */
function Gauge({ part, whole }: { part: number; whole: number }) {
  const f = whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
  const len = Math.PI * 30;
  return (
    <svg className="deco" width="78" height="46" viewBox="0 0 78 46" role="img" aria-label={whole > 0 ? `${Math.round(f * 100)}% of today's diesel left` : "No diesel today"}>
      <path d="M9 40 A30 30 0 0 1 69 40" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="9" strokeLinecap="round" />
      {f > 0 && <path d="M9 40 A30 30 0 0 1 69 40" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${f * len} ${len}`} />}
    </svg>
  );
}

function Pulse() {
  return (
    <svg className="deco" width="80" height="40" viewBox="0 0 80 40" aria-hidden="true">
      <path d="M2 22 H24 L30 10 L38 34 L46 4 L53 26 L58 22 H78" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
