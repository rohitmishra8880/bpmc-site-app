import { describe, expect, it } from "vitest";
import { checkGstin, gstinCheckChar, isIfsc, normalizeBankAccount, normalizeMobile } from "./validate";

describe("GSTIN (T3)", () => {
  it("jaana-maana sahi GSTIN pass", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });

  it("Chhattisgarh (22) sahi → ok, warning nahi", () => {
    const g = "22AAACA1122D1Z" + gstinCheckChar("22AAACA1122D1Z");
    expect(checkGstin(g)).toEqual({ ok: true, stateCode: "22" });
  });

  it("dusre state ki party → ok par warning (purane app ke 09 UP wale)", () => {
    const g = "09AAACA1122D1Z" + gstinCheckChar("09AAACA1122D1Z");
    const r = checkGstin(g);
    expect(r.ok).toBe(true);
    expect(r.warning).toContain("09");
  });

  it("aakhri akshar galat → error", () => {
    const good = "22AAACA1122D1Z" + gstinCheckChar("22AAACA1122D1Z");
    const bad = good.slice(0, 14) + (good[14] === "A" ? "B" : "A");
    expect(checkGstin(bad).ok).toBe(false);
  });

  it("format galat → error", () => {
    expect(checkGstin("22AAACA1122D1").ok).toBe(false);
    expect(checkGstin("").ok).toBe(false);
  });
});

describe("mobile aur IFSC", () => {
  it("10 ank mobile, +91 / 0 hatao", () => {
    expect(normalizeMobile("+91 98261 23456")).toBe("9826123456");
    expect(normalizeMobile("09826123456")).toBe("9826123456");
    expect(normalizeMobile("1800123456")).toBeNull(); // purane app ka +1 800 jaisa
    expect(normalizeMobile("98261")).toBeNull();
  });

  it("bank account no.: 9–18 ank, space / dash hatao", () => {
    expect(normalizeBankAccount("50200088991122")).toBe("50200088991122");
    expect(normalizeBankAccount(" 3881 0293 847 ")).toBe("38810293847");
    expect(normalizeBankAccount("918-020-033-445-566")).toBe("918020033445566");
    expect(normalizeBankAccount("12345678")).toBeNull(); // 8 ank — chhota
    expect(normalizeBankAccount("1234567890123456789")).toBeNull(); // 19 ank — lamba
    expect(normalizeBankAccount("50200A88991122")).toBeNull();
  });

  it("IFSC", () => {
    expect(isIfsc("SBIN0001842")).toBe(true);
    expect(isIfsc("sbin0001842")).toBe(true);
    expect(isIfsc("SBIN1001842")).toBe(false);
  });
});
