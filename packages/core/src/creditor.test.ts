import { describe, expect, it } from "vitest";
import { partyStatus } from "./creditor";

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
