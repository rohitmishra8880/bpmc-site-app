import { describe, expect, it } from "vitest";
import { contractorStatement, partyStatus } from "./creditor";

const L = (id: string, businessDate: string, type: "BILL" | "PAYMENT" | "DEBIT_NOTE" | "RECOVERY", amountPaise: number, deleted?: boolean) => ({ id, businessDate, type, amountPaise, deleted });

describe("creditor — party ka bakaya aur overdue (CLAUDE.md T2: bakaya = kul bill − kul bhugtan)", () => {
  it("2 bill, 1 payment; credit 7 din; payment pehle purane bill mein → purana bill ₹33,700 8 din se overdue", () => {
    const s = partyStatus([L("b1", "2026-10-10", "BILL", 5370000), L("b2", "2026-10-20", "BILL", 3540000), L("p1", "2026-10-22", "PAYMENT", 2000000)], "2026-10-25", 7);
    expect(s).toEqual({
      billPaise: 8910000, paidPaise: 2000000, lessPaise: 0, bakayaPaise: 6910000,
      overduePaise: 3370000, overdueDays: 8, oldestUnpaid: "2026-10-10", lastPayment: "2026-10-22", entries: 3,
    });
  });

  it("debit note / recovery bhi bakaya ghatate hain; hataayi entry nahi; sab chuka → overdue 0", () => {
    const s = partyStatus(
      [L("b1", "2026-10-01", "BILL", 100000), L("d1", "2026-10-02", "DEBIT_NOTE", 20000), L("p1", "2026-10-03", "PAYMENT", 80000), L("x", "2026-10-04", "BILL", 999, true)],
      "2026-10-25",
      30,
    );
    expect([s.bakayaPaise, s.lessPaise, s.overduePaise, s.overdueDays, s.oldestUnpaid, s.entries]).toEqual([0, 20000, 0, 0, null, 3]);
  });

  it("zyada diya → bakaya minus (advance); credit din na ho to 0 = turant due", () => {
    expect(partyStatus([L("p", "2026-10-05", "PAYMENT", 50000)], "2026-10-25", null).bakayaPaise).toBe(-50000);
    expect(partyStatus([L("b", "2026-10-24", "BILL", 1000)], "2026-10-25", null)).toMatchObject({ overduePaise: 1000, overdueDays: 1 });
  });

  it("thekedar: sirf katauti → minus (us se lena hai), overdue nahi", () => {
    expect(partyStatus([L("r", "2026-10-25", "RECOVERY", 180000)], "2026-10-25", 0)).toMatchObject({ bakayaPaise: -180000, overduePaise: 0 });
  });
});

describe("thekedar ka statement (kaam bill − advance − labour − bhugtan − katauti)", () => {
  const K = (id: string, businessDate: string, type: "BILL" | "PAYMENT" | "DEBIT_NOTE" | "RECOVERY", amountPaise: number, paymentKind?: string, deleted?: boolean) => ({ id, businessDate, type, amountPaise, paymentKind, deleted });
  const lines = [
    K("b1", "2026-10-01", "BILL", 100000),
    K("a1", "2026-10-02", "PAYMENT", 30000, "ADVANCE"),
    K("w2", "2026-10-10", "BILL", 500000),
    K("a2", "2026-10-12", "PAYMENT", 100000, "ADVANCE"),
    K("l1", "2026-10-15", "PAYMENT", 50000, "LABOUR"),
    K("p1", "2026-10-20", "PAYMENT", 200000),
    K("r1", "2026-10-22", "RECOVERY", 18000),
    K("d1", "2026-10-23", "DEBIT_NOTE", 2000),
    K("x", "2026-10-24", "BILL", 777, undefined, true),
    K("n1", "2026-11-01", "BILL", 999),
  ];

  it("period ka hisab: opening 70,000 paise + bill − advance − labour − bhugtan − katauti = closing", () => {
    const s = contractorStatement(lines, "2026-10-10", "2026-10-31");
    expect(s).toMatchObject({ openingPaise: 70000, workBillPaise: 500000, advancePaise: 100000, labourPaidPaise: 50000, paidPaise: 200000, lessPaise: 20000, closingPaise: 200000 });
  });

  it("rows sirf period ke, chalte baaki ke saath; hataayi nahi", () => {
    const s = contractorStatement(lines, "2026-10-10", "2026-10-31");
    expect(s.rows.map((r) => [r.id, r.balancePaise])).toEqual([["w2", 570000], ["a2", 470000], ["l1", 420000], ["p1", 220000], ["r1", 202000], ["d1", 200000]]);
  });

  it("kuch na ho to sab 0", () => {
    expect(contractorStatement([], "2026-10-01", "2026-10-31")).toMatchObject({ openingPaise: 0, closingPaise: 0, rows: [] });
  });
});
