import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatHours, formatQty, toBusinessDateIST, type DayItemBalance } from "@bpmc/core";
import { useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

interface DayDoc {
  stock?: Record<string, DayItemBalance>;
  stockComputedAt?: { toDate(): Date };
  machineTotals?: { running: number; breakdown: number; hours: number; dieselLtr: number };
}

export function Dashboard() {
  const profile = useProfile();
  const { current, loading } = useProjects();
  const today = toBusinessDateIST(new Date());
  const [day, setDay] = useState<DayDoc | null>(null);

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

  return (
    <>
      <PageHead title="Dashboard Overview" sub={`${current.name} · ${formatDate(today)} — every number comes from real entries`} />
      <div className="stats">
        <div className="card stat">
          <span className="lab">Today's attendance</span>
          <span className="num">—</span>
          <span className="foot">Attendance coming in Phase 2</span>
        </div>
        <Link className="card stat" to="/inventory">
          <span className="lab">Diesel balance</span>
          <span className="num">
            {diesel ? formatQty(diesel.closing, 1) : "—"}
            {diesel && <small>L</small>}
          </span>
          <span className="foot">
            {diesel ? `${formatQty(diesel.opening, 1)} + ${formatQty(diesel.inward, 1)} − ${formatQty(diesel.uses, 1)}` : "No calculation for today yet (no entries)"}
          </span>
        </Link>
        <div className="card stat">
          <span className="lab">Work progress</span>
          <span className="num">—</span>
          <span className="foot">Daily Work coming in Phase 2</span>
        </div>
        <Link className="card stat" to="/machinery" style={mt?.breakdown ? { borderColor: "var(--crit)" } : undefined}>
          <span className="lab">Machines running</span>
          <span className="num">{mt ? mt.running : "—"}</span>
          <span className="foot">{mt ? `${formatHours(mt.hours)} total · ${mt.breakdown} breakdown` : "No machine log today yet"}</span>
        </Link>
      </div>
      <div className="mods">
        <Link className="card mod" to="/work"><span className="bubble">📅</span><b>Daily Work</b><span>M³, Sq M, Kg, photos</span></Link>
        <Link className="card mod" to="/inventory"><span className="bubble">📦</span><b>Inventory</b><span>Received, used, balance</span></Link>
        <Link className="card mod" to="/store"><span className="bubble">🧰</span><b>Store Register</b><span>Tools issued / returned</span></Link>
        <Link className="card mod" to="/attendance"><span className="bubble">👥</span><b>Attendance</b><span>Staff + contractor muster</span></Link>
        <Link className="card mod" to="/machinery"><span className="bubble">🔧</span><b>Machinery</b><span>SR / CR, diesel, breakdowns</span></Link>
      </div>
      <p className="small muted">
        {computed ? `Server last calculated at ${computed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.` : "The server recalculates every 5 minutes."}
      </p>
    </>
  );
}
