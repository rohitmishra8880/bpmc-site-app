// Help Center (Phase 4): site ke calculator, SOP, emergency contacts. Formule core se (tested), contacts / SOP Masters se — koi dummy number nahi.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  brickCount, CONCRETE_GRADES, concreteMix, convertUnit, formatDate, formatQty, HELP_UNITS, steelKgPerM, steelWeightKg, toBusinessDateIST, volumeM3,
  type BrickType, type ConcreteGrade, type HelpUnit,
} from "@bpmc/core";
import { can, useProfile } from "../lib/auth";
import { useMaster } from "../lib/masters";
import { downloadPdf, Sheet } from "../lib/print";
import { useProjects } from "../lib/projects";
import { PageHead } from "../lib/ui";

type Tab = "calc" | "sop" | "contacts";
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const fmt = (n: number, d = 2) => formatQty(n, d).replace(/\.?0+$/, "");

export function Help() {
  const [tab, setTab] = useState<Tab>("calc");
  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <PageHead title="Help Center" sub="Site calculators, SOPs and emergency contacts" />
        <div className="tabs" role="group" aria-label="Section">
          <button className="tab" aria-pressed={tab === "calc"} onClick={() => setTab("calc")}>🧮 Calculators</button>
          <button className="tab" aria-pressed={tab === "sop"} onClick={() => setTab("sop")}>📋 SOP</button>
          <button className="tab" aria-pressed={tab === "contacts"} onClick={() => setTab("contacts")}>🚑 Emergency contacts</button>
        </div>
      </div>
      {tab === "calc" && <Calculators />}
      {tab === "sop" && <Sops />}
      {tab === "contacts" && <Contacts />}
    </>
  );
}

function Calculators() {
  return (
    <div className="no-print" style={{ display: "grid", gap: 12 }}>
      <ConcreteCalc />
      <SteelCalc />
      <VolumeCalc />
      <BrickCalc />
      <UnitCalc />
      <p className="small muted">Nominal mix as per IS 456 (dry volume = wet × 1.54, cement 1440 kg / M³, bag 50 kg, water : cement 0.5). For design-mix concrete, follow the lab mix design.</p>
    </div>
  );
}

