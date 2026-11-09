// DPR (din ke end ki report): server ke hisab + asli entries → ek snapshot. Isi se app, PDF, Markdown, WhatsApp — sab ek hi data se.
// Hisab yahan nahi hota: numbers days/ se aate hain, yeh sirf jodta aur sajata hai. Labels: English / हिंदी (Rohit ka niyam).
import { formatDate, isBusinessDate } from "./date";
import { formatINR, formatQtyShort, type Paise } from "./money";
import { gpsLabel } from "./photo";

export interface DprInput {
  date: string;
  projectName: string;
  day: {
    stock?: Record<string, { opening: number; inward: number; uses: number; adjust?: number; closing: number }>;
    machines?: Record<string, { status: string; hours?: number | null; hoursText?: string | null; dieselLtr?: number; amountPaise?: Paise | null }>;
    machineTotals?: { dieselLtr: number; hours: number; running: number; breakdown: number; amountPaise?: Paise };
    labour?: { totals: { mistri: number; kuli: number; reja: number; total: number }; byContractor?: Record<string, { mistri: number; kuli: number; reja: number; total: number }> };
    staff?: { present: number; halfDay: number; absent: number; marked?: number };
    work?: { byType: Partial<Record<string, { qty: number; unit: string }>> };
  };
  materials: Record<string, { name: string; baseUnit?: string }>;
  machines: Record<string, { name: string }>;
  contractors: Record<string, { name: string }>;
  machineLogs: { machineId: string; sr?: number | null; cr?: number | null; remark?: string | null; breakdownReason?: string | null; deleted?: unknown }[];
  workEntries: { type: string; contractorId: string; zone?: string | null; workLabel?: string | null; qty: number; unit: string; measure?: string | null; ratePaise?: Paise | null; deleted?: unknown }[];
  storeMoves: { type: string; itemName: string; qty: number; unit?: string | null; contractorId?: string | null; condition?: string | null; partyName?: string | null; otherProjectName?: string | null; purpose?: string | null; time?: string | null; deleted?: unknown }[];
  creditors?: { bakayaPaise: Paise; overduePaise: Paise; toRecoverPaise?: Paise } | null;
  photos: { label?: string | null; takenAt: string; lat?: number | null; lng?: number | null; accuracyM?: number | null; driveFileId: string; deleted?: unknown }[];
}

export interface DprSnapshot {
  date: string;
  projectName: string;
  empty: boolean;
  labour: { rows: { contractor: string; mistri: number; kuli: number; reja: number; total: number }[]; totals: { mistri: number; kuli: number; reja: number; total: number } };
  staff: { present: number; halfDay: number; absent: number };
  stock: { name: string; unit: string; opening: number; inward: number; uses: number; closing: number }[];
  diesel: { opening: number; inward: number; uses: number; closing: number; machineLtr: number } | null;
  machines: { name: string; status: string; sr: number | null; cr: number | null; hoursText: string | null; dieselLtr: number; amountPaise: Paise | null; remark: string | null }[];
  work: { type: string; contractor: string; where: string; measure: string | null; qty: number; unit: string }[];
  workTotals: { type: string; qty: number; unit: string }[];
  store: { type: string; item: string; qty: number; unit: string; who: string; condition: string | null; purpose: string | null }[];
  creditors: { bakayaPaise: Paise; overduePaise: Paise; toRecoverPaise: Paise } | null;
  photos: { label: string; takenAt: string; gps: string; driveFileId: string }[];
}

