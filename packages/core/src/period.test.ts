import { describe, expect, it } from "vitest";
import { buildPeriodReport, periodRange, periodSections, periodWhatsapp, type PeriodInput } from "./period";

const input = (o: Partial<PeriodInput> = {}): PeriodInput => ({
  kind: "WEEK",
  from: "2026-11-16",
  to: "2026-11-22",
  upto: "2026-11-17",
  projectName: "EMRS Keshkal",
  materials: { diesel: { name: "Diesel", baseUnit: "Ltr" }, cement: { name: "Cement", baseUnit: "Bags" }, sand: { name: "Sand (Reti)", baseUnit: "cu.m" } },
  machines: { poc: { name: "Poclain 210" }, jcb: { name: "JCB 3DX" } },
  contractors: { suraj: { name: "Suraj" }, hemlal: { name: "Hemlal" } },
  days: [
    {
      date: "2026-11-16",
      stock: { diesel: { opening: 246, inward: 600, uses: 200, adjust: 0, closing: 646 }, cement: { opening: 0, inward: 50, uses: 30, adjust: 0, closing: 20 }, sand: { opening: 0, inward: 0, uses: 0, adjust: 0, closing: 0 } },
      machines: { poc: { status: "FULL", hours: 7.8, dieselLtr: 115, amountPaise: null }, jcb: { status: "BREAKDOWN", hours: null, dieselLtr: 0, amountPaise: 0 } },
      labour: { totals: { mistri: 4, kuli: 6, reja: 3, total: 13 }, byContractor: { COMPANY: { mistri: 1, kuli: 1, reja: 3, total: 5 }, suraj: { mistri: 3, kuli: 5, reja: 0, total: 8 } } },
      staff: { present: 2, halfDay: 1, absent: 0 },
      work: { byType: { CONCRETE: { qty: 120.5, unit: "M³" } } },
    },
    {
      date: "2026-11-17",
      stock: { diesel: { opening: 646, inward: 0, uses: 100, adjust: 0, closing: 546 }, cement: { opening: 20, inward: 0, uses: 5, adjust: 0, closing: 15 } },
      machines: { poc: { status: "FULL", hours: 8, dieselLtr: 100, amountPaise: null }, jcb: { status: "FULL", hours: 6.5, dieselLtr: 60, amountPaise: 800000 } },
      labour: { totals: { mistri: 3, kuli: 9, reja: 3, total: 15 }, byContractor: { COMPANY: { mistri: 1, kuli: 1, reja: 3, total: 5 }, hemlal: { mistri: 2, kuli: 8, reja: 0, total: 10 } } },
      staff: { present: 3, halfDay: 0, absent: 0 },
      work: { byType: { CONCRETE: { qty: 10, unit: "M³" }, SHUTTERING: { qty: 45, unit: "Sq M" } } },
    },
  ],
  dprStatus: { "2026-11-16": "LOCKED", "2026-11-17": "DRAFT" },
  ...o,
});

describe("hafte / mahine ki report — sirf server ke din ke hisab (days/) se", () => {
  it("stock: pehle din ka opening, sabka aaya / kharch, aakhri din ka closing (246 + 600 − 300 = 546)", () => {
    const r = buildPeriodReport(input());
    expect(r.stock).toEqual([
      { name: "Cement", unit: "Bags", opening: 0, inward: 50, uses: 35, closing: 15 },
      { name: "Diesel", unit: "Ltr", opening: 246, inward: 600, uses: 300, closing: 546 },
    ]);
  });

  it("labour: thekedar-wise man-days (Company pehle), kul 28", () => {
    const r = buildPeriodReport(input());
    expect(r.labour.rows).toEqual([
      { contractor: "Company", mistri: 2, kuli: 2, reja: 6, total: 10 },
      { contractor: "Hemlal", mistri: 2, kuli: 8, reja: 0, total: 10 },
      { contractor: "Suraj", mistri: 3, kuli: 5, reja: 0, total: 8 },
    ]);
    expect(r.labour.totals).toEqual({ mistri: 7, kuli: 15, reja: 6, total: 28 });
  });

  it("staff: P / HD / A ke din, staff-days = P + HD ÷ 2 = 5.5", () => {
    expect(buildPeriodReport(input()).staff).toEqual({ present: 5, halfDay: 1, absent: 0, staffDays: 5.5 });
  });

  it("machine: chale din, breakdown din, ghante (15.8 = 15h 48m), diesel, rakam (company machine ka nahi)", () => {
    expect(buildPeriodReport(input()).machines).toEqual([
      { name: "JCB 3DX", workedDays: 1, breakdownDays: 1, hours: 6.5, hoursText: "6h 30m", dieselLtr: 60, amountPaise: 800000 },
      { name: "Poclain 210", workedDays: 2, breakdownDays: 0, hours: 15.8, hoursText: "15h 48m", dieselLtr: 215, amountPaise: null },
    ]);
  });

  it("kaam: type-wise jod (Concrete 130.5 M³, Shuttering 45 Sq M); din, DPR lock ki gintti", () => {
    const r = buildPeriodReport(input());
    expect(r.work).toEqual([{ type: "Concrete", qty: 130.5, unit: "M³" }, { type: "Shuttering", qty: 45, unit: "Sq M" }]);
    expect([r.daysCounted, r.daysWithEntries, r.dpr]).toEqual([2, 2, { locked: 1, draft: 1, none: 0 }]);
  });

  it("koi din nahi → khaali, saaf likha (kabhi khaali file nahi)", () => {
    const r = buildPeriodReport(input({ days: [], dprStatus: {} }));
    expect(r.empty).toBe(true);
    expect(periodSections(r)[0]).toEqual({ title: "No entries / कोई प्रविष्टि नहीं", rows: [["No entries in this period / इस अवधि में कोई प्रविष्टि नहीं"]] });
  });

  it("sections English / हिंदी; WhatsApp chhota summary", () => {
    const r = buildPeriodReport(input());
    expect(periodSections(r).map((s) => s.title)).toEqual([
      "Summary / सारांश", "Staff & Labour (man-days) / स्टाफ और मजदूर (मानव-दिवस)", "Material Stock / सामग्री स्टॉक", "Machinery / मशीनरी", "Work Done / किया गया कार्य",
    ]);
    const t = periodWhatsapp(r);
    expect(t).toContain("*Weekly report — EMRS Keshkal*");
    expect(t).toContain("16 Nov 2026 – 22 Nov 2026");
    expect(t).toContain("Labour: 28 man-days");
    expect(t).toContain("Diesel: 546");
    expect(t).toContain("Concrete 130.5 M³");
  });
});

describe("hafta / mahina ki tarikh", () => {
  it("hafta Somvar se Ravivar; mahina 1 se aakhri din", () => {
    expect(periodRange("WEEK", "2026-11-19")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodRange("MONTH", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
