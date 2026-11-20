// Hafte / mahine ki site report (Phase 4): server ke din ke hisab (days/) ko jodna — naya hisab nahi.
// Labels DPR jaise English / हिंदी (department ko jaati hai).
import { addDays, daysInMonth, formatDate } from "./date";
import type { DprSection } from "./dpr";
import { weekStart } from "./labour";
import { formatHours } from "./measure";
import { formatINR, formatQtyShort, roundHalfUp, type Paise } from "./money";

export type PeriodKind = "WEEK" | "MONTH";

type Crew = { mistri: number; kuli: number; reja: number; total: number };

export interface PeriodDay {
  date: string;
  stock?: Record<string, { opening: number; inward: number; uses: number; adjust?: number; closing: number }>;
  machines?: Record<string, { status: string; hours?: number | null; dieselLtr?: number; amountPaise?: Paise | null }>;
  labour?: { totals: Crew; byContractor?: Record<string, Crew> };
  staff?: { present: number; halfDay: number; absent: number };
  work?: { byType: Partial<Record<string, { qty: number; unit: string }>> };
}

export interface PeriodInput {
  kind: PeriodKind;
  from: string;
  to: string;
  /** Aaj tak hi gino (aage ke din nahi) */
  upto: string;
  projectName: string;
  days: PeriodDay[];
  materials: Record<string, { name: string; baseUnit?: string | null }>;
  machines: Record<string, { name: string }>;
  contractors: Record<string, { name: string }>;
  /** dpr/{date}.status */
  dprStatus?: Record<string, string>;
}

export interface PeriodReport {
  kind: PeriodKind;
  from: string;
  to: string;
  upto: string;
  projectName: string;
  empty: boolean;
  daysCounted: number;
  daysWithEntries: number;
  labour: { rows: ({ contractor: string } & Crew)[]; totals: Crew };
  staff: { present: number; halfDay: number; absent: number; staffDays: number };
  stock: { name: string; unit: string; opening: number; inward: number; uses: number; closing: number }[];
  machines: { name: string; workedDays: number; breakdownDays: number; hours: number; hoursText: string; dieselLtr: number; amountPaise: Paise | null }[];
  work: { type: string; qty: number; unit: string }[];
  dpr: { locked: number; draft: number; none: number };
}

/** Hafta Somvar–Ravivar, mahina 1 se aakhri din */
export function periodRange(kind: PeriodKind, date: string): { from: string; to: string } {
  if (kind === "WEEK") {
    const from = weekStart(date);
    return { from, to: addDays(from, 6) };
  }
  const m = date.slice(0, 7);
  return { from: `${m}-01`, to: `${m}-${String(daysInMonth(m)).padStart(2, "0")}` };
}

const WORK_ORDER = ["CONCRETE", "EXCAVATION", "SHUTTERING", "STEEL"];
const WORK_LABEL: Record<string, string> = { CONCRETE: "Concrete", EXCAVATION: "Excavation", SHUTTERING: "Shuttering", STEEL: "Steel" };
const zero = (): Crew => ({ mistri: 0, kuli: 0, reja: 0, total: 0 });
const add = (a: Crew, b: Crew) => {
  a.mistri += b.mistri || 0;
  a.kuli += b.kuli || 0;
  a.reja += b.reja || 0;
  a.total += b.total || 0;
};
const r3 = (n: number) => roundHalfUp(n, 3);

