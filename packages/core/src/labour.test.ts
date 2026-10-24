import { describe, expect, it } from "vitest";
import { combineLabour, labourEarning, labourKhata, weekDates, weekStart } from "./labour";
import { toPaise } from "./money";

describe("hafta Mon–Sun", () => {
  it("24 Oct 2026 (Sat) → 19–25 Oct", () => {
    expect(weekStart("2026-10-24")).toBe("2026-10-19");
    expect(weekDates("2026-10-24")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });
  it("Monday khud, Sunday, aur mahina paar", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});

const P = (d: string, extra: object = {}) => ({ businessDate: d, mark: "P" as const, ...extra });

describe("labour ki kamai — din × rate + OT (rate ÷ 8 × ghante)", () => {
  it("₹600/din: 5 P + 1 HD + 1 A + 2 ghante OT = 3,300 + 150 = 3,450", () => {
    const e = labourEarning(
      [P("2026-10-19"), P("2026-10-20", { otHours: 2 }), P("2026-10-21"), P("2026-10-22"), P("2026-10-23"),
        { businessDate: "2026-10-24", mark: "HD" }, { businessDate: "2026-10-25", mark: "A" }],
      toPaise(600),
    );
    expect(e).toEqual({ days: 5.5, otHours: 2, wagesPaise: toPaise(3300), otPaise: toPaise(150), amountPaise: toPaise(3450) });
  });

  it("entry par save hua rate hi lagega (baad mein rate badla to purana hisab nahi badalta)", () => {
    const e = labourEarning([P("2026-10-19", { ratePaise: toPaise(500) }), P("2026-10-20")], toPaise(600));
    expect(e.wagesPaise).toBe(toPaise(1100));
  });

  it("hataayi entry nahi gini; ek din ki do entry → galti", () => {
    expect(labourEarning([P("2026-10-19"), P("2026-10-20", { deleted: true })], toPaise(600)).days).toBe(1);
    expect(() => labourEarning([P("2026-10-19"), P("2026-10-19")], 100)).toThrow(/2026-10-19/);
  });

  it("OT galat: minus ya 16 ghante se zyada", () => {
    expect(() => labourEarning([P("2026-10-19", { otHours: -1 })], 100)).toThrow();
    expect(() => labourEarning([P("2026-10-19", { otHours: 17 })], 100)).toThrow();
  });

  it("Absent din par OT nahi", () => {
    expect(() => labourEarning([{ businessDate: "2026-10-19", mark: "A", otHours: 2 }], 100)).toThrow(/Absent/);
  });
});

describe("labour khata — kamai − advance / bhugtan", () => {
  it("3,450 kamai − 1,000 advance − 2,000 bhugtan = 450 dena", () => {
    const k = labourKhata({
      ratePaise: toPaise(600),
      marks: [P("2026-10-19"), P("2026-10-20", { otHours: 2 }), P("2026-10-21"), P("2026-10-22"), P("2026-10-23"), { businessDate: "2026-10-24", mark: "HD" }],
      payments: [
        { kind: "ADVANCE", amountPaise: toPaise(1000) },
        { kind: "PAYMENT", amountPaise: toPaise(2000) },
        { kind: "PAYMENT", amountPaise: toPaise(500), deleted: true },
      ],
    });
    expect([k.earnedPaise, k.paidPaise, k.balancePaise]).toEqual([toPaise(3450), toPaise(3000), toPaise(450)]);
  });
});

describe("din ki labour gin-ti — gin-ti wali entry + naam-wise haazri", () => {
  it("naam-wise P / HD = haazir, A nahi; thekedar ki gin-ti saath mein", () => {
    const m = combineLabour(
      [{ contractorId: "suraj", mistri: 3, kuli: 5, reja: 0 }],
      [
        { group: "COMPANY", type: "MISTRI", mark: "P" },
        { group: "COMPANY", type: "KULI", mark: "HD" },
        { group: "COMPANY", type: "REJA", mark: "A" },
        { group: "COMPANY", type: "REJA", mark: "P" },
      ],
    );
    expect(m).toEqual([
      { contractorId: "suraj", mistri: 3, kuli: 5, reja: 0 },
      { contractorId: "COMPANY", mistri: 1, kuli: 1, reja: 1 },
    ]);
  });

  it("ek thekedar ki dono tarah entry → naam-wise wali gini jaaye (double nahi)", () => {
    const m = combineLabour([{ contractorId: "suraj", mistri: 9, kuli: 9, reja: 9 }], [{ group: "suraj", type: "KULI", mark: "P" }]);
    expect(m).toEqual([{ contractorId: "suraj", mistri: 0, kuli: 1, reja: 0 }]);
  });
});
