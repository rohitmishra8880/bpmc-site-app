import { describe, expect, it } from "vitest";
import { buildStockLedger, type StockMove } from "./stock";

let n = 0;
const mv = (itemId: string, businessDate: string, type: StockMove["type"], qty: number, extra: Partial<StockMove> = {}): StockMove => ({
  id: `m${++n}`,
  itemId,
  businessDate,
  type,
  qty,
  ...extra,
});

describe("stock balance (T2)", () => {
  it("Diesel: 246 + 600 − 200 = 646 L", () => {
    const moves = [mv("diesel", "2026-10-23", "IN", 246), mv("diesel", "2026-10-24", "IN", 600), mv("diesel", "2026-10-24", "USE", 200)];
    const [day] = buildStockLedger(moves, "2026-10-24", "2026-10-24");
    expect(day!.items.diesel).toEqual({ opening: 246, inward: 600, uses: 200, adjust: 0, closing: 646 });
  });

  it("purane app ki galti #3: Gitti 0 + 50 − 30 = 20 (0 nahi)", () => {
    const moves = [mv("gitti", "2026-10-24", "IN", 50), mv("gitti", "2026-10-24", "USE", 30)];
    expect(buildStockLedger(moves, "2026-10-24", "2026-10-24")[0]!.items.gitti!.closing).toBe(20);
  });

  it("Steel 48.15 MT (48,150 kg) — 0 nahi", () => {
    const moves = [mv("steel", "2026-10-20", "IN", 48150)];
    expect(buildStockLedger(moves, "2026-10-24", "2026-10-24")[0]!.items.steel!.closing).toBe(48150);
  });

  it("galti #10: kal ka closing = aaj ka opening", () => {
    const moves = [mv("cement", "2026-10-21", "IN", 100), mv("cement", "2026-10-22", "USE", 40), mv("cement", "2026-10-23", "USE", 25)];
    const days = buildStockLedger(moves, "2026-10-21", "2026-10-24");
    for (let i = 1; i < days.length; i++) {
      expect(days[i]!.items.cement!.opening).toBe(days[i - 1]!.items.cement!.closing);
    }
    expect(days.map((d) => d.items.cement!.closing)).toEqual([100, 60, 35, 35]);
  });

  it("Point 1: 20 Oct ka diesel badla to 21, 22, 23 khud theek", () => {
    const moves = [
      mv("diesel", "2026-10-20", "IN", 500),
      mv("diesel", "2026-10-20", "USE", 200, { id: "edit-me" }),
      mv("diesel", "2026-10-21", "USE", 100),
      mv("diesel", "2026-10-22", "USE", 50),
      mv("diesel", "2026-10-23", "IN", 200),
    ];
    const before = buildStockLedger(moves, "2026-10-20", "2026-10-23").map((d) => d.items.diesel!.closing);
    expect(before).toEqual([300, 200, 150, 350]);

    const edited = moves.map((m) => (m.id === "edit-me" ? { ...m, qty: 180 } : m));
    const after = buildStockLedger(edited, "2026-10-20", "2026-10-23").map((d) => d.items.diesel!.closing);
    expect(after).toEqual([320, 220, 170, 370]);
  });

  it("soft-delete wali entry hisab mein nahi", () => {
    const moves = [mv("reti", "2026-10-24", "IN", 30), mv("reti", "2026-10-24", "USE", 10, { deleted: true })];
    expect(buildStockLedger(moves, "2026-10-24", "2026-10-24")[0]!.items.reti!.closing).toBe(30);
  });

  it("transfer aur adjust; decimal drift nahi", () => {
    const moves = [
      mv("oil", "2026-10-24", "IN", 0.1),
      mv("oil", "2026-10-24", "IN", 0.2),
      mv("oil", "2026-10-24", "TRANSFER_IN", 10),
      mv("oil", "2026-10-24", "TRANSFER_OUT", 4),
      mv("oil", "2026-10-24", "ADJUST", -0.3),
    ];
    const d = buildStockLedger(moves, "2026-10-24", "2026-10-24")[0]!.items.oil!;
    expect(d).toEqual({ opening: 0, inward: 10.3, uses: 4, adjust: -0.3, closing: 6 });
  });

  it("item jiski entry nahi, woh bhi 0 ke saath dikhe (dashboard khaali na lage)", () => {
    const d = buildStockLedger([], "2026-10-24", "2026-10-24", ["bricks"])[0]!;
    expect(d.items.bricks!.closing).toBe(0);
  });

  it("negative qty galti", () => {
    expect(() => buildStockLedger([mv("x", "2026-10-24", "USE", -5)], "2026-10-24", "2026-10-24")).toThrow();
  });
});
