import { describe, expect, it } from "vitest";
import { buildDpr, dprFingerprint, dprFolder, dprHtml, dprMarkdown, dprSame, dprWhatsapp, type DprInput } from "./dpr";

const input = (o: Partial<DprInput> = {}): DprInput => ({
  date: "2026-10-24",
  projectName: "EMRS Keshkal",
  day: {
    stock: {
      diesel: { opening: 246, inward: 600, uses: 200, adjust: 0, closing: 646 },
      gitti: { opening: 0, inward: 50, uses: 30, adjust: 0, closing: 20 },
      steel: { opening: 48.15, inward: 0, uses: 0, adjust: 0, closing: 48.15 },
      reti: { opening: 0, inward: 0, uses: 0, adjust: 0, closing: 0 },
    },
    machines: {
      poc: { status: "FULL", hours: 7.8, hoursText: "7h 48m", dieselLtr: 115, amountPaise: null },
      ajax: { status: "HALF", hours: 1.6, hoursText: "1h 36m", dieselLtr: 80, amountPaise: 400000 },
    },
    machineTotals: { dieselLtr: 195, hours: 9.4, amountPaise: 400000, running: 2, breakdown: 0 },
    labour: { totals: { mistri: 6, kuli: 14, reja: 3, total: 23 }, byContractor: { COMPANY: { mistri: 1, kuli: 1, reja: 3, total: 5 }, suraj: { mistri: 5, kuli: 13, reja: 0, total: 18 } } },
    staff: { present: 2, halfDay: 1, absent: 0, marked: 3 },
    work: {
      byType: { CONCRETE: { qty: 120.5, amountPaise: 78325000, entries: 1, unit: "M³" } },
      byContractor: { suraj: { amountPaise: 78325000, byType: {} } },
      billablePaise: 78325000,
    },
  },
  materials: { diesel: { name: "Diesel", baseUnit: "Ltr" }, gitti: { name: "Aggregate (Gitti)", baseUnit: "cu.m" }, steel: { name: "Steel (TMT)", baseUnit: "MT" }, reti: { name: "Sand (Reti)", baseUnit: "cu.m" } },
  machines: { poc: { name: "Poclain 210" }, ajax: { name: "AJAX II" } },
  contractors: { suraj: { name: "Suraj" } },
  machineLogs: [
    { machineId: "poc", sr: 2944, cr: 2951.8, remark: null, breakdownReason: null },
    { machineId: "ajax", sr: 271.4, cr: 273, remark: "Half shift", breakdownReason: null },
  ],
  workEntries: [{ type: "CONCRETE", contractorId: "suraj", zone: "Pier P1", workLabel: "Footing F1", qty: 120.5, unit: "M³", measure: "10 × 5 × 2.41", ratePaise: 650000 }],
  storeMoves: [
    { type: "INWARD", itemName: "Sheet", qty: 40, unit: "Nos", partyName: "Sharma" },
    { type: "ISSUE", itemName: "Sheet", qty: 24, unit: "Nos", contractorId: "suraj", purpose: "Footing" },
    { type: "RETURN", itemName: "Sheet", qty: 2, unit: "Nos", contractorId: "suraj", condition: "BROKEN" },
  ],
  creditors: { bakayaPaise: 5870000, overduePaise: 500000, toRecoverPaise: 180000 },
  photos: [{ label: "Footing F1", takenAt: "2026-10-24T05:00:00.000Z", lat: 18.9, lng: 81.3, driveFileId: "f1" }],
  ...o,
});

