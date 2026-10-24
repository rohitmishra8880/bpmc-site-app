import { describe, expect, it } from "vitest";
import { planMigration, verifyMigration, type Migration } from "./migrate";

const addMinStock: Migration = {
  id: "test-minStock",
  describe: "Material par minStock field (khaali = null)",
  collections: ["masters_materials"],
  toVersion: 2,
  migrate: (d) => ({ ...d, minStock: d.minStock ?? null }),
};

const docs = [
  { path: "masters_materials/diesel", data: { name: "Diesel", baseUnit: "Ltr" } },
  { path: "masters_materials/cement", data: { name: "Cement", baseUnit: "Bags", minStock: 50 } },
  { path: "masters_materials/gitti", data: { name: "Gitti", baseUnit: "cu.m", schemaVersion: 2, minStock: null } },
];

describe("migration (Point 2: purana data safe)", () => {
  it("naya field jode, purana value na badle, pehle se naye ko na chhede", () => {
    const p = planMigration(addMinStock, docs);
    expect(p.scanned).toBe(3);
    expect(p.alreadyDone).toBe(1);
    expect(p.errors).toEqual([]);
    expect(p.changes.map((c) => c.after)).toEqual([
      { name: "Diesel", baseUnit: "Ltr", minStock: null, schemaVersion: 2 },
      { name: "Cement", baseUnit: "Bags", minStock: 50, schemaVersion: 2 },
    ]);
  });

  it("field gaayab karne wali migration ruk jaye", () => {
    const bad: Migration = { ...addMinStock, id: "bad", migrate: ({ baseUnit: _drop, ...rest }) => rest };
    const p = planMigration(bad, docs);
    expect(p.changes).toEqual([]);
    expect(p.errors[0]!.error).toContain("baseUnit");
  });

  it("hatana ho to kaaran ke saath hi", () => {
    const ok: Migration = { ...addMinStock, id: "drop", dropKeys: { baseUnit: "unit ab alag table mein" }, migrate: ({ baseUnit: _drop, ...rest }) => rest };
    expect(planMigration(ok, docs).errors).toEqual([]);
  });

  it("migration ka error ek document par — baaki ruk nahi jaate", () => {
    const flaky: Migration = { ...addMinStock, migrate: (d) => { if (d.name === "Diesel") throw new Error("ajeeb data"); return d; } };
    const p = planMigration(flaky, docs);
    expect(p.errors).toHaveLength(1);
    expect(p.changes).toHaveLength(1);
  });

  it("baad mein jaanch: gin-ti aur value milni chahiye", () => {
    const p = planMigration(addMinStock, docs);
    const after = docs.map((d) => p.changes.find((c) => c.path === d.path) ? { path: d.path, data: p.changes.find((c) => c.path === d.path)!.after } : d);
    expect(verifyMigration(p, after)).toEqual({ ok: true, problems: [] });
    expect(verifyMigration(p, after.slice(1)).ok).toBe(false);
  });
});
