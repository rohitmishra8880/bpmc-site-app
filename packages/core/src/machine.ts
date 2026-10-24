// Machine ka ek din — server isi se days/{date}.machines banata hai (purane app ki galti #6, #7, #9, #11).
import { formatHours, machineHours } from "./measure";
import type { Paise } from "./money";
import { dayRentalPaise, DEFAULT_RENTAL_SETTINGS, type RateType, type RentalSettings, type RunStatus } from "./rental";

export interface MachineMaster {
  name: string;
  kind?: "COMPANY" | "RENTAL";
  rateType?: RateType | null;
  ratePaise?: Paise | null;
}

export interface MachineLogInput {
  businessDate: string;
  status: RunStatus;
  sr?: number | null;
  cr?: number | null;
  dieselLtr?: number | null;
}

export interface MachineDay {
  status: RunStatus;
  hours: number | null;
  hoursText: string | null;
  dieselLtr: number;
  /** DAY / HOUR rate ka aaj ka amount. MONTH rate aur company machine ka null (mahine ke bill mein). */
  amountPaise: Paise | null;
  /** Kuch adhoora ho to site wali bhasha mein */
  warning: string | null;
}

export function machineDay(log: MachineLogInput, m: MachineMaster, s: RentalSettings = DEFAULT_RENTAL_SETTINGS): MachineDay {
  let hours: number | null = null;
  let warning: string | null = null;
  if (log.sr != null && log.cr != null) {
    try {
      hours = machineHours(log.sr, log.cr);
    } catch (e) {
      warning = (e as Error).message;
    }
  }
  const idle = log.status === "BREAKDOWN" || log.status === "ABSENT";
  let amountPaise: Paise | null = null;
  if (m.kind !== "COMPANY" && m.ratePaise != null && (m.rateType === "DAY" || m.rateType === "HOUR")) {
    if (idle) amountPaise = 0;
    else if (m.rateType === "HOUR" || log.status === "HOUR") {
      if (hours === null) warning = warning ?? "Enter SR / CR — amount needs running hours";
      else amountPaise = dayRentalPaise(m.rateType, m.ratePaise, { businessDate: log.businessDate, status: log.status, hours }, s);
    } else {
      amountPaise = dayRentalPaise("DAY", m.ratePaise, { businessDate: log.businessDate, status: log.status }, s);
    }
  }
  if (!idle && (log.dieselLtr ?? 0) < 0) warning = "Diesel cannot be negative";
  return {
    status: log.status,
    hours,
    hoursText: hours === null ? null : formatHours(hours),
    dieselLtr: Math.max(0, log.dieselLtr ?? 0),
    amountPaise,
    warning,
  };
}