describe("DPR — sirf asli entries se (CLAUDE.md T6, R4)", () => {
  it("stock: Gitti 0 + 50 − 30 = 20, Steel 48.15; sab-zero material nahi; Diesel alag ek hi jagah", () => {
    const d = buildDpr(input());
    expect(d.stock).toEqual([
      { name: "Aggregate (Gitti)", unit: "cu.m", opening: 0, inward: 50, uses: 30, closing: 20 },
      { name: "Steel (TMT)", unit: "MT", opening: 48.15, inward: 0, uses: 0, closing: 48.15 },
    ]);
    expect(d.diesel).toEqual({ opening: 246, inward: 600, uses: 200, closing: 646, machineLtr: 195 });
  });

  it("labour thekedar-wise naam ke saath; staff; kul", () => {
    const d = buildDpr(input());
    expect(d.labour.rows).toEqual([
      { contractor: "Company", mistri: 1, kuli: 1, reja: 3, total: 5 },
      { contractor: "Suraj", mistri: 5, kuli: 13, reja: 0, total: 18 },
    ]);
    expect(d.labour.totals.total).toBe(23);
    expect(d.staff).toEqual({ present: 2, halfDay: 1, absent: 0 });
  });

  it("machine: SR / CR / '7h 48m' / diesel / status / rakam, naam ke saath", () => {
    expect(buildDpr(input()).machines[0]).toEqual({ name: "AJAX II", status: "HALF", sr: 271.4, cr: 273, hoursText: "1h 36m", dieselLtr: 80, amountPaise: 400000, remark: "Half shift" });
    expect(buildDpr(input()).machines[1]).toMatchObject({ name: "Poclain 210", hoursText: "7h 48m", amountPaise: null });
  });

  it("kaam, store, creditor, photo, empty = false", () => {
    const d = buildDpr(input());
    expect(d.work[0]).toEqual({ type: "CONCRETE", contractor: "Suraj", where: "Pier P1 · Footing F1", measure: "10 × 5 × 2.41", qty: 120.5, unit: "M³" });
    expect(d.workTotals).toEqual([{ type: "CONCRETE", qty: 120.5, unit: "M³" }]);
    expect(d.store.map((r) => [r.type, r.item, r.qty, r.who])).toEqual([["INWARD", "Sheet", 40, "Sharma"], ["ISSUE", "Sheet", 24, "Suraj"], ["RETURN", "Sheet", 2, "Suraj"]]);
    expect(d.store[2]!.condition).toBe("BROKEN");
    expect(d.creditors).toEqual({ bakayaPaise: 5870000, overduePaise: 500000, toRecoverPaise: 180000 });
    expect(d.photos).toHaveLength(1);
    expect(d.empty).toBe(false);
  });

  it("us din kuch nahi → empty = true, koi nakli number nahi", () => {
    const d = buildDpr(input({ day: {}, machineLogs: [], workEntries: [], storeMoves: [], photos: [] }));
    expect([d.empty, d.stock, d.diesel, d.machines, d.work, d.store, d.labour.rows]).toEqual([true, [], null, [], [], [], []]);
  });

  it("hataayi entry DPR mein nahi", () => {
    const d = buildDpr(input({ storeMoves: [{ type: "INWARD", itemName: "X", qty: 1, unit: "Nos", deleted: true }], workEntries: [{ type: "STEEL", contractorId: "suraj", qty: 1, unit: "Kg", deleted: true }], photos: [{ label: "x", takenAt: "2026-10-24T05:00:00.000Z", driveFileId: "z", deleted: true }] }));
    expect([d.store, d.work, d.photos]).toEqual([[], [], []]);
  });
});

describe("DPR — version kab bane", () => {
  it("number badla → alag; wahi data → same", () => {
    const a = buildDpr(input());
    const b = buildDpr(input());
    expect(dprSame(a, b)).toBe(true);
    const c = buildDpr(input({ creditors: { bakayaPaise: 1, overduePaise: 0, toRecoverPaise: 0 } }));
    expect(dprSame(a, c)).toBe(false);
  });
});

describe("DPR — Obsidian file aur share", () => {
  it("folder: vault\\Daily Report\\saal\\mahina", () => {
    expect(dprFolder("EMRS KESHKAL", "2026-10-24")).toBe("EMRS KESHKAL/Daily Report/2026/10-October");
  });

  it("markdown: English / हिंदी labels, asli number, ₹ Indian format", () => {
    const md = dprMarkdown(buildDpr(input()), { version: 2, lockedBy: "Rohit Mishra" });
    expect(md).toContain("# DPR — EMRS Keshkal — 24 Oct 2026");
    expect(md).toContain("Version v2");
    expect(md).toContain("Rohit Mishra");
    expect(md).toContain("Opening / पुराना");
    expect(md).toContain("| Aggregate (Gitti) | cu.m | 0 | 50 | 30 | 20 |");
    expect(md).toContain("7h 48m");
    expect(md).toContain("₹58,700.00");
  });

  it("khaali din ki file khaali nahi: saaf likha ho", () => {
    const md = dprMarkdown(buildDpr(input({ day: {}, machineLogs: [], workEntries: [], storeMoves: [], photos: [] })), {});
    expect(md).toContain("Is din koi entry nahi");
  });

  it("PDF html: logo watermark, Hindi label, HTML safe", () => {
    const h = dprHtml(buildDpr(input({ projectName: "A<B" })), { version: 1 }, "data:image/png;base64,AAA");
    expect(h).toContain("data:image/png;base64,AAA");
    expect(h).toContain("सामग्री स्टॉक");
    expect(h).toContain("A&lt;B");
  });

  it("WhatsApp: chhota saaf summary", () => {
    const t = dprWhatsapp(buildDpr(input()), { version: 1 });
    expect(t).toContain("*DPR — EMRS Keshkal — 24 Oct 2026*");
    expect(t).toContain("Labour: 23");
    expect(t).toContain("Diesel: 646");
    expect(t).toContain("Concrete 120.5 M³");
    expect(t).toContain("v1");
  });
});

describe("DPR fingerprint (Firestore se wapas aaye key order par nirbhar nahi)", () => {
  it("wahi data → wahi; badla → alag", () => {
    expect(dprFingerprint(buildDpr(input()))).toBe(dprFingerprint(buildDpr(input())));
    expect(dprFingerprint(buildDpr(input()))).not.toBe(dprFingerprint(buildDpr(input({ creditors: { bakayaPaise: 2, overduePaise: 0 } }))));
  });
});
