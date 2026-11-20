import { describe, expect, it } from "vitest";
import { brickCount, CONCRETE_GRADES, concreteMix, convertUnit } from "./help";
import { normalizePhone } from "./validate";

describe("concrete mix calculator (nominal mix, IS 456 — dry volume × 1.54)", () => {
  it("M20 (1 : 1.5 : 3), 1 M³ → cement 403.2 kg = 8.06 bag (khareedna 9), reti 0.42 M³, gitti 0.84 M³, paani 201.6 L", () => {
    expect(concreteMix("M20", 1)).toEqual({
      grade: "M20", ratio: [1, 1.5, 3], wetM3: 1, dryM3: 1.54,
      cementKg: 403.2, cementBags: 8.06, bagsToBuy: 9,
      sandM3: 0.42, sandCft: 14.83, aggregateM3: 0.84, aggregateCft: 29.66, waterL: 201.6,
    });
  });

  it("M15 (1 : 2 : 4), 10 × 5 × 0.15 = 7.5 M³ → 7.5 × 1.54 ÷ 7 = 1.65 M³ cement = 47.52 bag", () => {
    const m = concreteMix("M15", 7.5);
    expect([m.cementBags, m.bagsToBuy, m.sandM3, m.aggregateM3]).toEqual([47.52, 48, 3.3, 6.6]);
  });

  it("saare grade aur unke ratio", () => {
    expect(CONCRETE_GRADES).toEqual([
      ["M5", [1, 5, 10]], ["M7.5", [1, 4, 8]], ["M10", [1, 3, 6]], ["M15", [1, 2, 4]], ["M20", [1, 1.5, 3]], ["M25", [1, 1, 2]],
    ]);
  });

  it("galat volume / grade → saaf error", () => {
    expect(() => concreteMix("M20", 0)).toThrow("Volume must be more than 0");
    expect(() => concreteMix("M99" as never, 1)).toThrow("Unknown grade M99");
  });
});

describe("eent ki ginti", () => {
  it("modular eent (190×90×90 + 10 mm masala) = 500 / M³; 2 M³ + 5% wastage = 1,050", () => {
    expect(brickCount(2, "MODULAR", 5)).toBe(1050);
  });
  it("purani lal eent (230×110×75 + masala) 1 M³ = 409 (upar round)", () => {
    expect(brickCount(1, "TRADITIONAL", 0)).toBe(409);
  });
});

describe("unit badalna (site par jo bola jaata hai)", () => {
  it("cu.m ↔ cft, brass (100 cft), sq m ↔ sq ft, MT ↔ kg, m ↔ ft", () => {
    expect(convertUnit(1, "cu.m", "cft")).toBe(35.315);
    expect(convertUnit(1, "brass", "cu.m")).toBe(2.832);
    expect(convertUnit(10, "cu.m", "brass")).toBe(3.531);
    expect(convertUnit(1, "Sq M", "sq ft")).toBe(10.764);
    expect(convertUnit(2.5, "MT", "Kg")).toBe(2500);
    expect(convertUnit(3, "Mtr", "ft")).toBe(9.843);
  });
  it("alag tarah ki unit (M³ → Kg) → error", () => {
    expect(() => convertUnit(1, "cu.m", "Kg")).toThrow("Cannot convert cu.m to Kg");
  });
});

describe("emergency number (contacts)", () => {
  it("mobile 10 ank, 108 / 112 jaise chhote number, STD wala landline", () => {
    expect(normalizePhone("+91 98271 23456")).toBe("9827123456");
    expect(normalizePhone("108")).toBe("108");
    expect(normalizePhone("1912")).toBe("1912");
    expect(normalizePhone("07786-242100")).toBe("07786242100");
  });
  it("galat number → null", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+1 800 555 0100")).toBeNull();
  });
});
