import { describe, expect, it } from "vitest";
import { machineDay } from "./machine";
import { toPaise } from "./money";

const d = "2026-10-24";

describe("machine ka din", () => {
  it("company machine: 2944.0 → 2951.8 = 7h 48m, amount nahi (galti #6)", () => {
    expect(machineDay({ businessDate: d, status: "FULL", sr: 2944.0, cr: 2951.8, dieselLtr: 115 }, { name: "Poclain 210", kind: "COMPANY" })).toEqual({
      status: "FULL", hours: 7.8, hoursText: "7h 48m", dieselLtr: 115, amountPaise: null, warning: null,
    });
  });

  it("DAY rate half = 4,000; breakdown = 0", () => {
    const m = { name: "AJAX II", kind: "RENTAL" as const, rateType: "DAY" as const, ratePaise: toPaise(8000) };
    expect(machineDay({ businessDate: d, status: "HALF", sr: 271.4, cr: 273.0 }, m).amountPaise).toBe(toPaise(4000));
    expect(machineDay({ businessDate: d, status: "BREAKDOWN" }, m).amountPaise).toBe(0);
  });

  it("HOUR rate: 7.8 × 1,200 = 9,360; SR/CR na ho to warning, andaza nahi", () => {
    const m = { name: "JCB", kind: "RENTAL" as const, rateType: "HOUR" as const, ratePaise: toPaise(1200) };
    expect(machineDay({ businessDate: d, status: "FULL", sr: 100, cr: 107.8 }, m).amountPaise).toBe(toPaise(9360));
    const r = machineDay({ businessDate: d, status: "FULL" }, m);
    expect(r.amountPaise).toBeNull();
    expect(r.warning).toContain("SR / CR");
  });

  it("MONTH rate ka din-amount null (mahine ke bill mein)", () => {
    expect(machineDay({ businessDate: d, status: "FULL", sr: 1, cr: 9 }, { name: "Poclain 200", kind: "RENTAL", rateType: "MONTH", ratePaise: toPaise(100000) }).amountPaise).toBeNull();
  });

  it("CR < SR → warning, ghante null", () => {
    const r = machineDay({ businessDate: d, status: "FULL", sr: 10, cr: 9 }, { name: "x", kind: "COMPANY" });
    expect(r.hours).toBeNull();
    expect(r.warning).toContain("CR");
  });
});
