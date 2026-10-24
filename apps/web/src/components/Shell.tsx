import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { formatDate, toBusinessDateIST } from "@bpmc/core";
import { can, logout, useProfile } from "../lib/auth";
import { APP_ENV } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import type { Permission } from "../lib/types";

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
      { to: "/inventory", ic: "📦", label: "Inventory (Material Hub)", soon: "P2" },
      { to: "/store", ic: "🧰", label: "Store / Saman Register", soon: "P2" },
      { to: "/machinery", ic: "🔧", label: "Machinery", soon: "P2" },
      { to: "/attendance", ic: "👥", label: "Attendance", soon: "P2" },
      { to: "/work", ic: "📅", label: "Daily Work", soon: "P2" },
      { to: "/creditors", ic: "📒", label: "Creditors / Party Ledger", soon: "P2" },
      { to: "/reports", ic: "📄", label: "Reports (DPR)", soon: "P3" },
    ],
  },
  { group: "Master list", items: [{ to: "/masters", ic: "📋", label: "Masters (maal, machine, party…)" }] },
  {
    group: "Madad",
    items: [
      { to: "/ai", ic: "✨", label: "AI Insights", soon: "P4" },
      { to: "/help", ic: "❔", label: "Help Center", soon: "P4" },
    ],
  },
  {
    group: "Admin",
    items: [
      { to: "/users", ic: "🛡️", label: "Users & Roles", adminOnly: true },
      { to: "/history", ic: "🕘", label: "Edit History", perm: "audit.read" },
      { to: "/bin", ic: "🗑️", label: "Recycle Bin", perm: "recycle.restore", soon: "P2" },
      { to: "/settings", ic: "⚙️", label: "Settings & Backup", adminOnly: true, soon: "P1" },
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

  useEffect(() => setOpen(false), [loc.pathname]);
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
          <button className="icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu kholo">
            ☰
          </button>
          <div className="logo">
            <div className="mark">BPMC</div>
            <div>
              <b>BP Mishra &amp; Co.</b>
              <span>INFRASTRUCTURE &amp; CONSTRUCTION</span>
            </div>
          </div>
          {projects.length > 0 && (
            <select className="site-sel" value={current?.id ?? ""} onChange={(e) => select(e.target.value)} aria-label="Site badlo">
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
            {online ? "Online" : "Offline — entry phone mein rukegi"}
          </span>
          <span className="when">{formatDate(toBusinessDateIST(new Date()))}</span>
          <button className="icon" onClick={cycleTheme} aria-label="Rang: light / dark / dhoop">
            ◐
          </button>
          <button className="avatar" title={`${profile.name} · ${profile.isAdmin ? "Admin" : profile.role} — logout`} onClick={() => logout()}>
            {initials || "?"}
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className={`side ${open ? "open" : ""}`} aria-label="Menu">
          <div className="proj-card">
            <div className="mark">BPMC</div>
            <div>
              <b>{current?.name ?? "Koi project nahi"}</b>
              <span>{current ? `${current.code} · Site` : "Admin se project maango"}</span>
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
        <main>
          <div className="view">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}

/** Abhi na bane section — saaf bata do kab aayega (dummy data nahi) */
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
          Yeh section <b>{phase}</b> mein banega. Design taiyaar hai (design v2), entry ka kaam agle phase mein.
        </p>
      </div>
    </>
  );
}
