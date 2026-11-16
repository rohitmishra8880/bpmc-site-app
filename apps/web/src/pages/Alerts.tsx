// Alerts: abhi ke saare alert (server ki ek list) + notification ka itihaas. PDF bhi (har hisab ka PDF — Rohit ka niyam).
import { Link } from "react-router-dom";
import { formatDate, toBusinessDateIST } from "@bpmc/core";
import { KIND_IC, SEV_PILL, useAlerts, useNotifications, whenText } from "../lib/alerts";
import { downloadPdf, Sheet } from "../lib/print";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

const SEV_LABEL = { crit: "Critical", warn: "Warning", info: "Reminder" } as const;

export function Alerts() {
  const { current } = useProjects();
  const { doc: ad, items } = useAlerts(current?.id);
  const { list, unread, markSeen } = useNotifications(current?.id);
  if (!current) return <div className="card empty">Select a project first.</div>;
  const counts = { crit: items.filter((a) => a.severity === "crit").length, warn: items.filter((a) => a.severity === "warn").length, info: items.filter((a) => a.severity === "info").length };
  const today = toBusinessDateIST(new Date());

  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <PageHead title="Alerts & Notifications" sub={`${current.name} — made by the server from real entries`}>
          <span className="pill crit">{counts.crit} critical</span>
          <span className="pill warn">{counts.warn} warning</span>
          <span className="pill info">{counts.info} reminder</span>
          {items.length > 0 && <button className="btn primary" onClick={() => downloadPdf(current.name, "Alerts", formatDate(today), false)}>⬇ PDF</button>}
        </PageHead>

        <section className="card alerts-card">
          <div className="card-head">
            <h2>Active now</h2>
            <span className="small muted">{ad?.refreshedAt ? `Checked ${whenText(ad.refreshedAt)}` : ""}</span>
          </div>
          {ad === undefined ? (
            <div className="empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty">{ad ? "✓ No active alerts" : "The server has not checked this site yet (it does within 5 minutes)."}</div>
          ) : (
            items.map((a) => (
              <Link key={a.key} className="row" to={a.link}>
                <span aria-hidden="true">{KIND_IC[a.kind]}</span>
                <span style={{ flex: 1 }}>
                  <b>{a.title}</b>
                  <br />
                  <span className="small">{a.text}</span>
                </span>
                <span className={`pill ${SEV_PILL[a.severity]}`}>{SEV_LABEL[a.severity]}</span>
              </Link>
            ))
          )}
        </section>

        <section className="card alerts-card">
          <div className="card-head">
            <h2>Notification history</h2>
            {unread > 0 && <button className="btn" onClick={() => void markSeen()}>Mark all as read ({unread})</button>}
          </div>
          {list === undefined ? (
            <div className="empty">Loading…</div>
          ) : list.length === 0 ? (
            <div className="empty">No notifications yet</div>
          ) : (
            list.map((n) => (
              <Link key={n.id} className="row" to={n.link}>
                <span aria-hidden="true">{KIND_IC[n.kind]}</span>
                <span style={{ flex: 1 }}>
                  <b>{n.title}</b> <span className="small muted">· {whenText(n.createdAt)}</span>
                  <br />
                  <span className="small">{n.text}</span>
                </span>
                {n.resolvedAt ? <span className="pill ok">Resolved {whenText(n.resolvedAt)}</span> : <span className={`pill ${SEV_PILL[n.severity]}`}>Open</span>}
              </Link>
            ))
          )}
        </section>
        <p className="small muted">The server checks every site when an entry changes, and at least once an hour.</p>
      </div>

      {items.length > 0 && (
        <div className="print-only">
          <Sheet project={current.name} title="Active alerts / सक्रिय चेतावनी" period={formatDate(today)}>
            <table>
              <thead>
                <tr><th>Level</th><th>Alert</th><th>Details</th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.key}><td>{SEV_LABEL[a.severity]}</td><td>{a.title}</td><td className="wrap">{a.text}</td></tr>
                ))}
              </tbody>
            </table>
          </Sheet>
        </div>
      )}
    </>
  );
}
