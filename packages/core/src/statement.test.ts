import { describe, expect, it } from "vitest";
import { labourStatement, labourVisibleInWeek, staffMonthly } from "./statement";
import { toPaise } from "./money";

const P = (d: string, extra: object = {}) => ({ businessDate: d, mark: "P" as const, ...extra });

describe("labour statement — hafta-wise kamai, diya, chalta baaki", () => {
  it("Ramu: 2 hafte, advance + payment, baaki aage chalta hai", () => {
    const rows = labourStatement({
      ratePaise: toPaise(600),
      marks: [P("2026-10-19", { otHours: 2 }), P("2026-10-20"), { businessDate: "2026-10-21", mark: "HD" }, P("2026-10-27")],
      payments: [
        { businessDate: "2026-10-20", amountPaise: toPaise(500) },
        { businessDate: "2026-10-28", amountPaise: toPaise(1000) },
        { businessDate: "2026-10-28", amountPaise: toPaise(99), deleted: true },
      ],
    });
    expect(rows).toEqual([
      { weekStart: "2026-10-19", days: 2.5, otHours: 2, earnedPaise: toPaise(1650), paidPaise: toPaise(500), balancePaise: toPaise(1150) },
      { weekStart: "2026-10-26", days: 1, otHours: 0, earnedPaise: toPaise(600), paidPaise: toPaise(1000), balancePaise: toPaise(750) },
    ]);
  });

  it("sirf payment wala hafta bhi dikhe (0 din)", () => {
    const rows = labourStatement({ ratePaise: 100, marks: [], payments: [{ businessDate: "2026-11-04", amountPaise: 50 }] });
    expect(rows).toEqual([{ weekStart: "2026-11-02", days: 0, otHours: 0, earnedPaise: 0, paidPaise: 50, balancePaise: -50 }]);
  });
});

describe("staff mahina-wise — P / HD / A, kamai, diya, chalta baaki", () => {
  it("Oct + Nov, ₹28,000/mahina", () => {
    const oct = [
      ...Array.from({ length: 28 }, (_, i) => P(`2026-10-${String(i + 1).padStart(2, "0")}`)),
      { businessDate: "2026-10-29", mark: "HD" as const },
      { businessDate: "2026-10-30", mark: "HD" as const },
      { businessDate: "2026-10-31", mark: "A" as const },
    ];
    const rows = staffMonthly({
      salaryPaise: toPaise(28000),
      attendance: [...oct, P("2026-11-02"), P("2026-11-03")],
      payments: [
        { businessDate: "2026-10-15", kind: "ADVANCE", amountPaise: toPaise(3000) },
        { businessDate: "2026-10-20", kind: "EXPENSE", amountPaise: toPaise(200) },
        { businessDate: "2026-11-05", kind: "SALARY", amountPaise: toPaise(25000) },
      ],
    });
    expect(rows).toEqual([
      { month: "2026-10", present: 28, halfDay: 2, absent: 1, earnedPaise: toPaise(27066.67), expensePaise: toPaise(200), paidPaise: toPaise(3000), balancePaise: toPaise(24266.67) },
      { month: "2026-11", present: 2, halfDay: 0, absent: 0, earnedPaise: toPaise(1866.67), expensePaise: 0, paidPaise: toPaise(25000), balancePaise: toPaise(1133.34) },
    ]);
  });
});

describe("site chhod chuka labour — sheet par kab dikhe", () => {
  it("chalu labour hamesha", () => {
    expect(labourVisibleInWeek({ active: true }, "2026-10-26", false)).toBe(true);
    expect(labourVisibleInWeek({}, "2026-10-26", false)).toBe(true);
  });
  it("21 Oct ko gaya: 19–25 wale hafte mein dikhe, agle hafte nahi", () => {
    const l = { active: false, leftOn: "2026-10-21" };
    expect(labourVisibleInWeek(l, "2026-10-19", false)).toBe(true);
    expect(labourVisibleInWeek(l, "2026-10-26", false)).toBe(false);
  });
  it("band hai par us hafte ki entry hai → dikhe (purana hisab chhupna nahi chahiye)", () => {
    expect(labourVisibleInWeek({ active: false, leftOn: "2026-10-01" }, "2026-10-26", true)).toBe(true);
  });
});
