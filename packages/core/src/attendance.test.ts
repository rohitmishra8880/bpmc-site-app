import { describe, expect, it } from "vitest";
import { labourDay, staffKhata } from "./attendance";
import { toPaise } from "./money";

describe("labour muster — thekedar-wise Mistri / Kuli / Reja", () => {
  it("design ka udaharan: Company 1/1/3, Suraj 3/5/0, Hemlal 2/8/0 = 6/14/3 = 23", () => {
    const d = labourDay([
      { contractorId: "COMPANY", mistri: 1, kuli: 1, reja: 3 },
      { contractorId: "suraj", mistri: 3, kuli: 5, reja: 0 },
      { contractorId: "hemlal", mistri: 2, kuli: 8, reja: 0 },
    ]);
    expect(d.totals).toEqual({ mistri: 6, kuli: 14, reja: 3, total: 23 });
    expect(d.byContractor.suraj).toEqual({ mistri: 3, kuli: 5, reja: 0, total: 8 });
  });

  it("hataayi entry nahi gini jaati", () => {
    const d = labourDay([
      { contractorId: "suraj", mistri: 3, kuli: 5, reja: 0 },
      { contractorId: "hemlal", mistri: 9, kuli: 9, reja: 9, deleted: true },
    ]);
    expect(d.totals.total).toBe(8);
    expect(d.byContractor.hemlal).toBeUndefined();
  });

  it("ek thekedar ki do entry → galti (server pehle sabse nayi chunta hai)", () => {
    expect(() => labourDay([
      { contractorId: "suraj", mistri: 1, kuli: 1, reja: 1 },
      { contractorId: "suraj", mistri: 2, kuli: 2, reja: 2 },
    ])).toThrow(/suraj/);
  });

  it("aadha aadmi ya minus nahi", () => {
    expect(() => labourDay([{ contractorId: "x", mistri: 1.5, kuli: 0, reja: 0 }])).toThrow();
    expect(() => labourDay([{ contractorId: "x", mistri: 0, kuli: -1, reja: 0 }])).toThrow();
  });

  it("koi entry nahi → sab 0", () => {
    expect(labourDay([]).totals).toEqual({ mistri: 0, kuli: 0, reja: 0, total: 0 });
  });
});

describe("staff khata — kamai − diya", () => {
  it("purane app jaisa: ₹28,000/mahina, 1 din P, ₹2,000 advance → −₹1,066.67", () => {
    const k = staffKhata({
      salaryPaise: toPaise(28000),
      attendance: [{ businessDate: "2026-10-24", mark: "P" }],
      payments: [{ businessDate: "2026-10-24", kind: "ADVANCE", amountPaise: toPaise(2000) }],
    });
    expect(k.dayRatePaise).toBe(toPaise(933.33));
    expect(k.earnedPaise).toBe(toPaise(933.33));
    expect(k.paidPaise).toBe(toPaise(2000));
    expect(k.balancePaise).toBe(toPaise(-1066.67));
  });

  it("HD = aadha din, A = 0: 28 P + 2 HD + 1 A = 29 din × 28,000 ÷ 30 = 27,066.67", () => {
    const attendance = [
      ...Array.from({ length: 28 }, (_, i) => ({ businessDate: `2026-10-${String(i + 1).padStart(2, "0")}`, mark: "P" as const })),
      { businessDate: "2026-10-29", mark: "HD" as const },
      { businessDate: "2026-10-30", mark: "HD" as const },
      { businessDate: "2026-10-31", mark: "A" as const },
    ];
    const k = staffKhata({ salaryPaise: toPaise(28000), attendance, payments: [] });
    expect([k.presentDays, k.halfDays, k.absentDays]).toEqual([28, 2, 1]);
    expect(k.earnedPaise).toBe(toPaise(27066.67));
  });

  it("tankhwah di, advance di, staff ne site ke liye apna kharcha kiya", () => {
    const k = staffKhata({
      salaryPaise: toPaise(30000),
      attendance: Array.from({ length: 10 }, (_, i) => ({ businessDate: `2026-10-${String(i + 1).padStart(2, "0")}`, mark: "P" as const })),
      payments: [
        { businessDate: "2026-10-05", kind: "ADVANCE", amountPaise: toPaise(3000) },
        { businessDate: "2026-10-10", kind: "SALARY", amountPaise: toPaise(5000) },
        { businessDate: "2026-10-08", kind: "EXPENSE", amountPaise: toPaise(450) },
        { businessDate: "2026-10-09", kind: "ADVANCE", amountPaise: toPaise(999), deleted: true },
      ],
    });
    // kamai 10 × 1,000 = 10,000 + kharcha wapas 450 = 10,450; diya 8,000 → baaki 2,450 dena
    expect(k.earnedPaise).toBe(toPaise(10000));
    expect(k.expensePaise).toBe(toPaise(450));
    expect(k.paidPaise).toBe(toPaise(8000));
    expect(k.balancePaise).toBe(toPaise(2450));
  });

  it("ek din ki do haazri → galti", () => {
    expect(() => staffKhata({ salaryPaise: 100, attendance: [{ businessDate: "2026-10-01", mark: "P" }, { businessDate: "2026-10-01", mark: "A" }], payments: [] })).toThrow(/2026-10-01/);
  });

  it("tankhwah set nahi → kamai 0, diya phir bhi gina", () => {
    const k = staffKhata({ salaryPaise: null, attendance: [{ businessDate: "2026-10-01", mark: "P" }], payments: [{ businessDate: "2026-10-01", kind: "ADVANCE", amountPaise: 500 }] });
    expect(k.earnedPaise).toBe(0);
    expect(k.balancePaise).toBe(-500);
  });
});
