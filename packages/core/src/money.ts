// Paisa hamesha integer "paise" mein — float wali galti (0.1 + 0.2) se bachne ke liye.

export type Paise = number;

/** Aadha upar (0.5 → 1, −0.5 → −1), dono taraf barabar. */
export function roundHalfUp(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  // toPrecision se float ka kachra hatao (1.005 * 100 = 100.49999…)
  const scaled = Number((Math.abs(n) * f).toPrecision(15));
  return (Math.sign(n) * Math.round(scaled)) / f;
}

export function toPaise(rupees: number): Paise {
  return roundHalfUp(rupees * 100);
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

/** 598950 → "5,98,950" (Indian grouping: aakhri 3, phir 2-2). */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** 59895000 paise → "₹5,98,950.00" */
export function formatINR(paise: Paise, withSymbol = true): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100).toString();
  const p = (abs % 100).toString().padStart(2, "0");
  return `${neg ? "−" : ""}${withSymbol ? "₹" : ""}${groupIndian(rupees)}.${p}`;
}

/** Stock hisab ke liye saaf number: 200 → "200", 12.5 → "12.5", 100000.1 → "1,00,000.1" (3 decimal tak, faltu 0 nahi) */
export function formatQtyShort(n: number): string {
  return formatQty(n, 3).replace(/\.?0+$/, "");
}

/** Quantity Indian format mein: 1234567.5 → "12,34,567.50" */
export function formatQty(n: number, decimals = 2): string {
  const neg = n < 0;
  const fixed = roundHalfUp(Math.abs(n), decimals).toFixed(decimals);
  const [i = "0", d] = fixed.split(".");
  return `${neg ? "−" : ""}${groupIndian(i)}${d ? "." + d : ""}`;
}
