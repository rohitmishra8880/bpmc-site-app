import { describe, expect, it } from "vitest";
import { formatINR, formatQty, formatQtyShort, roundHalfUp, toPaise } from "./money";

describe("paisa", () => {
  it("₹ Indian format: 5,98,950.00 (T3)", () => {
    expect(formatINR(toPaise(598950))).toBe("₹5,98,950.00");
  });

  it("chhote aur bade number", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(toPaise(999.5))).toBe("₹999.50");
    expect(formatINR(toPaise(12345678.9))).toBe("₹1,23,45,678.90");
    expect(formatINR(toPaise(-4000))).toBe("−₹4,000.00");
  });

  it("float ka kachra nahi: 0.1 + 0.2 aur 1.005", () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(30);
    expect(toPaise(1.005)).toBe(101);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it("stock hisab ke number saaf: 0 + 200 − 0 (faltu .000 nahi)", () => {
    expect(formatQtyShort(0)).toBe("0");
    expect(formatQtyShort(200)).toBe("200");
    expect(formatQtyShort(12.5)).toBe("12.5");
    expect(formatQtyShort(48.15)).toBe("48.15");
    expect(formatQtyShort(2.425)).toBe("2.425");
    expect(formatQtyShort(1000)).toBe("1,000");
    expect(formatQtyShort(100000.1)).toBe("1,00,000.1");
    expect(formatQtyShort(-0.3)).toBe("−0.3");
  });

  it("quantity format", () => {
    expect(formatQty(1234567.5)).toBe("12,34,567.50");
    expect(formatQty(48.15, 3)).toBe("48.150");
  });
});
