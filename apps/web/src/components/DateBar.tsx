import { addDays, canEditDate, editWindowClosesAt, formatDate, toBusinessDateIST } from "@bpmc/core";

/** Har section ke upar: din chuno (‹ ›), aur din khula hai ya lock — design v2 jaisa */
export function DateBar({ title, sub, date, onChange, pending, unlockedTill }: {
  title: string;
  sub: string;
  date: string;
  onChange: (d: string) => void;
  /** Kitni entry server ke hisab ka intezaar kar rahi hain */
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
            AAJ
          </span>
        ) : (
          <span className="pill neutral">{formatDate(date)}</span>
        )}
        <b>{title}</b>
        {open ? (
          <span className="pill info">Entry khuli — {new Date(closes.getTime() - 1000).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} tak</span>
        ) : (
          <span className="pill warn">🔒 Din lock — sirf Admin khol sakta hai</span>
        )}
        {!!pending && <span className="pill warn">⏳ {pending} entry ka hisab ho raha (5 min tak)</span>}
      </div>
      <p className="small muted">{sub}</p>
      <div className="actions">
        <button className="btn sm" onClick={() => onChange(addDays(date, -1))} aria-label="Pichhla din">
          ‹
        </button>
        <input className="input" style={{ width: "auto", minHeight: 38 }} type="date" value={date} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Tarikh" />
        <button className="btn sm" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Agla din">
          ›
        </button>
        {date !== today && (
          <button className="btn sm" onClick={() => onChange(today)}>
            Aaj
          </button>
        )}
      </div>
    </section>
  );
}
