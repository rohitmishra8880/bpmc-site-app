import { describe, expect, it } from "vitest";
import { toBusinessDateIST } from "./index";

describe("toBusinessDateIST", () => {
  it("UTC 23 Oct 18:29 = IST 23 Oct 23:59 → 2026-10-23", () => {
    expect(toBusinessDateIST(new Date("2026-10-23T18:29:00Z"))).toBe("2026-10-23");
  });

  it("UTC 23 Oct 18:30 = IST 24 Oct 00:00 → 2026-10-24", () => {
    expect(toBusinessDateIST(new Date("2026-10-23T18:30:00Z"))).toBe("2026-10-24");
  });
});
