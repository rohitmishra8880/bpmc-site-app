import { describe, expect, it } from "vitest";
import { latestMarks, reportFileName, runningLedger } from "./report";

describe("PDF report — haazri grid (ek din ek mark, aakhri badlav)", () => {
  it("ek din do entry → bada rev; hataayi nahi; dusre din alag", () => {
    const g = latestMarks([
      { key: "anil", businessDate: "2026-10-20", mark: "P", rev: 1 },
      { key: "anil", businessDate: "2026-10-20", mark: "HD", rev: 2 },
      { key: "anil", businessDate: "2026-10-21", mark: "A", rev: 1, deleted: true },
      { key: "anil", businessDate: "2026-10-22", mark: "P", rev: 1, otHours: 2 },
      { key: "dinesh", businessDate: "2026-10-20", mark: "P", rev: 1 },
    ]);
    expect(g).toEqual({
      anil: { "2026-10-20": { mark: "HD", otHours: 0 }, "2026-10-22": { mark: "P", otHours: 2 } },
      dinesh: { "2026-10-20": { mark: "P", otHours: 0 } },
    });
  });
});

describe("PDF report — labour ka us din ka rate", () => {
  it("mark ke saath save hua rate bhi aata hai (labourEarning ke liye)", () => {
    expect(latestMarks([{ key: "R1", businessDate: "2026-10-19", mark: "P", rev: 1, otHours: 2, ratePaise: 60000 }]).R1!["2026-10-19"]).toEqual({ mark: "P", otHours: 2, ratePaise: 60000 });
  });
});

describe("PDF report — party / thekedar khata (chalta baaki)", () => {
  it("bill +, payment −, recovery −; hataayi entry nahi; tarikh ke kram mein", () => {
    const rows = runningLedger([
      { id: "b2", businessDate: "2026-10-22", type: "PAYMENT", amountPaise: 2000000 },
      { id: "b1", businessDate: "2026-10-20", type: "BILL", amountPaise: 5370000 },
      { id: "x", businessDate: "2026-10-21", type: "BILL", amountPaise: 999, deleted: true },
      { id: "r1", businessDate: "2026-10-23", type: "RECOVERY", amountPaise: 180000 },
    ]);
    expect(rows.map((r) => [r.id, r.debitPaise, r.creditPaise, r.balancePaise])).toEqual([
      ["b1", 5370000, 0, 5370000],
      ["b2", 0, 2000000, 3370000],
      ["r1", 0, 180000, 3190000],
    ]);
  });
  it("opening baaki se shuru", () => {
    expect(runningLedger([{ id: "p", businessDate: "2026-11-01", type: "PAYMENT", amountPaise: 100 }], 500).at(-1)?.balancePaise).toBe(400);
  });
});

describe("PDF ka file naam", () => {
  it("project - report - period, bina / \\ : jaise chinh", () => {
    expect(reportFileName("EMRS Keshkal", "Staff attendance / khata", "Oct 2026")).toBe("EMRS Keshkal - Staff attendance - khata - Oct 2026");
    expect(reportFileName("Kondagaon: Pawada", "Stock", "20 Oct 2026 to 25 Oct 2026")).toBe("Kondagaon - Pawada - Stock - 20 Oct 2026 to 25 Oct 2026");
  });
});
