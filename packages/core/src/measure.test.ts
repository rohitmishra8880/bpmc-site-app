import { describe, expect, it } from "vitest";
import { areaSqM, formatHours, machineHours, steelKgPerM, steelWeightKg, toBaseQty, volumeM3 } from "./measure";

describe("machine ghante (T2)", () => {
  it("2951.8 − 2944.0 = 7.8 hrs = 7h 48m", () => {
    const h = machineHours(2944.0, 2951.8);
    expect(h).toBe(7.8);
    expect(formatHours(h)).toBe("7h 48m");
  });

  it("CR < SR galti pakdo", () => {
    expect(() => machineHours(2951.8, 2944.0)).toThrow();
  });

  it("minute 60 na bane", () => {
    expect(formatHours(7.999)).toBe("8h 0m");
    expect(formatHours(0.5)).toBe("0h 30m");
  });
});

describe("naap (T2)", () => {
  it("10 × 5 × 2.41 = 120.50 M³", () => {
    expect(volumeM3(10, 5, 2.41)).toBe(120.5);
  });

  it("Sq M aur nos", () => {
    expect(areaSqM(3.2, 1.5, 4)).toBe(19.2);
    expect(volumeM3(1.2, 1.2, 0.45, 6)).toBe(3.89);
  });

  it("16mm, 12 m = 1.58 × 12 = 18.96 kg", () => {
    expect(steelKgPerM(16)).toBe(1.58);
    expect(steelWeightKg(16, 12)).toBe(18.96);
  });

  it("IS table se milta hai", () => {
    expect(steelKgPerM(8)).toBe(0.395);
    expect(steelKgPerM(10)).toBe(0.617);
    expect(steelKgPerM(12)).toBe(0.889);
    expect(steelKgPerM(25)).toBe(3.858);
  });
});

describe("unit badalna (Oil & Lubricants)", () => {
  const engineOil = { baseUnit: "Ltr" as const, conversions: { Bucket: 20, Drum: 210 } };

  it("2 Bucket (20 L) = 40 Ltr", () => {
    expect(toBaseQty(2, "Bucket", engineOil)).toBe(40);
  });

  it("500 ml = 0.5 Ltr, 1 Drum = 210 Ltr", () => {
    expect(toBaseQty(500, "ml", engineOil)).toBe(0.5);
    expect(toBaseQty(1, "Drum", engineOil)).toBe(210);
  });

  it("cement Bags (50 kg) → Kg, MT → Kg", () => {
    expect(toBaseQty(10, "Bags", { baseUnit: "Kg", conversions: { Bags: 50 } })).toBe(500);
    expect(toBaseQty(48.15, "MT", { baseUnit: "Kg" })).toBe(48150);
  });

  it("niyam na ho to galti batao, andaza nahi", () => {
    expect(() => toBaseQty(1, "Barrel", engineOil)).toThrow();
  });
});
