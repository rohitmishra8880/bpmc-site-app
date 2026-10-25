// PDF report: ek safed A4 "kagaz" (logo, company, site, period, watermark, sign) + browser ka "Save as PDF".
// Browser se PDF isliye: Hindi sahi chhapti hai, text copy ho sakta hai, koi paid service nahi.
import type { ReactNode } from "react";
import { reportFileName, toBusinessDateIST } from "@bpmc/core";
import { Logo } from "../components/Logo";
import { useProfile } from "./auth";

export function Sheet({ project, title, period, children }: { project: string; title: string; period: string; children: ReactNode }) {
  const profile = useProfile();
  const now = new Date();
  return (
    <article className="sheet">
      <header className="sheet-head">
        <Logo size={58} />
        <div style={{ flex: 1 }}>
          <div className="sheet-co">B.P. Mishra &amp; Co.</div>
          <div className="sheet-sub">Infrastructure &amp; Construction · {project}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <h1>{title}</h1>
          <div className="sheet-sub">{period}</div>
        </div>
      </header>
      {children}
      <footer>
        <div className="sheet-sign">
          <span>Prepared by</span>
          <span>Checked by (Site Incharge)</span>
          <span>Approved by</span>
        </div>
        <p className="sheet-foot">
          Generated from BPMC Site app by {profile.email} on {now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} IST
          ({toBusinessDateIST(now)}). All totals are calculated by the server from site entries.
        </p>
      </footer>
    </article>
  );
}

/** Browser ka print → "Save as PDF". File ka naam document.title se aata hai. */
export function downloadPdf(project: string, title: string, period: string, landscape: boolean) {
  const oldTitle = document.title;
  const style = document.createElement("style");
  style.textContent = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }`;
  document.head.appendChild(style);
  document.title = reportFileName(project, title, period);
  const done = () => {
    document.title = oldTitle;
    style.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
