import { describe, expect, it } from "vitest";
import { lineAmount, partyBalance } from "./ledger";
import { toPaise } from "./money";

describe("saman ki kul rakam (T2)", () => {
  it("10 × ₹450 + 18% GST = ₹5,310", () => {
    expect(lineAmount(10, toPaise(450), 18)).toEqual({ basePaise: 450000, gstPaise: 81000, totalPaise: 531000 });
  });

  it("GST na ho to Qty × Rate", () => {
    expect(lineAmount(2.5, toPaise(99.99)).totalPaise).toBe(24998);
  });

  it("galat GST pakdo", () => {
    expect(() => lineAmount(1, 100, -5)).toThrow();
  });
});

describe("creditor bakaya (T2)", () => {
  it("Bakaya = Kul bill − Kul bhugtan", () => {
    const b = partyBalance([
      { type: "BILL", amountPaise: toPaise(100000) },
      { type: "BILL", amountPaise: toPaise(25000) },
      { type: "PAYMENT", amountPaise: toPaise(60000) },
      { type: "DEBIT_NOTE", amountPaise: toPaise(5000) },
      { type: "PAYMENT", amountPaise: toPaise(9999), deleted: true },
    ]);
    expect(b).toEqual({ totalBillPaise: toPaise(120000), totalPaidPaise: toPaise(60000), bakayaPaise: toPaise(60000) });
  });
});
