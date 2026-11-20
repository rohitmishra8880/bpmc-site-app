// Photo wali haazri (Rohit): staff aur company ki labour ki photo zaroori, thekedar ke aadmi ki optional.
// Staff apne phone se photo bheje to supervisor upload kare — par photo ke andar (EXIF) tarikh, samay aur GPS hona chahiye.
// WhatsApp par "photo" ki tarah bhejne se EXIF mit jaata hai; "Document" ki tarah bhejne par bachta hai.
import { formatDate, toBusinessDateIST } from "./date";
import type { Gps } from "./photo";

export interface ExifInfo {
  /** ISO, offset ke saath — photo mein offset na ho to IST (+05:30) maana */
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
}

const NONE: ExifInfo = { takenAt: null, lat: null, lng: null };

/** JPEG ke andar ka EXIF: DateTimeOriginal (ya DateTime), OffsetTimeOriginal, GPS. Kuch bhi galat ho to null — kabhi crash nahi. */
export function readExif(b: Uint8Array): ExifInfo {
  try {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return NONE;
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) return NONE;
      const marker = b[p + 1]!;
      if (marker === 0xd9 || marker === 0xda) return NONE; // image shuru — EXIF nahi mila
      const len = (b[p + 2]! << 8) | b[p + 3]!;
      if (marker === 0xe1 && len > 8 && String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!) === "Exif") return tiff(b, p + 10, p + 2 + len);
      p += 2 + len;
    }
    return NONE;
  } catch {
    return NONE;
  }
}

function tiff(b: Uint8Array, start: number, end: number): ExifInfo {
  const le = b[start] === 0x49;
  const u16 = (o: number) => (le ? b[start + o]! | (b[start + o + 1]! << 8) : (b[start + o]! << 8) | b[start + o + 1]!);
  const u32 = (o: number) => (le ? (b[start + o]! | (b[start + o + 1]! << 8) | (b[start + o + 2]! << 16)) + b[start + o + 3]! * 0x1000000 : b[start + o]! * 0x1000000 + ((b[start + o + 1]! << 16) | (b[start + o + 2]! << 8) | b[start + o + 3]!));
  if (u16(2) !== 42) return NONE;
  type Entry = { type: number; count: number; at: number };
  const ifd = (off: number): Map<number, Entry> => {
    const m = new Map<number, Entry>();
    if (!off || start + off + 2 > end) return m;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (start + e + 12 > end) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const bytes = count * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 }[type] ?? 1);
      m.set(u16(e), { type, count, at: bytes <= 4 ? e + 8 : u32(e + 8) });
    }
    return m;
  };
  const str = (e?: Entry) => {
    if (!e || e.type !== 2) return null;
    let s = "";
    for (let i = 0; i < e.count && start + e.at + i < end; i++) {
      const c = b[start + e.at + i]!;
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s.trim() || null;
  };
  const rats = (e?: Entry) => {
    if (!e || e.type !== 5) return null;
    const out: number[] = [];
    for (let i = 0; i < e.count; i++) {
      const d = u32(e.at + i * 8 + 4);
      out.push(d ? u32(e.at + i * 8) / d : 0);
    }
    return out;
  };
  const ptr = (m: Map<number, Entry>, tag: number) => {
    const e = m.get(tag);
    return e && e.type === 4 ? u32(e.at) : 0;
  };

  const i0 = ifd(u32(4));
  const ex = ifd(ptr(i0, 0x8769));
  const gp = ifd(ptr(i0, 0x8825));

  let takenAt: string | null = null;
  const dt = str(ex.get(0x9003)) ?? str(i0.get(0x0132));
  const m = dt && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (m) {
    const off = str(ex.get(0x9011)) ?? str(ex.get(0x9010));
    const tz = off && /^[+-]\d{2}:\d{2}$/.test(off) ? off : "+05:30";
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`;
    takenAt = Number.isNaN(Date.parse(iso)) ? null : iso;
  }

  const deg = (v: number[] | null, ref: string | null, neg: string) => {
    if (!v || v.length < 3) return null;
    const d = v[0]! + v[1]! / 60 + v[2]! / 3600;
    return ref === neg ? -d : d;
  };
  let lat = deg(rats(gp.get(2)), str(gp.get(1)), "S");
  let lng = deg(rats(gp.get(4)), str(gp.get(3)), "W");
  if (lat === null || lng === null || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    lat = null;
    lng = null;
  }
  return { takenAt, lat, lng };
}

/** Upload ki gayi photo: tarikh, samay, GPS teeno chahiye, aur photo usi din ki ho */
export function exifPhotoCheck(x: ExifInfo, businessDate: string): { ok: true; takenAt: string; gps: Gps } | { ok: false; error: string } {
  if (!x.takenAt) return { ok: false, error: "This photo has no date / time inside. Ask them to send it on WhatsApp as a Document (not as a photo)." };
  if (x.lat === null || x.lng === null) return { ok: false, error: "This photo has no GPS location inside. Location must be on in the camera, and it must be sent on WhatsApp as a Document." };
  const d = toBusinessDateIST(new Date(x.takenAt));
  if (d !== businessDate) return { ok: false, error: `This photo was taken on ${formatDate(d)}, not ${formatDate(businessDate)}.` };
  return { ok: true, takenAt: x.takenAt, gps: { lat: x.lat, lng: x.lng, accuracyM: null } };
}

export type AttendancePhotoNeed = "REQUIRED" | "OPTIONAL" | "NONE";
export type AttendanceKind = "STAFF" | "LABOUR" | "MUSTER";

/** STAFF (P / HD), company ki labour, company ki gintti → zaroori; thekedar → optional; absent / 0 → kuch nahi */
export function attendancePhotoNeed(kind: AttendanceKind, o: { mark?: string | null; group?: string | null; count?: number | null }): AttendancePhotoNeed {
  if (kind === "MUSTER") return !(Number(o.count) > 0) ? "NONE" : o.group === "COMPANY" ? "REQUIRED" : "OPTIONAL";
  if (o.mark === "A" || !o.mark) return "NONE";
  if (kind === "STAFF") return "REQUIRED";
  return (o.group ?? "COMPANY") === "COMPANY" ? "REQUIRED" : "OPTIONAL";
}

/** Zaroori photo wali haazri jisme photo nahi judi — din-wise naam (alert ke liye) */
export function attendanceMissingPhotos(
  entries: { col: string; id: string; businessDate: string; name: string; kind: AttendanceKind; mark?: string | null; group?: string | null; count?: number | null; deleted?: unknown }[],
  photoRefKeys: Set<string>,
): { date: string; names: string[] }[] {
  const by = new Map<string, string[]>();
  for (const e of entries) {
    if (e.deleted || attendancePhotoNeed(e.kind, e) !== "REQUIRED" || photoRefKeys.has(`${e.col}/${e.id}`)) continue;
    by.set(e.businessDate, [...(by.get(e.businessDate) ?? []), e.name]);
  }
  return [...by.keys()].sort().map((date) => ({ date, names: by.get(date)!.sort() }));
}