function Out({ rows }: { rows: [string, string][] }) {
  return (
    <div className="stats" style={{ marginTop: 10 }}>
      {rows.map(([l, v]) => (
        <div className="card stat" key={l}>
          <span className="lab">{l}</span>
          <span className="num" style={{ fontSize: 22 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ConcreteCalc() {
  const [grade, setGrade] = useState<ConcreteGrade>("M20");
  const [v, setV] = useState({ l: "", w: "", h: "", m3: "" });
  const fromLwh = [v.l, v.w, v.h].every((x) => num(x) > 0);
  const m3 = fromLwh ? volumeM3(num(v.l), num(v.w), num(v.h)) : num(v.m3);
  let res: ReturnType<typeof concreteMix> | null = null;
  try {
    res = m3 > 0 ? concreteMix(grade, m3) : null;
  } catch {
    res = null;
  }
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>Concrete mix — cement, sand (Reti), aggregate (Gitti)</h2>
      <div className="grid-form" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="cc-g">Grade</label>
          <select id="cc-g" className="input" value={grade} onChange={(e) => setGrade(e.target.value as ConcreteGrade)}>
            {CONCRETE_GRADES.map(([g, r]) => <option key={g} value={g}>{g} (1 : {r[1]} : {r[2]})</option>)}
          </select>
        </div>
        {(["l", "w", "h"] as const).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`cc-${k}`}>{k === "l" ? "Length (m)" : k === "w" ? "Width (m)" : "Depth / height (m)"}</label>
            <input id={`cc-${k}`} className="input" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label htmlFor="cc-m3">or Volume (M³)</label>
          <input id="cc-m3" className="input" inputMode="decimal" value={fromLwh ? String(m3) : v.m3} disabled={fromLwh} onChange={(e) => setV({ ...v, m3: e.target.value })} />
        </div>
      </div>
      {res ? (
        <Out rows={[
          ["Wet volume", `${fmt(res.wetM3)} M³`],
          ["Cement", `${fmt(res.cementBags)} bags (buy ${res.bagsToBuy}) · ${fmt(res.cementKg)} kg`],
          ["Sand (Reti)", `${fmt(res.sandM3, 3)} M³ · ${fmt(res.sandCft)} cft`],
          ["Aggregate (Gitti)", `${fmt(res.aggregateM3, 3)} M³ · ${fmt(res.aggregateCft)} cft`],
          ["Water", `${fmt(res.waterL)} L`],
        ]} />
      ) : (
        <p className="small muted" style={{ marginTop: 8 }}>Enter L × W × H or the volume.</p>
      )}
    </section>
  );
}

const DIAS = [6, 8, 10, 12, 16, 20, 25, 32];

function SteelCalc() {
  const [dia, setDia] = useState(12);
  const [len, setLen] = useState("12");
  const [nos, setNos] = useState("1");
  const ok = num(len) > 0 && Number.isInteger(num(nos)) && num(nos) > 0;
  const kg = ok ? steelWeightKg(dia, num(len), num(nos)) : null;
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>TMT steel weight (D² ÷ 162 × length)</h2>
      <div className="grid-form" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="st-d">Diameter</label>
          <select id="st-d" className="input" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {DIAS.map((d) => <option key={d} value={d}>{d} mm ({steelKgPerM(d)} kg / m)</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-l">Length of one bar (m)</label>
          <input id="st-l" className="input" inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="st-n">Number of bars</label>
          <input id="st-n" className="input" inputMode="numeric" value={nos} onChange={(e) => setNos(e.target.value)} />
        </div>
      </div>
      {kg !== null && <Out rows={[["Weight", `${fmt(kg)} kg`], ["In MT", `${fmt(kg / 1000, 3)} MT`], ["One 12 m bar", `${fmt(steelWeightKg(dia, 12))} kg`]]} />}
    </section>
  );
}

function VolumeCalc() {
  const [v, setV] = useState({ l: "", w: "", h: "", nos: "1" });
  const ok = [v.l, v.w].every((x) => num(x) > 0) && num(v.nos) > 0;
  const hasH = num(v.h) > 0;
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>Measurement — area (Sq M) and volume (M³)</h2>
      <div className="grid-form" style={{ marginTop: 10 }}>
        {(["l", "w", "h", "nos"] as const).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`vm-${k}`}>{k === "l" ? "Length (m)" : k === "w" ? "Width (m)" : k === "h" ? "Height / depth (m) — leave blank for area" : "Nos"}</label>
            <input id={`vm-${k}`} className="input" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {ok && (
        <Out rows={hasH
          ? [["Volume", `${fmt(volumeM3(num(v.l), num(v.w), num(v.h), num(v.nos)))} M³`], ["In cft", `${fmt(convertUnit(volumeM3(num(v.l), num(v.w), num(v.h), num(v.nos)), "cu.m", "cft"))} cft`]]
          : [["Area", `${fmt(num(v.l) * num(v.w) * num(v.nos))} Sq M`], ["In sq ft", `${fmt(convertUnit(num(v.l) * num(v.w) * num(v.nos), "Sq M", "sq ft"))} sq ft`]]} />
      )}
    </section>
  );
}

function BrickCalc() {
  const [type, setType] = useState<BrickType>("MODULAR");
  const [m3, setM3] = useState("");
  const [waste, setWaste] = useState("5");
  const ok = num(m3) > 0 && num(waste) >= 0;
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>Bricks needed</h2>
      <div className="grid-form" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="br-t">Brick</label>
          <select id="br-t" className="input" value={type} onChange={(e) => setType(e.target.value as BrickType)}>
            <option value="MODULAR">Modular / fly ash (190 × 90 × 90 mm) — 500 per M³</option>
            <option value="TRADITIONAL">Red brick (230 × 110 × 75 mm) — about 409 per M³</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="br-v">Wall volume (M³)</label>
          <input id="br-v" className="input" inputMode="decimal" value={m3} onChange={(e) => setM3(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="br-w">Wastage %</label>
          <input id="br-w" className="input" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} />
        </div>
      </div>
      {ok && <Out rows={[["Bricks", `${formatQty(brickCount(num(m3), type, num(waste)), 0)} Nos`]]} />}
    </section>
  );
}

function UnitCalc() {
  const [val, setVal] = useState("1");
  const [from, setFrom] = useState<HelpUnit>("brass");
  const [to, setTo] = useState<HelpUnit>("cu.m");
  let out: string;
  try {
    out = Number.isFinite(num(val)) ? `${fmt(convertUnit(num(val), from, to), 3)} ${to}` : "—";
  } catch (e) {
    out = (e as Error).message;
  }
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>Unit converter (1 brass = 100 cft)</h2>
      <div className="grid-form" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="uc-v">Value</label>
          <input id="uc-v" className="input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="uc-f">From</label>
          <select id="uc-f" className="input" value={from} onChange={(e) => setFrom(e.target.value as HelpUnit)}>{HELP_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
        <div className="field">
          <label htmlFor="uc-t">To</label>
          <select id="uc-t" className="input" value={to} onChange={(e) => setTo(e.target.value as HelpUnit)}>{HELP_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
      </div>
      <Out rows={[["Result", out]]} />
    </section>
  );
}

const SOP_CAT: Record<string, string> = { SAFETY: "Safety", CONCRETE: "Concrete", STEEL: "Steel", STORE: "Store", MACHINERY: "Machinery", REPORT: "Daily report", OTHER: "Other" };

function Sops() {
  const profile = useProfile();
  const { current } = useProjects();
  const sops = useMaster("masters_sop").sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.title).localeCompare(String(b.title)));
  const today = formatDate(toBusinessDateIST(new Date()));
  const steps = (s: unknown) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          {sops.length > 0 && <button className="btn primary" onClick={() => downloadPdf(current?.name ?? "BPMC", "SOP", today, false)}>⬇ PDF</button>}
          {can(profile, "masters.edit") && <Link className="btn" to="/masters">＋ Add / edit SOP (Masters → SOP)</Link>}
        </div>
        {sops.length === 0 && <div className="card empty">No SOP yet. Add them under Masters → SOP (title, category, one step per line).</div>}
        {sops.map((s) => (
          <details className="card" key={s.id} style={{ padding: 14 }}>
            <summary style={{ cursor: "pointer" }}>
              <b>{String(s.title)}</b> <span className="pill neutral">{SOP_CAT[String(s.category)] ?? String(s.category)}</span>
            </summary>
            <ol style={{ margin: "10px 0 0 18px", display: "grid", gap: 4 }}>{steps(s.steps).map((x, i) => <li key={i}>{x.replace(/^\d+[.)]\s*/, "")}</li>)}</ol>
          </details>
        ))}
      </div>
      {sops.length > 0 && (
        <div className="print-only">
          <Sheet project={current?.name ?? "BPMC"} title="SOP / मानक प्रक्रिया" period={today}>
            {sops.map((s) => (
              <section key={s.id}>
                <h2>{String(s.title)} — {SOP_CAT[String(s.category)] ?? ""}</h2>
                <ol>{steps(s.steps).map((x, i) => <li key={i}>{x.replace(/^\d+[.)]\s*/, "")}</li>)}</ol>
              </section>
            ))}
          </Sheet>
        </div>
      )}
    </>
  );
}

const KIND: Record<string, string> = { HOSPITAL: "🏥 Hospital", AMBULANCE: "🚑 Ambulance", POLICE: "🚓 Police", FIRE: "🚒 Fire brigade", ELECTRICITY: "⚡ Electricity", DEPARTMENT: "🏛️ Department", COMPANY: "🏢 Company office", OTHER: "📞 Other" };

function Contacts() {
  const profile = useProfile();
  const { current } = useProjects();
  const all = useMaster("masters_contacts");
  // Is site ke + "All sites" wale
  const list = all.filter((c) => c.projectId === "ALL" || c.projectId === current?.id).sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || a.name.localeCompare(b.name));
  const today = formatDate(toBusinessDateIST(new Date()));
  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          {list.length > 0 && <button className="btn primary" onClick={() => downloadPdf(current?.name ?? "BPMC", "Emergency contacts", today, false)}>⬇ PDF</button>}
          {can(profile, "masters.edit") && <Link className="btn" to="/masters">＋ Add / edit (Masters → Emergency contacts)</Link>}
        </div>
        <section className="card">
          <div className="card-head">
            <h2>{current ? `${current.name} — emergency contacts` : "Emergency contacts"}</h2>
          </div>
          {list.length === 0 ? (
            <div className="empty">No contacts yet for this site. Add the nearest hospital, police station, ambulance and the department engineer under Masters → Emergency contacts.</div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Address / distance</th></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td>{KIND[String(c.kind)] ?? String(c.kind)}</td>
                      <td><b>{c.name}</b>{c.projectId === "ALL" && <span className="small muted"> · all sites</span>}</td>
                      <td><a className="btn sm" href={`tel:${String(c.phone)}`}>📞 {String(c.phone)}</a></td>
                      <td className="small">{String(c.address ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {list.length > 0 && (
        <div className="print-only">
          <Sheet project={current?.name ?? "BPMC"} title="Emergency contacts / आपातकालीन संपर्क" period={today}>
            <table>
              <thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Address / distance</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}><td>{(KIND[String(c.kind)] ?? String(c.kind)).replace(/^\S+\s/, "")}</td><td>{c.name}</td><td>{String(c.phone)}</td><td>{String(c.address ?? "")}</td></tr>
                ))}
              </tbody>
            </table>
          </Sheet>
        </div>
      )}
    </>
  );
}
