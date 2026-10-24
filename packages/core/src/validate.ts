// Indian site ke number jaanch (T3): GSTIN, mobile, IFSC.

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN ka aakhri (15th) check character, pehle 14 se. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]!);
    if (v < 0) throw new Error("GSTIN has an invalid character");
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36]!;
}

export interface GstinCheck {
  ok: boolean;
  /** Pehle 2 ank — 22 = Chhattisgarh */
  stateCode?: string;
  error?: string;
  /** Galti nahi, bas dhyaan: CG ke bahar ki party */
  warning?: string;
}

export function checkGstin(raw: string): GstinCheck {
  const g = raw.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return { ok: false, error: "GSTIN must be 15 characters, e.g. 22AAACA1122D1Z4" };
  }
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) {
    return { ok: false, stateCode: g.slice(0, 2), error: "GSTIN check digit does not match — please re-check the number" };
  }
  const stateCode = g.slice(0, 2);
  return stateCode === "22"
    ? { ok: true, stateCode }
    : { ok: true, stateCode, warning: `Party is not from Chhattisgarh (22) — state code ${stateCode}` };
}

/** 10 ank ka Indian mobile (6–9 se shuru). +91 / 0 aage ho to hata do. */
export function normalizeMobile(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** IFSC: 4 akshar bank + 0 + 6 branch, jaise SBIN0001842 */
export function isIfsc(raw: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw.trim().toUpperCase());
}
