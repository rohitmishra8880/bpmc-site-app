import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { formatDate, toBusinessDateIST } from "@bpmc/core";
import { KIND_IC, SEV_PILL, useNotifications, whenText } from "../lib/alerts";
import { can, logout, useProfile } from "../lib/auth";
import { APP_ENV } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import type { Permission } from "../lib/types";
import { Logo } from "./Logo";

interface NavItem {
  to: string;
  ic: string;
  label: string;
  /** Kis phase mein aayega (abhi nahi bana) */
  soon?: string;
  perm?: Permission;
  adminOnly?: boolean;
}

const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { to: "/", ic: "▦", label: "Dashboard" },
      { to: "/projects", ic: "🗂️", label: "Projects" },
      { to: "/inventory", ic: "📦", label: "Inventory (Material Hub)" },
      { to: "/store", ic: "🧰", label: "Store Register" },
      { to: "/machinery", ic: "🔧", label: "Machinery" },
      { to: "/attendance", ic: "👥", label: "Attendance" },
      { to: "/work", ic: "📅", label: "Daily Work" },
      { to: "/creditors", ic: "📒", label: "Creditors / Party Ledger" },
      { to: "/dpr", ic: "📝", label: "Daily Report (DPR)" },
      { to: "/alerts", ic: "🔔", label: "Alerts & Notifications" },
      { to: "/reports", ic: "📄", label: "Reports & PDF" },
    ],
  },
  { group: "Master data", items: [{ to: "/masters", ic: "📋", label: "Masters" }] },
  {
    group: "Help",
    items: [
      { to: "/ai", ic: "✨", label: "AI Insights", soon: "P4" },
      { to: "/help", ic: "❔", label: "Help Center" },
    ],
  },
  {
    group: "Admin",
    items: [
      { to: "/users", ic: "🛡️", label: "Users & Roles", adminOnly: true },
      { to: "/history", ic: "🕘", label: "Edit History", perm: "audit.read" },
      { to: "/bin", ic: "🗑️", label: "Recycle Bin", perm: "recycle.restore" },
      { to: "/settings", ic: "⚙️", label: "Settings & Backup", adminOnly: true },
    ],
  },
];

const THEMES = [null, "dark", "light", "sun"] as const;

