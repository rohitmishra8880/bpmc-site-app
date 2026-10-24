import { addDays, canEditDate, editWindowClosesAt, formatDate, toBusinessDateIST } from "@bpmc/core";

/** Top of every section: pick a day (‹ ›) and see whether it is open or locked — design v2 */
export function DateBar({ title, sub, date, onChange, pending, unlockedTill }: {
  title: string;
  sub: string;
  date: string;
  onChange: (d: string) => void;
  /** How many entries are waiting for the server calculation */
  pending?: number;
  unlockedTill?: Date | null;
}) {
  const today = toBusinessDateIST(new Date());
  const open = canEditDate(date, new Date(), unlockedTill ? { expiresAt: unlockedTill } : null);
  const closes = editWindowClosesAt(date);
  return (
    <section className="card" style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
      <div className="actions">
        {date === today ? (
          <span className="pill ok">
            <span className="dot" />
            TODAY
          </span>
        ) : (
          <span className="pill neutral">{formatDate(date)}</span>
        )}
        <b>{title}</b>
        {open ? (
          <span className="pill info">Open for entry until {new Date(closes.getTime() - 1000).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        ) : (
          <span className="pill warn">🔒 Day locked — only Admin can reopen</span>
        )}
        {!!pending && <span className="pill warn">⏳ Calculating {pending} {pending === 1 ? "entry" : "entries"} (up to 5 min)</span>}
      </div>
      <p className="small muted">{sub}</p>
      <div className="actions">
        <button className="btn sm" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <input className="input" style={{ width: "auto", minHeight: 38 }} type="date" value={date} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Date" />
        <button className="btn sm" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
          ›
        </button>
        {date !== today && (
          <button className="btn sm" onClick={() => onChange(today)}>
            Today
          </button>
        )}
      </div>
    </section>
  );
}
