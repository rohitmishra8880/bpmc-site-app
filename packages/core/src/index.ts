// @bpmc/core — saare hisab ke formule yahin aayenge (Phase 1).
// Niyam: har formula ka test pehle, aur yeh code phone par nahi, server par chalta hai.

export const CORE_SCHEMA_VERSION = 1;

/** Business date hamesha IST mein, "YYYY-MM-DD". */
export function toBusinessDateIST(at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
