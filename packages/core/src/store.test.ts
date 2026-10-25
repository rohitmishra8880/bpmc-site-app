import { describe, expect, it } from "vitest";
import { assignTags, contractorHoldings, storeAlerts, storeLedger, storeStatement, type StoreMove } from "./store";

let n = 0;
const mv = (o: Partial<StoreMove> & Pick<StoreMove, "type" | "itemId" | "qty" | "businessDate">): StoreMove => ({ id: `s${++n}`, ...o });

describe("saman register — stock (R3)", () => {
  it("returnable: 40 sheet aaye, 24 Suraj ko, 10 theek wapas, 2 toote, 1 kho gaya", () => {
    const s = storeLedger([
      mv({ type: "INWARD", itemId: "sheet", qty: 40, businessDate: "2026-10-20" }),
      mv({ type: "ISSUE", itemId: "sheet", qty: 24, contractorId: "suraj", businessDate: "2026-10-21" }),
      mv({ type: "RETURN", itemId: "sheet", qty: 10, contractorId: "suraj", condition: "OK", businessDate: "2026-10-23" }),
      mv({ type: "RETURN", itemId: "sheet", qty: 2, contractorId: "suraj", condition: "BROKEN", businessDate: "2026-10-23" }),
      mv({ type: "RETURN", itemId: "sheet", qty: 1, contractorId: "suraj", condition: "LOST", businessDate: "2026-10-24" }),
    ]);
    expect(s.sheet).toEqual({ inward: 40, issued: 24, returnedOk: 10, damaged: 0, broken: 2, lost: 1, consumed: 0, transferIn: 0, transferOut: 0, inStore: 26, withContractors: 11 });
  });

  it("kharab (DAMAGED) wapas store mein aata hai — gina jaata hai, alag dikhta hai", () => {
    const s = storeLedger([
      mv({ type: "INWARD", itemId: "gada", qty: 4, businessDate: "2026-10-19" }),
      mv({ type: "ISSUE", itemId: "gada", qty: 4, contractorId: "hemlal", businessDate: "2026-10-19" }),
      mv({ type: "RETURN", itemId: "gada", qty: 4, contractorId: "hemlal", condition: "DAMAGED", businessDate: "2026-10-22" }),
    ]);
    expect([s.gada!.inStore, s.gada!.damaged, s.gada!.withContractors]).toEqual([4, 4, 0]);
  });

  it("consumable: aaya − kharch; transfer dono site", () => {
    const s = storeLedger([
      mv({ type: "INWARD", itemId: "pipe", qty: 60, businessDate: "2026-10-20" }),
      mv({ type: "CONSUME", itemId: "pipe", qty: 38, businessDate: "2026-10-22" }),
      mv({ type: "TRANSFER_OUT", itemId: "pipe", qty: 5, businessDate: "2026-10-23", otherProjectId: "DNT" }),
      mv({ type: "TRANSFER_IN", itemId: "pipe", qty: 2, businessDate: "2026-10-24", otherProjectId: "KDG" }),
    ]);
    expect(s.pipe!.inStore).toBe(19);
  });

  it("hataayi entry nahi gini; minus qty galti", () => {
    expect(storeLedger([mv({ type: "INWARD", itemId: "x", qty: 5, businessDate: "2026-10-20", deleted: true })]).x).toBeUndefined();
    expect(() => storeLedger([mv({ type: "INWARD", itemId: "x", qty: -1, businessDate: "2026-10-20" })])).toThrow();
  });
});

describe("thekedar ke paas kya hai, kitne din se (FIFO)", () => {
  it("15 Oct ko 2, 20 Oct ko 1 diya; 22 ko 2 wapas → bacha 1, 20 Oct se (25 Oct ko 5 din)", () => {
    const h = contractorHoldings(
      [
        mv({ type: "ISSUE", itemId: "rcm", qty: 2, contractorId: "suraj", businessDate: "2026-10-15" }),
        mv({ type: "ISSUE", itemId: "rcm", qty: 1, contractorId: "suraj", businessDate: "2026-10-20" }),
        mv({ type: "RETURN", itemId: "rcm", qty: 2, contractorId: "suraj", condition: "OK", businessDate: "2026-10-22" }),
      ],
      "2026-10-25",
    );
    expect(h).toEqual([{ contractorId: "suraj", itemId: "rcm", qty: 1, since: "2026-10-20", days: 5 }]);
  });

  it("toota / kho gaya bhi thekedar se hisab band karta hai; sab wapas → kuch nahi", () => {
    const h = contractorHoldings(
      [
        mv({ type: "ISSUE", itemId: "drum", qty: 3, contractorId: "c1", businessDate: "2026-10-10" }),
        mv({ type: "RETURN", itemId: "drum", qty: 2, contractorId: "c1", condition: "OK", businessDate: "2026-10-12" }),
        mv({ type: "RETURN", itemId: "drum", qty: 1, contractorId: "c1", condition: "LOST", businessDate: "2026-10-13" }),
      ],
      "2026-10-25",
    );
    expect(h).toEqual([]);
  });
});

describe("store alerts", () => {
  it("consumable limit se kam, aur 7+ din se wapas nahi aaya", () => {
    const a = storeAlerts(
      { pipe: { inStore: 19 }, wire: { inStore: 85 } },
      { pipe: { name: "GI pipe", category: "CONSUMABLE", minStock: 20 }, wire: { name: "Binding wire", category: "CONSUMABLE", minStock: 25 } },
      [
        { contractorId: "suraj", itemId: "rcm", qty: 1, since: "2026-10-15", days: 10 },
        { contractorId: "hemlal", itemId: "gada", qty: 4, since: "2026-10-22", days: 3 },
      ],
      7,
    );
    expect(a).toEqual([
      { kind: "LOW_STOCK", itemId: "pipe", qty: 19, limit: 20 },
      { kind: "NOT_RETURNED", itemId: "rcm", contractorId: "suraj", qty: 1, days: 10 },
    ]);
  });
});

describe("bade saman ka number (RCM-01)", () => {
  it("pehle se RCM-01, RCM-02 hain; 2 aur aaye → RCM-03, RCM-04", () => {
    expect(assignTags("RCM", ["RCM-01", "RCM-02"], 2)).toEqual(["RCM-03", "RCM-04"]);
  });
  it("beech ka number khali ho to bhi sabse bade ke baad; 100+ par 3 ank", () => {
    expect(assignTags("BM", ["BM-01", "BM-05"], 1)).toEqual(["BM-06"]);
    expect(assignTags("SH", ["SH-99"], 2)).toEqual(["SH-100", "SH-101"]);
    expect(assignTags("X", [], 0)).toEqual([]);
  });
});

describe("mahine ka statement", () => {
  it("Oct: opening Sep ke closing se; Oct ke movement; closing", () => {
    const moves = [
      mv({ type: "INWARD", itemId: "pipe", qty: 30, businessDate: "2026-09-25" }),
      mv({ type: "CONSUME", itemId: "pipe", qty: 10, businessDate: "2026-09-28" }),
      mv({ type: "INWARD", itemId: "pipe", qty: 60, businessDate: "2026-10-05" }),
      mv({ type: "CONSUME", itemId: "pipe", qty: 38, businessDate: "2026-10-22" }),
      mv({ type: "CONSUME", itemId: "pipe", qty: 7, businessDate: "2026-11-02" }),
    ];
    const s = storeStatement(moves, "2026-10-01", "2026-10-31");
    expect(s.pipe).toMatchObject({ openingStore: 20, inward: 60, consumed: 38, closingStore: 42, openingWithContractors: 0, closingWithContractors: 0 });
  });
});