export function buildPeriodReport(i: PeriodInput): PeriodReport {
  const days = i.days.filter((d) => d.date >= i.from && d.date <= i.to && d.date <= i.upto).sort((a, b) => a.date.localeCompare(b.date));

  // Labour (man-days) thekedar-wise
  const crews = new Map<string, Crew>();
  const totals = zero();
  for (const d of days) {
    for (const [cid, c] of Object.entries(d.labour?.byContractor ?? {})) {
      const x = crews.get(cid) ?? zero();
      add(x, c);
      crews.set(cid, x);
      add(totals, c);
    }
  }
  const cName = (id: string) => (id === "COMPANY" ? "Company" : (i.contractors[id]?.name ?? id));
  const labourRows = [...crews.entries()]
    .map(([id, c]) => ({ id, contractor: cName(id), ...c }))
    .sort((a, b) => (a.id === "COMPANY" ? -1 : b.id === "COMPANY" ? 1 : a.contractor.localeCompare(b.contractor)))
    .map(({ id: _id, ...rest }) => rest);

  // Staff
  const staff = { present: 0, halfDay: 0, absent: 0, staffDays: 0 };
  for (const d of days) {
    staff.present += d.staff?.present ?? 0;
    staff.halfDay += d.staff?.halfDay ?? 0;
    staff.absent += d.staff?.absent ?? 0;
  }
  staff.staffDays = staff.present + staff.halfDay * 0.5;

  // Stock: pehle din ka opening, jod, aakhri din ka closing
  const st = new Map<string, { opening: number; inward: number; uses: number; closing: number }>();
  for (const d of days) {
    for (const [id, b] of Object.entries(d.stock ?? {})) {
      const x = st.get(id);
      if (!x) st.set(id, { opening: b.opening, inward: b.inward, uses: b.uses, closing: b.closing });
      else {
        x.inward += b.inward;
        x.uses += b.uses;
        x.closing = b.closing;
      }
    }
  }
  const stock = [...st.entries()]
    .filter(([, x]) => x.opening || x.inward || x.uses || x.closing)
    .map(([id, x]) => ({ name: i.materials[id]?.name ?? id, unit: i.materials[id]?.baseUnit ?? "", opening: r3(x.opening), inward: r3(x.inward), uses: r3(x.uses), closing: r3(x.closing) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Machinery
  const mm = new Map<string, { workedDays: number; breakdownDays: number; hours: number; dieselLtr: number; amountPaise: Paise | null }>();
  for (const d of days) {
    for (const [id, m] of Object.entries(d.machines ?? {})) {
      const x = mm.get(id) ?? { workedDays: 0, breakdownDays: 0, hours: 0, dieselLtr: 0, amountPaise: null };
      if (m.status === "BREAKDOWN") x.breakdownDays++;
      else if (m.status !== "ABSENT") x.workedDays++;
      x.hours += m.hours ?? 0;
      x.dieselLtr += m.dieselLtr ?? 0;
      if (m.amountPaise != null) x.amountPaise = (x.amountPaise ?? 0) + m.amountPaise;
      mm.set(id, x);
    }
  }
  const machines = [...mm.entries()]
    .map(([id, x]) => {
      const hours = roundHalfUp(x.hours, 2);
      return { name: i.machines[id]?.name ?? id, workedDays: x.workedDays, breakdownDays: x.breakdownDays, hours, hoursText: formatHours(hours), dieselLtr: r3(x.dieselLtr), amountPaise: x.amountPaise };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Work
  const wk = new Map<string, { qty: number; unit: string }>();
  for (const d of days) {
    for (const [t, w] of Object.entries(d.work?.byType ?? {})) {
      if (!w) continue;
      const x = wk.get(t) ?? { qty: 0, unit: w.unit };
      x.qty += w.qty;
      wk.set(t, x);
    }
  }
  const work = [...wk.entries()]
    .sort((a, b) => (WORK_ORDER.indexOf(a[0]) + 99) % 99 - ((WORK_ORDER.indexOf(b[0]) + 99) % 99))
    .map(([t, x]) => ({ type: WORK_LABEL[t] ?? t, qty: r3(x.qty), unit: x.unit }));

  // Din aur DPR
  const last = i.to < i.upto ? i.to : i.upto;
  let daysCounted = 0;
  const dpr = { locked: 0, draft: 0, none: 0 };
  for (let d = i.from; d <= last; d = addDays(d, 1)) {
    daysCounted++;
    const s = i.dprStatus?.[d];
    if (s === "LOCKED") dpr.locked++;
    else if (s === "DRAFT") dpr.draft++;
    else dpr.none++;
  }
  const daysWithEntries = days.filter((d) => d.labour || d.staff || d.machines || d.work || Object.values(d.stock ?? {}).some((b) => b.inward || b.uses)).length;
  const empty = !labourRows.length && !(staff.present || staff.halfDay || staff.absent) && !stock.length && !machines.length && !work.length;

  return { kind: i.kind, from: i.from, to: i.to, upto: i.upto, projectName: i.projectName, empty, daysCounted, daysWithEntries, labour: { rows: labourRows, totals }, staff, stock, machines, work, dpr };
}

const n = formatQtyShort;
const kindLabel = (k: PeriodKind) => (k === "WEEK" ? "Weekly report / साप्ताहिक रिपोर्ट" : "Monthly report / मासिक रिपोर्ट");
export const periodTitle = (r: PeriodReport) => `${kindLabel(r.kind)} — ${r.projectName}`;
export const periodLabel = (r: PeriodReport) => `${formatDate(r.from)} – ${formatDate(r.to)}${r.upto < r.to ? ` (till ${formatDate(r.upto)})` : ""}`;

/** App, PDF — sab isi list se (DPR jaisa) */
export function periodSections(r: PeriodReport): DprSection[] {
  if (r.empty) return [{ title: "No entries / कोई प्रविष्टि नहीं", rows: [["No entries in this period / इस अवधि में कोई प्रविष्टि नहीं"]] }];
  const out: DprSection[] = [];
  out.push({
    title: "Summary / सारांश",
    rows: [
      ["Period / अवधि", periodLabel(r)],
      ["Days with entries / प्रविष्टि वाले दिन", `${r.daysWithEntries} of ${r.daysCounted}`],
      ["DPR locked / DPR लॉक", `${r.dpr.locked} locked · ${r.dpr.draft} draft · ${r.dpr.none} not made`],
      ["Labour / मजदूर", `${n(r.labour.totals.total)} man-days`],
      ["Staff / स्टाफ", `${n(r.staff.staffDays)} staff-days (P ${r.staff.present} · HD ${r.staff.halfDay} · A ${r.staff.absent})`],
    ],
  });
  if (r.labour.rows.length) {
    const t = r.labour.totals;
    out.push({
      title: "Staff & Labour (man-days) / स्टाफ और मजदूर (मानव-दिवस)",
      head: ["Contractor / ठेकेदार", "Mistri / मिस्त्री", "Kuli / कुली", "Reja / रेजा", "Total / कुल"],
      rows: [...r.labour.rows.map((x) => [x.contractor, n(x.mistri), n(x.kuli), n(x.reja), n(x.total)]), ["Total / कुल", n(t.mistri), n(t.kuli), n(t.reja), n(t.total)]],
    });
  }
  if (r.stock.length) {
    out.push({
      title: "Material Stock / सामग्री स्टॉक",
      head: ["Material / सामग्री", "Unit / इकाई", "Opening / पुराना", "Received / आया", "Used / खर्च", "Balance / बाकी"],
      rows: r.stock.map((x) => [x.name, x.unit, n(x.opening), n(x.inward), n(x.uses), n(x.closing)]),
    });
  }
  if (r.machines.length) {
    out.push({
      title: "Machinery / मशीनरी",
      head: ["Machine / मशीन", "Worked days / चले दिन", "Breakdown days / खराब दिन", "Hours / घंटे", "Diesel (L) / डीज़ल", "Amount / राशि"],
      rows: r.machines.map((x) => [x.name, String(x.workedDays), String(x.breakdownDays), x.hoursText, n(x.dieselLtr), x.amountPaise == null ? "— (monthly bill)" : formatINR(x.amountPaise)]),
    });
  }
  if (r.work.length) {
    out.push({ title: "Work Done / किया गया कार्य", head: ["Work / कार्य", "Quantity / मात्रा"], rows: r.work.map((x) => [x.type, `${n(x.qty)} ${x.unit}`]) });
  }
  return out;
}

/** WhatsApp ke liye chhota summary (poori report PDF mein) */
export function periodWhatsapp(r: PeriodReport): string {
  const lines = [`*${r.kind === "WEEK" ? "Weekly" : "Monthly"} report — ${r.projectName}*`, periodLabel(r), ""];
  if (r.empty) lines.push("No entries in this period.");
  else {
    lines.push(`Labour: ${n(r.labour.totals.total)} man-days`, `Staff: ${n(r.staff.staffDays)} staff-days`);
    const diesel = r.stock.find((x) => x.name.toLowerCase().startsWith("diesel"));
    if (diesel) lines.push(`Diesel: ${n(diesel.closing)} L balance (used ${n(diesel.uses)} L)`);
    if (r.machines.length) lines.push(`Machines: ${r.machines.map((m) => `${m.name} ${m.hoursText}`).join(", ")}`);
    if (r.work.length) lines.push(`Work: ${r.work.map((w) => `${w.type} ${n(w.qty)} ${w.unit}`).join(", ")}`);
    lines.push(`DPR: ${r.dpr.locked} locked of ${r.daysCounted} days`);
  }
  lines.push("", "— B.P. Mishra & Co.");
  return lines.join("\n");
}
