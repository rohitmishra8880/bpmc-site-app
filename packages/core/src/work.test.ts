import { describe, expect, it } from "vitest";
import { workAmount, workQuantity, workStatement, workTotals, type WorkEntryLite } from "./work";

const W = (o: Partial<WorkEntryLite> & Pick<WorkEntryLite, "type" | "qty">): WorkEntryLite => ({
  id: `w${Math.random()}`, businessDate: "2026-10-24", contractorId: "suraj", unit: o.type === "STEEL" ? "Kg" : o.type === "SHUTTERING" ? "Sq M" : "M³", ...o,
});

describe("Daily Work — naap (CLAUDE.md T2)", () => {
  it("Concrete: 10 × 5 × 2.41 = 120.50 M³; nos se guna", () => {
    expect(workQuantity({ type: "CONCRETE", l: 10, w: 5, h: 2.41 })).toEqual({ qty: 120.5, unit: "M³" });
    expect(workQuantity({ type: "CONCRETE", l: 2, w: 2, h: 0.5, nos: 12 })).toEqual({ qty: 24, unit: "M³" });
  });
  it("Excavation bhi M³", () => {
    expect(workQuantity({ type: "EXCAVATION", l: 4, w: 3, h: 1.5 })).toEqual({ qty: 18, unit: "M³" });
  });
  it("Shuttering: L × H × nos = Sq M", () => {
    expect(workQuantity({ type: "SHUTTERING", l: 12, w: 3, nos: 2 })).toEqual({ qty: 72, unit: "Sq M" });
  });
  it("Steel: D² ÷ 162 × L × nos → 16mm, 12 m = 18.96 kg; 10 nos = 189.6", () => {
    expect(workQuantity({ type: "STEEL", diaMm: 16, lengthM: 12 })).toEqual({ qty: 18.96, unit: "Kg" });
    expect(workQuantity({ type: "STEEL", diaMm: 16, lengthM: 12, nos: 10 })).toEqual({ qty: 189.6, unit: "Kg" });
  });
  it("galat / adhoora naap nahi: 0 ya minus, steel bina dia", () => {
    expect(() => workQuantity({ type: "CONCRETE", l: 0, w: 5, h: 2 })).toThrow();
    expect(() => workQuantity({ type: "CONCRETE", l: 10, w: -5, h: 2 })).toThrow();
    expect(() => workQuantity({ type: "STEEL", lengthM: 12 })).toThrow();
    expect(() => workQuantity({ type: "CONCRETE", l: 1, w: 1, h: 1, nos: 0 })).toThrow();
  });
});

describe("Daily Work — thekedar ka bill", () => {
  it("rakam = qty × rate: 120.5 M³ × ₹6,500 = ₹7,83,250", () => {
    expect(workAmount(120.5, 650000)).toBe(78325000);
  });
  it("paise round half-up; rate na ho to 0", () => {
    expect(workAmount(0.333, 100)).toBe(33);
    expect(workAmount(5, null)).toBe(0);
  });
});

describe("Daily Work — din / thekedar ke total", () => {
  const rows = [
    W({ type: "CONCRETE", qty: 120.5, ratePaise: 650000, contractorId: "suraj" }),
    W({ type: "CONCRETE", qty: 24, ratePaise: 650000, contractorId: "hemlal" }),
    W({ type: "SHUTTERING", qty: 72, ratePaise: 35000, contractorId: "suraj" }),
    W({ type: "STEEL", qty: 189.6, ratePaise: 1100, contractorId: "COMPANY" }),
    W({ type: "STEEL", qty: 999, ratePaise: 1, deleted: true }),
  ];
  it("type-wise kul (hataayi nahi), 2 decimal", () => {
    const t = workTotals(rows);
    expect(t.byType.CONCRETE).toEqual({ qty: 144.5, amountPaise: 78325000 + 15600000, entries: 2, unit: "M³" });
    expect(t.byType.SHUTTERING).toMatchObject({ qty: 72, amountPaise: 2520000, entries: 1 });
    expect(t.byType.STEEL).toMatchObject({ qty: 189.6, entries: 1 });
    expect(t.byType.EXCAVATION).toBeUndefined();
  });
  it("thekedar-wise bill; COMPANY (apna kaam) ka bill nahi banta", () => {
    const t = workTotals(rows);
    expect(t.byContractor.suraj!.amountPaise).toBe(78325000 + 2520000);
    expect(t.byContractor.hemlal!.amountPaise).toBe(15600000);
    expect(t.billablePaise).toBe(78325000 + 2520000 + 15600000);
    expect(t.byContractor.COMPANY!.amountPaise).toBe(208560);
  });
});

describe("Daily Work — thekedar ka statement (day-wise)", () => {
  it("tarikh ke kram mein; din ka kul; period ka kul type-wise", () => {
    const s = workStatement(
      [
        W({ type: "CONCRETE", qty: 10, ratePaise: 100000, businessDate: "2026-10-22" }),
        W({ type: "CONCRETE", qty: 5, ratePaise: 100000, businessDate: "2026-10-21" }),
        W({ type: "SHUTTERING", qty: 20, ratePaise: 5000, businessDate: "2026-10-22" }),
        W({ type: "CONCRETE", qty: 1, ratePaise: 100000, businessDate: "2026-10-22", contractorId: "hemlal" }),
      ],
      "suraj",
    );
    expect(s.days.map((d) => [d.businessDate, d.amountPaise])).toEqual([["2026-10-21", 500000], ["2026-10-22", 1100000]]);
    expect(s.totals.CONCRETE).toMatchObject({ qty: 15, amountPaise: 1500000 });
    expect(s.amountPaise).toBe(1600000);
  });
});
