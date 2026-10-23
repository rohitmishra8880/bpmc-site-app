import { describe, expect, it } from "vitest";
import { addDays, canEditDate, dateRange, daysInMonth, editWindowClosesAt, formatDate, isBusinessDate } from "./date";

const ist = (s: string) => new Date(`${s}+05:30`);

describe("tarikh", () => {
  it("DD MMM YYYY (T3)", () => {
    expect(formatDate("2026-10-24")).toBe("24 Oct 2026");
  });

  it("galat tarikh pakdo", () => {
    expect(isBusinessDate("2026-02-30")).toBe(false);
    expect(isBusinessDate("24-10-2026")).toBe(false);
    expect(() => addDays("2026-13-01", 1)).toThrow();
  });

  it("mahina / saal paar", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateRange("2026-10-20", "2026-10-23")).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2027-02")).toBe(28);
  });
});

describe("2 din ka edit niyam (Rohit: 24 Oct ki entry 26 Oct raat 11:59 tak)", () => {
  it("window 27 Oct 00:00 IST par band hoti hai", () => {
    expect(editWindowClosesAt("2026-10-24").toISOString()).toBe(ist("2026-10-27T00:00:00").toISOString());
  });

  it("26 Oct 23:59 IST tak edit ho", () => {
    expect(canEditDate("2026-10-24", ist("2026-10-24T09:00:00"))).toBe(true);
    expect(canEditDate("2026-10-24", ist("2026-10-26T23:59:59"))).toBe(true);
  });

  it("27 Oct 00:00 IST se lock", () => {
    expect(canEditDate("2026-10-24", ist("2026-10-27T00:00:00"))).toBe(false);
  });

  it("Admin ne khola to expiry tak edit, phir lock", () => {
    const unlock = { expiresAt: ist("2026-10-30T23:59:59") };
    expect(canEditDate("2026-10-24", ist("2026-10-30T12:00:00"), unlock)).toBe(true);
    expect(canEditDate("2026-10-24", ist("2026-10-31T00:00:00"), unlock)).toBe(false);
  });

  it("aage ki tarikh ki entry nahi", () => {
    expect(canEditDate("2026-10-25", ist("2026-10-24T23:00:00"))).toBe(false);
  });
});
