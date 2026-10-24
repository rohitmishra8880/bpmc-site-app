import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatQty, toBusinessDateIST, type DayItemBalance } from "@bpmc/core";
import { useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

interface DayDoc {
  stock?: Record<string, DayItemBalance>;
  stockComputedAt?: { toDate(): Date };
}

export function Dashboard() {
  const profile = useProfile();
  const { current, loading } = useProjects();
  const today = toBusinessDateIST(new Date());
  const [day, setDay] = useState<DayDoc | null>(null);

  useEffect(() => {
    if (!current) return;
    setDay(null);
    // Number sirf server ke hisab (days/) se — phone khud nahi jodta
    return onSnapshot(doc(db, "projects", current.id, "days", today), (s) => setDay((s.data() as DayDoc) ?? {}));
  }, [current, today]);

  if (loading) return <p className="muted">Load ho raha hai…</p>;
  if (!current)
    return (
      <div className="card empty">
        <h2>Namaste {profile.name}</h2>
        <p style={{ marginTop: 8 }}>{profile.isAdmin ? "Abhi koi project nahi hai — Projects mein pehla project jodo." : "Aapko abhi koi project nahi diya gaya. Admin se kahiye."}</p>
      </div>
    );

  const diesel = day?.stock?.["diesel"];
  const computed = day?.stockComputedAt?.toDate();

  return (
    <>
      <PageHead title="Dashboard Overview" sub={`${current.name} · ${formatDate(today)} — sab number asli entries se`} />
      <div className="stats">
        <div className="card stat">
          <span className="lab">Aaj ki haazri</span>
          <span className="num">—</span>
          <span className="foot">Attendance Phase 2 mein</span>
        </div>
        <div className="card stat">
          <span className="lab">Diesel baaki</span>
          <span className="num">
            {diesel ? formatQty(diesel.closing, 1) : "—"}
            {diesel && <small>Ltr</small>}
          </span>
          <span className="foot">
            {diesel
              ? `${formatQty(diesel.opening, 1)} + ${formatQty(diesel.inward, 1)} − ${formatQty(diesel.uses, 1)}`
              : "Aaj ka hisab abhi nahi bana (koi entry nahi)"}
          </span>
        </div>
        <div className="card stat">
          <span className="lab">Kaam ki pragati</span>
          <span className="num">—</span>
          <span className="foot">Daily Work Phase 2 mein</span>
        </div>
        <div className="card stat">
          <span className="lab">Chalu machine</span>
          <span className="num">—</span>
          <span className="foot">Machinery Phase 2 mein</span>
        </div>
      </div>
      <div className="mods">
        <Link className="card mod" to="/work"><span className="bubble">📅</span><b>Daily Work</b><span>M³, Sq M, Kg, photo</span></Link>
        <Link className="card mod" to="/inventory"><span className="bubble">📦</span><b>Inventory</b><span>Maal aaya, kharch, baaki</span></Link>
        <Link className="card mod" to="/store"><span className="bubble">🧰</span><b>Saman Register</b><span>Auzaar issue / wapas</span></Link>
        <Link className="card mod" to="/attendance"><span className="bubble">👥</span><b>Attendance</b><span>Staff + thekedar</span></Link>
        <Link className="card mod" to="/machinery"><span className="bubble">🔧</span><b>Machinery</b><span>SR / CR, diesel</span></Link>
      </div>
      <p className="small muted">
        {computed ? `Server ne aakhri hisab ${computed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} par kiya.` : "Server ka hisab har 5 minute mein chalta hai."}
      </p>
    </>
  );
}
