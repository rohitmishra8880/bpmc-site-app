// Site photo: Drive ka folder / file ka naam, GPS ka text, phone par chhota karne ka size.
import { isBusinessDate } from "./date";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "<vault>/Photos/2026/10-October" — har project ke apne vault mein (Daily Report ke saath) */
export function photoFolder(vault: string, businessDate: string): string {
  if (!isBusinessDate(businessDate)) throw new Error(`Bad date: ${businessDate}`);
  const [y, m] = businessDate.split("-");
  return `${vault}/Photos/${y}/${m}-${MONTHS[Number(m) - 1]}`;
}

const clean = (s: string) => s.replace(/\s*[\\/:*?"<>|]+\s*/g, " - ").replace(/\s+/g, " ").trim();

/** "2026-10-25 1024 Concrete - Footing F1 2.jpg" */
export function photoFileName(businessDate: string, time: string, label: string, seq: number): string {
  return `${businessDate} ${time.replace(":", "")} ${clean(label) || "Site"} ${seq}.jpg`;
}

export interface Gps {
  lat: number;
  lng: number;
  accuracyM?: number | null;
}

export function gpsLabel(g: Gps | null | undefined): string {
  if (!g) return "No GPS";
  const acc = g.accuracyM != null ? ` (±${Math.round(g.accuracyM)} m)` : "";
  return `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}${acc}`;
}

export function validatePhotoMeta(m: { lat?: number | null; lng?: number | null; takenAt?: string }): string[] {
  const errs: string[] = [];
  if (m.lat != null && !(m.lat >= -90 && m.lat <= 90)) errs.push("Latitude out of range");
  if (m.lng != null && !(m.lng >= -180 && m.lng <= 180)) errs.push("Longitude out of range");
  if (!m.takenAt || Number.isNaN(Date.parse(m.takenAt))) errs.push("Bad photo time");
  return errs;
}

/** Lambi side max tak chhoti; chhoti photo ko bada nahi karte */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  if (!(w > 0 && h > 0 && max > 0)) throw new Error("Bad image size");
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
