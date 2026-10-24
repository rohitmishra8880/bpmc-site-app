// Tarikh ke niyam — sab IST (UTC+5:30). Business date = "YYYY-MM-DD".

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Kitne din tak entry khuli rehti hai: D, D+1, D+2 (Rohit ka niyam). */
export const EDIT_WINDOW_DAYS = 2;

export function isBusinessDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function assertDate(s: string): void {
  if (!isBusinessDate(s)) throw new Error(`Invalid date: "${s}" (expected YYYY-MM-DD)`);
}

export function toBusinessDateIST(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  assertDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** from se to tak (dono shamil) har tarikh. */
export function dateRange(from: string, to: string): string[] {
  assertDate(from);
  assertDate(to);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Din D ki IST aadhi raat (00:00) ka UTC samay. */
export function istMidnight(date: string): Date {
  assertDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);
}

/** Din D ki entry is samay se PEHLE tak edit ho sakti hai: (D + 3) 00:00 IST, yaani D+2 raat 11:59:59. */
export function editWindowClosesAt(date: string): Date {
  return istMidnight(addDays(date, EDIT_WINDOW_DAYS + 1));
}

export interface DayUnlock {
  /** Admin ne kab tak khola. */
  expiresAt: Date;
}

/** Kya is din ki entry abhi bana / badal sakte hain? */
export function canEditDate(date: string, now: Date, unlock?: DayUnlock | null): boolean {
  if (date > toBusinessDateIST(now)) return false; // aage ki tarikh nahi
  if (now < editWindowClosesAt(date)) return true;
  return !!unlock && now < unlock.expiresAt;
}

/** "2026-10-24" → "24 Oct 2026" */
export function formatDate(date: string): string {
  assertDate(date);
  const [y, m, d] = date.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}
