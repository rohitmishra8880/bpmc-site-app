import { describe, expect, it } from "vitest";
import { dateRange, daysInMonth } from "./date";
import { toPaise } from "./money";
import { dayRentalPaise, monthlyBill, type MachineDayLog, type RunStatus } from "./rental";

const day = (businessDate: string, status: RunStatus, hours?: number): MachineDayLog =>
  hours === undefined ? { businessDate, status } : { businessDate, status, hours };

/** Poore mahine FULL, kuch din alag status. */
const monthLogs = (month: string, special: Record<string, RunStatus> = {}): MachineDayLog[] =>
  dateRange(`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, "0")}`).map((d) => day(d, special[d] ?? "FULL"));

describe("DAY rate (T2)", () => {
  const rate = toPaise(8000);
  it("Full 8,000 · Half 4,000 · Breakdown / Absent 0", () => {
    expect(dayRentalPaise("DAY", rate, day("2026-10-24", "FULL"))).toBe(toPaise(8000));
    expect(dayRentalPaise("DAY", rate, day("2026-10-24", "HALF"))).toBe(toPaise(4000));
    expect(dayRentalPaise("DAY", rate, day("2026-10-24", "BREAKDOWN"))).toBe(0);
    expect(dayRentalPaise("DAY", rate, day("2026-10-24", "ABSENT"))).toBe(0);
  });
  it("Hour status: 7.8 h × (8,000 ÷ 8) = 7,800", () => {
    expect(dayRentalPaise("DAY", rate, day("2026-10-24", "HOUR", 7.8))).toBe(toPaise(7800));
  });
});

describe("HOUR rate", () => {
  it("7.8 h × 1,200 = 9,360", () => {
    expect(dayRentalPaise("HOUR", toPaise(1200), day("2026-10-24", "FULL", 7.8))).toBe(toPaise(9360));
  });
  it("breakdown 0; ghante na hon to galti", () => {
    expect(dayRentalPaise("HOUR", toPaise(1200), day("2026-10-24", "BREAKDOWN"))).toBe(0);
    expect(() => dayRentalPaise("HOUR", toPaise(1200), day("2026-10-24", "FULL"))).toThrow();
  });
});

describe("MONTH rate — Rohit ka niyam", () => {
  const rate = toPaise(100000);

  it("Oct (31 din) poora chala = 1,00,000", () => {
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs: monthLogs("2026-10") });
    expect(b.rentalPaise).toBe(toPaise(100000));
    expect(b.dayRatePaise).toBe(toPaise(3333.33));
  });

  it("Feb (28 din) poora chala = 1,00,000", () => {
    expect(monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2027-02", logs: monthLogs("2027-02") }).rentalPaise).toBe(toPaise(100000));
  });

  it("2 din breakdown = 1,00,000 − 2 × 3,333.33 = 93,333.33", () => {
    const logs = monthLogs("2026-10", { "2026-10-05": "BREAKDOWN", "2026-10-06": "ABSENT" });
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs });
    expect(b.idleDays).toBe(2);
    expect(b.rentalPaise).toBe(toPaise(93333.33));
  });

  it("advance 20,000 minus → 73,333.33 dena", () => {
    const logs = monthLogs("2026-10", { "2026-10-05": "BREAKDOWN", "2026-10-06": "BREAKDOWN" });
    const b = monthlyBill({
      rateType: "MONTH",
      ratePaise: rate,
      month: "2026-10",
      logs,
      deductions: [
        { kind: "OWNER_ADVANCE", amountPaise: toPaise(15000) },
        { kind: "DRIVER_ADVANCE", amountPaise: toPaise(2000) },
        { kind: "SITE_MATERIAL", amountPaise: toPaise(3000) },
        { kind: "DRIVER_ADVANCE", amountPaise: toPaise(999), deleted: true },
      ],
    });
    expect(b.deductionPaise).toBe(toPaise(20000));
    expect(b.netPaise).toBe(toPaise(73333.33));
  });

  it("half day = ½ din minus, hour = (8 − ghante) ÷ 8 din minus", () => {
    const logs = monthLogs("2026-11", { "2026-11-10": "HALF" }).map((l) => (l.businessDate === "2026-11-11" ? day(l.businessDate, "HOUR", 6) : l));
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-11", logs });
    expect(b.idleDays).toBe(0.75);
    expect(b.rentalPaise).toBe(toPaise(97500));
  });

  it("Rohit: 20 Oct ko aayi → 1,00,000 − (1–19 = 19 din × 3,333.33) = 36,666.67", () => {
    const logs = dateRange("2026-10-20", "2026-10-31").map((d) => day(d, "FULL"));
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs, onSiteFrom: "2026-10-20" });
    expect(b.fullMonth).toBe(false);
    expect(b.siteDays).toBe(12);
    expect(b.rentalPaise).toBe(toPaise(36666.67));
  });

  it("ulta bhi: 10 Oct ko gayi → 1,00,000 − (11–31 = 21 din) = 30,000", () => {
    const logs = dateRange("2026-10-01", "2026-10-10").map((d) => day(d, "FULL"));
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs, onSiteTo: "2026-10-10" });
    expect(b.rentalPaise).toBe(toPaise(30000));
  });

  it("20 ko aayi + beech mein 1 din breakdown → 19 + 1 = 20 din minus = 33,333.33", () => {
    const logs = dateRange("2026-10-20", "2026-10-31").map((d) => day(d, d === "2026-10-25" ? "BREAKDOWN" : "FULL"));
    const b = monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs, onSiteFrom: "2026-10-20" });
    expect(b.rentalPaise).toBe(toPaise(33333.33));
  });

  it("log chhoot gaya to bill mein dikhe", () => {
    const logs = monthLogs("2026-10").filter((l) => l.businessDate !== "2026-10-12");
    expect(monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs }).missingDates).toEqual(["2026-10-12"]);
  });

  it("rental kabhi 0 se neeche nahi", () => {
    const logs = monthLogs("2027-02", Object.fromEntries(dateRange("2027-02-01", "2027-02-28").map((d) => [d, "BREAKDOWN" as RunStatus])));
    expect(monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2027-02", logs }).rentalPaise).toBe(toPaise(6666.67));
    const logs31 = monthLogs("2026-10", Object.fromEntries(dateRange("2026-10-01", "2026-10-31").map((d) => [d, "ABSENT" as RunStatus])));
    expect(monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs: logs31 }).rentalPaise).toBe(0);
  });

  it("ek din mein do log = galti", () => {
    expect(() => monthlyBill({ rateType: "MONTH", ratePaise: rate, month: "2026-10", logs: [day("2026-10-01", "FULL"), day("2026-10-01", "HALF")] })).toThrow();
  });
});

describe("DAY rate ka mahina", () => {
  it("20 Full + 2 Half + 1 Breakdown = 21 × 8,000 = 1,68,000", () => {
    const logs = [
      ...dateRange("2026-10-01", "2026-10-20").map((d) => day(d, "FULL")),
      day("2026-10-21", "HALF"),
      day("2026-10-22", "HALF"),
      day("2026-10-23", "BREAKDOWN"),
    ];
    const b = monthlyBill({ rateType: "DAY", ratePaise: toPaise(8000), month: "2026-10", logs, onSiteTo: "2026-10-23" });
    expect(b.rentalPaise).toBe(toPaise(168000));
    expect(b.missingDates).toEqual([]);
  });
});