export function Shell() {
  const profile = useProfile();
  const { projects, current, select } = useProjects();
  const [open, setOpen] = useState(false);
  const [ti, setTi] = useState(0);
  const loc = useLocation();
  const [online, setOnline] = useState(navigator.onLine);

  const [bellOpen, setBellOpen] = useState(false);
  const notif = useNotifications(current?.id);

  useEffect(() => {
    setOpen(false);
    setBellOpen(false);
  }, [loc.pathname]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const cycleTheme = () => {
    const n = (ti + 1) % THEMES.length;
    setTi(n);
    const t = THEMES[n];
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  };

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <button className="icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="logo">
            <Logo size={46} />
            <div>
              <b>BP Mishra &amp; Co.</b>
              <span>INFRASTRUCTURE &amp; CONSTRUCTION</span>
            </div>
          </div>
          {projects.length > 0 && (
            <select className="site-sel" value={current?.id ?? ""} onChange={(e) => select(e.target.value)} aria-label="Switch site">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  🏢 {p.name}
                </option>
              ))}
            </select>
          )}
          <span className="spacer" />
          {APP_ENV === "test" && <span className="pill warn">TEST</span>}
          <span className={`pill ${online ? "ok" : "warn"}`}>
            <span className="dot" />
            {online ? "Online" : "Offline — entries saved on phone"}
          </span>
          <span className="when">{formatDate(toBusinessDateIST(new Date()))}</span>
          <button
            className="icon bell"
            onClick={() => {
              const was = notif.unread;
              setBellOpen((o) => !o);
              // Kholte hi "dekh liya" — number tab hi ghatega jab sach mein dekha
              if (!bellOpen && was > 0) void notif.markSeen();
            }}
            aria-label={notif.unread ? `Notifications: ${notif.unread} new` : "Notifications"}
            aria-expanded={bellOpen}
          >
            🔔
            {notif.unread > 0 && <span className="badge">{notif.unread > 99 ? "99+" : notif.unread}</span>}
          </button>
          <button className="icon" onClick={cycleTheme} aria-label="Theme: light / dark / sunlight">
            ◐
          </button>
          <button className="avatar" title={`${profile.name} · ${profile.isAdmin ? "Admin" : profile.role} — click to sign out`} onClick={() => logout()}>
            {initials || "?"}
          </button>
        </div>
      </header>
      {bellOpen && <BellPanel list={notif.list} seenAt={notif.seenAt} onClose={() => setBellOpen(false)} />}
      <div className="layout">
        <aside className={`side ${open ? "open" : ""}`} aria-label="Menu">
          <div className="proj-card">
            <Logo size={40} />
            <div>
              <b>{current?.name ?? "No project"}</b>
              <span>{current ? `${current.code} · Site` : "Ask the Admin for a project"}</span>
            </div>
          </div>
          <nav>
            {NAV.map((g) => {
              const items = g.items.filter((i) => (i.adminOnly ? profile.isAdmin : i.perm ? can(profile, i.perm) : true));
              if (!items.length) return null;
              return (
                <div key={g.group ?? "main"}>
                  {g.group && <div className="nav-group">{g.group}</div>}
                  {items.map((i) => (
                    <NavLink key={i.to} to={i.to} end={i.to === "/"} className={({ isActive }) => `nav ${isActive ? "active" : ""}`}>
                      <span className="ic">{i.ic}</span>
                      {i.label}
                      {i.soon && <span className="tag">{i.soon}</span>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <main className={loc.pathname === "/" ? "watermark" : undefined}>
          <div className="view">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}

/** Section not built yet — say clearly when it comes (no dummy data) */
export function Soon({ title, phase, what }: { title: string; phase: string; what: string }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="sub">{what}</p>
        </div>
      </div>
      <div className="card empty">
        <p>
          This section is coming in <b>{phase}</b>. The design is ready; data entry will be added next.
        </p>
      </div>
    </>
  );
}

/** Ghanti ka panel: pichhle notification (naye upar). Number aur list ek hi data se — "0 Active" wali galti nahi. */
function BellPanel({ list, seenAt, onClose }: { list: ReturnType<typeof useNotifications>["list"]; seenAt: number | null; onClose: () => void }) {
  // Panel khulte samay ka seenAt yaad — warna "dekh liya" likhte hi naye wale ka rang chala jaata
  const [since] = useState(seenAt);
  return (
    <>
      <div className="scrim" style={{ background: "transparent" }} onClick={onClose} />
      <section className="card notif-pop" role="dialog" aria-label="Notifications">
        <div className="card-head">
          <h2>Notifications</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {list === undefined ? (
          <div className="empty">Loading…</div>
        ) : list.length === 0 ? (
          <div className="empty">No notifications yet</div>
        ) : (
          list.slice(0, 12).map((n) => (
            <Link key={n.id} className={`row ${since === null || (n.createdAt?.toMillis() ?? 0) > since ? "unread" : ""}`} to={n.link}>
              <span aria-hidden="true">{KIND_IC[n.kind]}</span>
              <span style={{ flex: 1 }}>
                <b>{n.title}</b> <span className="small muted">· {whenText(n.createdAt)}</span>
                <br />
                <span className="small">{n.text}</span>
              </span>
              {n.resolvedAt ? <span className="pill ok">Resolved</span> : <span className={`pill ${SEV_PILL[n.severity]}`}>Open</span>}
            </Link>
          ))
        )}
        <Link className="foot" to="/alerts">See all alerts →</Link>
      </section>
    </>
  );
}
