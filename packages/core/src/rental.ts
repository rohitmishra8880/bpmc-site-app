// Machine rental — Rohit ke niyam (PLAN.md §2.6).
//  DAY  : Full = Rate, Half = Rate ÷ 2, Hour = ghante × Rate ÷ shift, Breakdown / Absent = 0
//  HOUR : ghante × Rate, Breakdown / Absent = 0
//  MONTH: din-rate = monthly ÷ 30. Poora mahina site par → poora rate (28 / 30 / 31 din kuch bhi);
//         na chalne ke din × din-rate minus. Mahine ke beech aayi / gayi → jitne din site par NAHI thi
//         utne din × din-rate minus (20 ko aayi → 1–19 minus; 10 ko gayi → 11 se mahine ke end tak minus).
//  Bill  = Rental − Advance / site se liya
import { dateRange, daysInMonth } from "./date";
import { roundHalfUp, type Paise } from "./money";

export type RateType = "DAY" | "HOUR" | "MONTH";
export type RunStatus = "FULL" | "HALF" | "HOUR" | "BREAKDOWN" | "ABSENT";

export interface RentalSettings {
  /** Ek shift kitne ghante ki (HOUR status ke liye). Default 8. */
  shiftHours: number;
  /** Half day ka hissa. Default 0.5. */
  halfDayFactor: number;
  /** Breakdown / Absent din ka hissa. Default 0 (Settings mein badla ja sake). */
  idleDayFactor: number;
  /** Monthly din-rate ke liye bhaag. Rohit: hamesha 30. */
  monthDivisor: number;
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  shiftHours: 8,
  halfDayFactor: 0.5,
  idleDayFactor: 0,
  monthDivisor: 30,
};

export interface MachineDayLog {
  businessDate: string;
  status: RunStatus;
  /** CR − SR (HOUR rate ya HOUR status mein zaroori) */
  hours?: number;
  deleted?: boolean;
}

/**
 * Din ka "kitna din chala" hissa (0 se 1): FULL 1, HALF 0.5, HOUR ghante ÷ shift, BREAKDOWN / ABSENT 0.
 */
export function workedDayFraction(log: MachineDayLog, s: RentalSettings = DEFAULT_RENTAL_SETTINGS): number {
  switch (log.status) {
    case "FULL":
      return 1;
    case "HALF":
      return s.halfDayFactor;
    case "HOUR":
      if (log.hours === undefined) throw new Error(`${log.businessDate}: hours are required for HOUR status`);
      return Math.min(1, log.hours / s.shiftHours);
    case "BREAKDOWN":
    case "ABSENT":
      return s.idleDayFactor;
  }
}

/** DAY ya HOUR rate wali machine ka ek din: 8,000 half = 4,000 · 7.8 h × 1,200 = 9,360 */
export function dayRentalPaise(
  rateType: Exclude<RateType, "MONTH">,
  ratePaise: Paise,
  log: MachineDayLog,
  s: RentalSettings = DEFAULT_RENTAL_SETTINGS,
): Paise {
  if (rateType === "DAY") return roundHalfUp(ratePaise * workedDayFraction(log, s));
  if (log.status === "BREAKDOWN" || log.status === "ABSENT") return roundHalfUp(ratePaise * 0);
  if (log.hours === undefined) throw new Error(`${log.businessDate}: SR / CR required for an hourly-rate machine`);
  return roundHalfUp(ratePaise * log.hours);
}

export interface MachineDeduction {
  /** DRIVER_ADVANCE / OWNER_ADVANCE / SITE_MATERIAL / SITE_DIESEL … */
  kind: string;
  amountPaise: Paise;
  deleted?: boolean;
}

export interface MonthlyBillInput {
  rateType: RateType;
  ratePaise: Paise;
  /** "YYYY-MM" */
  month: string;
  logs: MachineDayLog[];
  deductions?: MachineDeduction[];
  /** Machine site par kab aayi / gayi (na diya to poora mahina). */
  onSiteFrom?: string;
  onSiteTo?: string;
}

export interface MonthlyBill {
  month: string;
  siteDays: number;
  fullMonth: boolean;
  /** Na chalne ke din (half = 0.5 …) — sirf MONTH rate mein */
  idleDays: number;
  dayRatePaise: Paise;
  rentalPaise: Paise;
  deductionPaise: Paise;
  /** Rental − Advance / site se liya. Negative = owner se lena hai. */
  netPaise: Paise;
  /** Site par thi par log nahi bana — bill pakka karne se pehle bharo. */
  missingDates: string[];
}

export function monthlyBill(input: MonthlyBillInput, s: RentalSettings = DEFAULT_RENTAL_SETTINGS): MonthlyBill {
  const { month, rateType, ratePaise } = input;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const from = input.onSiteFrom && input.onSiteFrom > monthStart ? input.onSiteFrom : monthStart;
  const to = input.onSiteTo && input.onSiteTo < monthEnd ? input.onSiteTo : monthEnd;
  const siteDates = from <= to ? dateRange(from, to) : [];
  const fullMonth = from === monthStart && to === monthEnd;

  const logByDate = new Map<string, MachineDayLog>();
  for (const l of input.logs) {
    if (l.deleted || l.businessDate < from || l.businessDate > to) continue;
    if (logByDate.has(l.businessDate)) throw new Error(`${l.businessDate}: two logs for the same machine on one day`);
    logByDate.set(l.businessDate, l);
  }
  const missingDates = siteDates.filter((d) => !logByDate.has(d));

  let rentalPaise = 0;
  let idleDays = 0;
  const dayRatePaise = rateType === "MONTH" ? roundHalfUp(ratePaise / s.monthDivisor) : ratePaise;

  if (rateType === "MONTH") {
    for (const l of logByDate.values()) idleDays += 1 - workedDayFraction(l, s);
    idleDays = roundHalfUp(idleDays, 4);
    const offSiteDays = daysInMonth(month) - siteDates.length;
    rentalPaise = roundHalfUp((ratePaise * Math.max(0, s.monthDivisor - offSiteDays - idleDays)) / s.monthDivisor);
  } else {
    for (const l of logByDate.values()) rentalPaise += dayRentalPaise(rateType, ratePaise, l, s);
  }

  const deductionPaise = (input.deductions ?? []).filter((d) => !d.deleted).reduce((sum, d) => sum + d.amountPaise, 0);

  return {
    month,
    siteDays: siteDates.length,
    fullMonth,
    idleDays,
    dayRatePaise,
    rentalPaise,
    deductionPaise,
    netPaise: rentalPaise - deductionPaise,
    missingDates,
  };
}