const WORK_ORDER = ["CONCRETE", "EXCAVATION", "SHUTTERING", "STEEL"];
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function buildDpr(i: DprInput): DprSnapshot {
  const cName = (id?: string | null) => (!id ? "" : id === "COMPANY" ? "Company" : (i.contractors[id]?.name ?? id));
  const zero = { mistri: 0, kuli: 0, reja: 0, total: 0 };
  const rows = Object.entries(i.day.labour?.byContractor ?? {})
    .map(([id, c]) => ({ id, contractor: cName(id), mistri: c.mistri, kuli: c.kuli, reja: c.reja, total: c.total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (a.id === "COMPANY" ? -1 : b.id === "COMPANY" ? 1 : a.contractor.localeCompare(b.contractor)))
    .map(({ id: _id, ...r }) => r);
  const stockAll = i.day.stock ?? {};
  const moved = (b: { opening: number; inward: number; uses: number; closing: number }) => !!(b.opening || b.inward || b.uses || b.closing);
  const stock = Object.entries(stockAll)
    .filter(([id, b]) => id !== "diesel" && moved(b))
    .map(([id, b]) => ({ name: i.materials[id]?.name ?? id, unit: i.materials[id]?.baseUnit ?? "", opening: b.opening, inward: b.inward, uses: b.uses, closing: b.closing }))
    .sort(byName);
  const d = stockAll.diesel;
  const logs = new Map(i.machineLogs.filter((l) => !l.deleted).map((l) => [l.machineId, l]));
  const machines = Object.entries(i.day.machines ?? {})
    .map(([id, m]) => {
      const l = logs.get(id);
      return {
        name: i.machines[id]?.name ?? id, status: m.status, sr: l?.sr ?? null, cr: l?.cr ?? null, hoursText: m.hoursText ?? null,
        dieselLtr: m.dieselLtr ?? 0, amountPaise: m.amountPaise ?? null, remark: [l?.breakdownReason, l?.remark].filter(Boolean).join(" · ") || null,
      };
    })
    .sort(byName);
  const work = i.workEntries
    .filter((e) => !e.deleted)
    .map((e) => ({ type: e.type, contractor: cName(e.contractorId), where: [e.zone, e.workLabel].filter(Boolean).join(" · "), measure: e.measure ?? null, qty: e.qty, unit: e.unit }));
  const workTotals = WORK_ORDER.flatMap((t) => {
    const x = i.day.work?.byType?.[t];
    return x ? [{ type: t, qty: x.qty, unit: x.unit }] : [];
  });
  const store = i.storeMoves
    .filter((m) => !m.deleted)
    .slice()
    .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")))
    .map((m) => ({ type: m.type, item: m.itemName, qty: m.qty, unit: m.unit ?? "", who: cName(m.contractorId) || m.partyName || m.otherProjectName || "", condition: m.condition ?? null, purpose: m.purpose ?? null }));
  const photos = i.photos
    .filter((p) => !p.deleted)
    .map((p) => ({ label: p.label ?? "", takenAt: p.takenAt, gps: gpsLabel(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM } : null), driveFileId: p.driveFileId }));
  const staff = { present: i.day.staff?.present ?? 0, halfDay: i.day.staff?.halfDay ?? 0, absent: i.day.staff?.absent ?? 0 };
  const diesel = d && moved(d) ? { opening: d.opening, inward: d.inward, uses: d.uses, closing: d.closing, machineLtr: i.day.machineTotals?.dieselLtr ?? 0 } : null;
  const empty = !rows.length && !(staff.present || staff.halfDay || staff.absent) && !stock.length && !diesel && !machines.length && !work.length && !store.length && !photos.length;
  return {
    date: i.date, projectName: i.projectName, empty,
    labour: { rows, totals: i.day.labour?.totals ?? zero }, staff, stock, diesel, machines, work, workTotals, store,
    creditors: i.creditors ? { bakayaPaise: i.creditors.bakayaPaise, overduePaise: i.creditors.overduePaise, toRecoverPaise: i.creditors.toRecoverPaise ?? 0 } : null,
    photos,
  };
}

/** Locked DPR ka naya version tabhi jab data sach mein badla ho */
export function dprSame(a: DprSnapshot, b: DprSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Snapshot ki chhoti pehchaan — pichle version se milane ke liye */
export function dprFingerprint(d: DprSnapshot): string {
  const t = JSON.stringify(d);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return `${t.length}-${h.toString(36)}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "<vault>/Daily Report/2026/10-October" */
export function dprFolder(vault: string, date: string): string {
  if (!isBusinessDate(date)) throw new Error(`Bad date: ${date}`);
  const [y, m] = date.split("-");
  return `${vault}/Daily Report/${y}/${m}-${MONTHS[Number(m) - 1]}`;
}

export const DPR_EMPTY_TEXT = "Is din koi entry nahi / इस दिन कोई एंट्री नहीं";
const WORK_NAME: Record<string, string> = { CONCRETE: "Concrete / कंक्रीट", EXCAVATION: "Excavation / खुदाई", SHUTTERING: "Shuttering / शटरिंग", STEEL: "Steel / स्टील" };
const STATUS: Record<string, string> = { FULL: "Full / पूरा", HALF: "Half / आधा", HOUR: "Hourly / घंटा", BREAKDOWN: "Breakdown / खराब", ABSENT: "Absent / बंद" };
const MOVE: Record<string, string> = { INWARD: "Received / आया", ISSUE: "Issued / दिया", RETURN: "Returned / वापस", CONSUME: "Used / खपत", TRANSFER_OUT: "Sent to site / भेजा", TRANSFER_IN: "From site / आया" };
const COND: Record<string, string> = { OK: "Good / ठीक", DAMAGED: "Damaged / खराब", BROKEN: "Broken / टूटा", LOST: "Lost / खोया" };

export interface DprSection {
  title: string;
  head?: string[];
  rows: string[][];
  /** Tabel ke neeche chhoti line */
  note?: string;
}

const q = formatQtyShort;

/** App, PDF aur Markdown — sab isi ek list se chhapte hain */
export function dprSections(d: DprSnapshot): DprSection[] {
  const out: DprSection[] = [];
  if (d.labour.rows.length || d.staff.present || d.staff.halfDay || d.staff.absent) {
    const t = d.labour.totals;
    out.push({
      title: "Staff & Labour / स्टाफ और मजदूर",
      head: ["Contractor / ठेकेदार", "Mistri / मिस्त्री", "Kuli / कुली", "Reja / रेजा", "Total / कुल"],
      rows: [...d.labour.rows.map((r) => [r.contractor, String(r.mistri), String(r.kuli), String(r.reja), String(r.total)]), ...(d.labour.rows.length ? [["Total / कुल", String(t.mistri), String(t.kuli), String(t.reja), String(t.total)]] : [])],
      note: `Staff / स्टाफ: Present / हाज़िर ${d.staff.present} · Half day / आधा दिन ${d.staff.halfDay} · Absent / गैरहाज़िर ${d.staff.absent}`,
    });
  }
  if (d.stock.length) {
    out.push({
      title: "Material Stock / सामग्री स्टॉक",
      head: ["Material / सामग्री", "Unit / इकाई", "Opening / पुराना", "New / नया", "Uses / खपत", "Balance / बाकी"],
      rows: d.stock.map((s) => [s.name, s.unit, q(s.opening), q(s.inward), q(s.uses), q(s.closing)]),
    });
  }
  if (d.diesel) {
    out.push({
      title: "Diesel / डीज़ल (Ltr)",
      head: ["Opening / पुराना", "New / नया", "Uses / खपत", "Balance / बाकी"],
      rows: [[q(d.diesel.opening), q(d.diesel.inward), q(d.diesel.uses), q(d.diesel.closing)]],
      note: `Machines / मशीनों में: ${q(d.diesel.machineLtr)} L`,
    });
  }
  if (d.machines.length) {
    out.push({
      title: "Machinery / मशीनरी",
      head: ["Machine / मशीन", "SR", "CR", "Hours / घंटे", "Diesel / डीज़ल", "Status / स्थिति", "Amount / रकम", "Remark / टिप्पणी"],
      rows: d.machines.map((m) => [m.name, m.sr == null ? "—" : String(m.sr), m.cr == null ? "—" : String(m.cr), m.hoursText ?? "—", `${q(m.dieselLtr)} L`, STATUS[m.status] ?? m.status, m.amountPaise == null ? "—" : formatINR(m.amountPaise), m.remark ?? ""]),
    });
  }
  if (d.work.length) {
    out.push({
      title: "Daily Work / दैनिक कार्य",
      head: ["Work / कार्य", "Contractor / ठेकेदार", "Where / कहाँ", "Measurement / नाप", "Qty / मात्रा"],
      rows: d.work.map((w) => [WORK_NAME[w.type] ?? w.type, w.contractor, w.where, w.measure ?? "", `${q(w.qty)} ${w.unit}`]),
      note: d.workTotals.length ? `Total / कुल: ${d.workTotals.map((t) => `${WORK_NAME[t.type] ?? t.type} ${q(t.qty)} ${t.unit}`).join(" · ")}` : undefined,
    });
  }
  if (d.store.length) {
    out.push({
      title: "Store Register / स्टोर रजिस्टर",
      head: ["Item / सामान", "Type / प्रकार", "Qty / मात्रा", "Contractor, party / ठेकेदार, पार्टी", "Details / विवरण"],
      rows: d.store.map((s) => [s.item, MOVE[s.type] ?? s.type, `${q(s.qty)} ${s.unit}`.trim(), s.who, [s.condition && (COND[s.condition] ?? s.condition), s.purpose].filter(Boolean).join(" · ")]),
    });
  }
  if (d.creditors) {
    out.push({
      title: "Creditors / लेनदार",
      head: ["Bakaya / बकाया", "Overdue / समय से ऊपर", "To recover / वसूली"],
      rows: [[formatINR(d.creditors.bakayaPaise), formatINR(d.creditors.overduePaise), formatINR(d.creditors.toRecoverPaise)]],
    });
  }
  if (d.photos.length) {
    out.push({
      title: "Photos / फोटो",
      head: ["Photo / फोटो", "Time / समय", "GPS"],
      rows: d.photos.map((p) => [p.label || "Site", new Date(p.takenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }), p.gps]),
    });
  }
  return out;
}

export interface DprMeta {
  version?: number | null;
  lockedBy?: string | null;
  lockedAt?: string | null;
  note?: string | null;
}

const title = (d: DprSnapshot) => `DPR — ${d.projectName} — ${formatDate(d.date)}`;
const metaLines = (m: DprMeta) => [m.version ? `Version v${m.version}` : "Draft / मसौदा", m.lockedBy ? `Approved by / अनुमोदित: ${m.lockedBy}${m.lockedAt ? ` (${m.lockedAt})` : ""}` : "", m.note ? `Change / बदलाव: ${m.note}` : ""].filter(Boolean);

export function dprMarkdown(d: DprSnapshot, m: DprMeta): string {
  const parts = [`# ${title(d)}`, "", ...metaLines(m).map((l) => `${l}  `), ""];
  if (d.empty) parts.push(DPR_EMPTY_TEXT, "");
  for (const s of dprSections(d)) {
    parts.push(`## ${s.title}`, "");
    if (s.head) parts.push(`| ${s.head.join(" | ")} |`, `| ${s.head.map(() => "---").join(" | ")} |`);
    for (const r of s.rows) parts.push(`| ${r.join(" | ")} |`);
    parts.push("");
    if (s.note) parts.push(s.note, "");
  }
  return parts.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** PDF (Apps Script HTML → PDF) ke liye; logo = data URL, har page par watermark jaisa */
export function dprHtml(d: DprSnapshot, m: DprMeta, logoDataUrl?: string | null): string {
  const body = dprSections(d)
    .map((s) => `<h2>${esc(s.title)}</h2><table>${s.head ? `<tr>${s.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` : ""}${s.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>${s.note ? `<p>${esc(s.note)}</p>` : ""}`)
    .join("");
  // PDF banane wala fixed image sirf aakhri page par rakhta hai, isliye pehle page ke liye alag bhi
  const mark = (pos: string) => `<img src="${logoDataUrl}" style="position:${pos};top:260px;left:25%;width:50%;opacity:.07;z-index:-1">`;
  const logo = logoDataUrl ? mark("absolute") + mark("fixed") : "";
  return `<html><head><meta charset="utf-8"><style>body{font-family:'Noto Sans','Noto Sans Devanagari',Arial,sans-serif;font-size:11px}h1{font-size:16px;margin:0}h2{font-size:12px;margin:12px 0 4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left}th{background:#eee}p{margin:4px 0}</style></head><body>${logo}<h1>B.P. Mishra &amp; Co.</h1><h1>${esc(title(d))}</h1>${metaLines(m).map((l) => `<p>${esc(l)}</p>`).join("")}${d.empty ? `<p><b>${esc(DPR_EMPTY_TEXT)}</b></p>` : ""}${body}</body></html>`;
}

/** WhatsApp ke liye chhota summary (poori report PDF mein) */
export function dprWhatsapp(d: DprSnapshot, m: DprMeta): string {
  const t = d.labour.totals;
  const lines = [`*${title(d)}*`, m.version ? `Version v${m.version}` : "Draft"];
  if (d.empty) lines.push(DPR_EMPTY_TEXT);
  if (t.total) lines.push(`Labour: ${t.total} (M ${t.mistri} · K ${t.kuli} · R ${t.reja})`);
  if (d.staff.present || d.staff.halfDay) lines.push(`Staff: ${d.staff.present + d.staff.halfDay}`);
  if (d.diesel) lines.push(`Diesel: ${q(d.diesel.closing)} L balance`);
  if (d.machines.length) lines.push(`Machines: ${d.machines.filter((x) => x.status !== "BREAKDOWN" && x.status !== "ABSENT").length} running`);
  if (d.workTotals.length) lines.push(`Work: ${d.workTotals.map((x) => `${(WORK_NAME[x.type] ?? x.type).split(" / ")[0]} ${q(x.qty)} ${x.unit}`).join(", ")}`);
  if (d.store.length) lines.push(`Store: ${d.store.length} entries`);
  return lines.join("\n");
}
