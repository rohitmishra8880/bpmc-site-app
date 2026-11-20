// Hafte / mahine ki site report (Phase 4): server ke din ke hisab (days/) + DPR status → core buildPeriodReport. PDF, WhatsApp, Copy.
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { addDays, buildPeriodReport, periodLabel, periodRange, periodSections, periodTitle, periodWhatsapp, toBusinessDateIST, type PeriodDay, type PeriodKind } from "@bpmc/core";
import { db } from "../lib/firebase";
import { useMaster } from "../lib/masters";
import { downloadPdf, Sheet } from "../lib/print";
import { PageHead, useToast } from "../lib/ui";

function useDocsByDate(pid: string, col: string, from: string, to: string) {
  const [rows, setRows] = useState<DocumentData[] | null>(null);
  useEffect(() => {
    setRows(null);
    return onSnapshot(query(collection(db, "projects", pid, col), where("date", ">=", from), where("date", "<=", to)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [pid, col, from, to]);
  return rows;
}

export function SiteReport({ pid, projectName, onBack }: { pid: string; projectName: string; onBack: () => void }) {
  const toast = useToast();
  const today = toBusinessDateIST(new Date());
  const [kind, setKind] = useState<PeriodKind>("WEEK");
  const [anchor, setAnchor] = useState(today);
  const { from, to } = periodRange(kind, anchor);
  const days = useDocsByDate(pid, "days", from, to);
  const dprs = useDocsByDate(pid, "dpr", from, to);
  const materials = useMaster("masters_materials");
  const machines = useMaster("masters_machines");
  const contractors = useMaster("masters_contractors");

  const report = useMemo(() => {
    if (!days || !dprs) return null;
    const byId = (rows: { id: string; name: string; baseUnit?: string }[]) => Object.fromEntries(rows.map((r) => [r.id, { name: r.name, baseUnit: r.baseUnit ?? null }]));
    return buildPeriodReport({
      kind, from, to, upto: today, projectName,
      days: days.map((d) => ({ ...d, date: String(d.date ?? d.id) }) as PeriodDay),
      materials: byId(materials as { id: string; name: string; baseUnit?: string }[]),
      machines: byId(machines),
      contractors: byId(contractors),
      dprStatus: Object.fromEntries(dprs.map((d) => [String(d.date ?? d.id), String(d.status ?? "")])),
    });
  }, [days, dprs, materials, machines, contractors, kind, from, to, today, projectName]);

  const step = (dir: 1 | -1) => setAnchor(kind === "WEEK" ? addDays(from, 7 * dir) : addDays(dir === 1 ? to : from, dir));
  const share = () => report && window.open(`https://wa.me/?text=${encodeURIComponent(periodWhatsapp(report))}`, "_blank", "noopener");
  const copy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(periodWhatsapp(report));
    toast("Summary copied");
  };

  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <PageHead title="Weekly / monthly site report" sub={`${projectName} — labour, staff, stock, machinery and work, from the server's daily calculation`}>
          <button className="btn" onClick={onBack}>← All reports</button>
          {report && <button className="btn primary" onClick={() => downloadPdf(projectName, kind === "WEEK" ? "Weekly report" : "Monthly report", periodLabel(report), false)}>⬇ Download PDF</button>}
          {report && <button className="btn" onClick={share}>WhatsApp</button>}
          {report && <button className="btn" onClick={() => void copy()}>Copy</button>}
        </PageHead>
        <div className="card pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <div className="tabs" role="group" aria-label="Period">
            <button className="tab" aria-pressed={kind === "WEEK"} onClick={() => setKind("WEEK")}>Week</button>
            <button className="tab" aria-pressed={kind === "MONTH"} onClick={() => setKind("MONTH")}>Month</button>
          </div>
          <div className="field">
            <label htmlFor="sr-d">{kind === "WEEK" ? "Any day of the week" : "Month"}</label>
            {kind === "WEEK" ? (
              <input id="sr-d" className="input" type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
            ) : (
              <input id="sr-d" className="input" type="month" value={anchor.slice(0, 7)} max={today.slice(0, 7)} onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)} />
            )}
          </div>
          <div className="actions">
            <button className="btn" onClick={() => step(-1)}>‹ Previous</button>
            <button className="btn" disabled={to >= today} onClick={() => step(1)}>Next ›</button>
          </div>
        </div>
      </div>
      {!report ? (
        <div className="card empty">Loading…</div>
      ) : (
        <Sheet project={projectName} title={periodTitle(report)} period={periodLabel(report)}>
          {periodSections(report).map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <table>
                {s.head && (
                  <thead>
                    <tr>{s.head.map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                )}
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className={r[0]?.startsWith("Total") ? "tot" : undefined}>{r.map((c, j) => <td key={j} className="wrap">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <p className="note-line">Totals add up the server's daily calculation for each day. Machine amounts for monthly-rate and company machines are in the monthly rental bill.</p>
        </Sheet>
      )}
    </>
  );
}
