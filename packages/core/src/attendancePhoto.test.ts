import { describe, expect, it } from "vitest";
import { attendanceMissingPhotos, attendancePhotoNeed, exifPhotoCheck, readExif } from "./attendancePhoto";

const latin1 = (s: string) => [...s].map((c) => c.charCodeAt(0) & 255);

/** Test ke liye chhota JPEG: sirf EXIF (tarikh, GPS) — asli camera jaisa dhaancha, II ya MM */
function jpeg(o: { date?: string; offset?: string; lat?: [number, number, number, "N" | "S"]; lng?: [number, number, number, "E" | "W"]; big?: boolean; dateInIfd0?: boolean }): Uint8Array {
  const le = !o.big;
  const t: number[] = [];
  const u16 = (v: number) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const ascii = (s: string) => latin1(s + "\0");
  // Layout: header(8) | IFD0 | ExifIFD | GPS IFD | data
  type E = { tag: number; type: number; count: number; data: number[] };
  const ifd0: E[] = [];
  const exif: E[] = [];
  const gps: E[] = [];
  if (o.date && !o.dateInIfd0) exif.push({ tag: 0x9003, type: 2, count: o.date.length + 1, data: ascii(o.date) });
  if (o.date && o.dateInIfd0) ifd0.push({ tag: 0x0132, type: 2, count: o.date.length + 1, data: ascii(o.date) });
  if (o.offset) exif.push({ tag: 0x9011, type: 2, count: o.offset.length + 1, data: ascii(o.offset) });
  const rat = (v: number[]) => v.flatMap((x) => [...u32(Math.round(x * 100)), ...u32(100)]);
  if (o.lat) gps.push({ tag: 1, type: 2, count: 2, data: ascii(o.lat[3]) }, { tag: 2, type: 5, count: 3, data: rat(o.lat.slice(0, 3) as number[]) });
  if (o.lng) gps.push({ tag: 3, type: 2, count: 2, data: ascii(o.lng[3]) }, { tag: 4, type: 5, count: 3, data: rat(o.lng.slice(0, 3) as number[]) });
  const size = (n: number) => 2 + n * 12 + 4;
  const n0 = ifd0.length + (exif.length ? 1 : 0) + (gps.length ? 1 : 0);
  const off0 = 8;
  const offExif = off0 + size(n0);
  const offGps = offExif + (exif.length ? size(exif.length) : 0);
  let dataOff = offGps + (gps.length ? size(gps.length) : 0);
  const blobs: number[] = [];
  const write = (list: E[]) => {
    const out: number[] = [...u16(list.length)];
    for (const e of list) {
      out.push(...u16(e.tag), ...u16(e.type), ...u32(e.count));
      if (e.data.length <= 4) out.push(...e.data, ...Array(4 - e.data.length).fill(0));
      else {
        out.push(...u32(dataOff));
        blobs.push(...e.data);
        dataOff += e.data.length;
      }
    }
    out.push(...u32(0));
    return out;
  };
  const head0: E[] = [...ifd0];
  if (exif.length) head0.push({ tag: 0x8769, type: 4, count: 1, data: u32(offExif) });
  if (gps.length) head0.push({ tag: 0x8825, type: 4, count: 1, data: u32(offGps) });
  t.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(off0));
  t.push(...write(head0));
  if (exif.length) t.push(...write(exif));
  if (gps.length) t.push(...write(gps));
  t.push(...blobs);
  const app1 = [...latin1("Exif\0\0"), ...t];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9]);
}

const KESHKAL = { lat: [19, 39, 36] as [number, number, number], lng: [81, 37, 12] as [number, number, number] };

describe("photo ke andar ki jaankari (EXIF) — staff ne apne phone se bheji photo", () => {
  it("tarikh-samay + GPS (Intel kram): IST maan ke, Keshkal ka lat/lng", () => {
    const x = readExif(jpeg({ date: "2026:11:19 08:12:30", lat: [...KESHKAL.lat, "N"], lng: [...KESHKAL.lng, "E"] }));
    expect(x.takenAt).toBe("2026-11-19T08:12:30+05:30");
    expect(x.lat).toBeCloseTo(19.66, 2);
    expect(x.lng).toBeCloseTo(81.62, 2);
  });

  it("Motorola kram (MM), samay ka offset photo mein likha ho to wahi; S / W minus", () => {
    const x = readExif(jpeg({ big: true, date: "2026:11:19 07:00:00", offset: "+05:30", lat: [10, 30, 0, "S"], lng: [20, 15, 0, "W"] }));
    expect(x.takenAt).toBe("2026-11-19T07:00:00+05:30");
    expect(x.lat).toBeCloseTo(-10.5, 4);
    expect(x.lng).toBeCloseTo(-20.25, 4);
  });

  it("DateTimeOriginal na ho to IFD0 ka DateTime", () => {
    expect(readExif(jpeg({ date: "2026:11:19 09:00:00", dateInIfd0: true })).takenAt).toBe("2026-11-19T09:00:00+05:30");
  });

  it("WhatsApp 'photo' ki tarah aayi (EXIF mita) ya JPEG hi nahi → sab null, crash nahi", () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toEqual({ takenAt: null, lat: null, lng: null });
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({ takenAt: null, lat: null, lng: null });
    expect(readExif(new Uint8Array(0))).toEqual({ takenAt: null, lat: null, lng: null });
  });

  it("GPS 0,0 (kuch phone yahi likhte hain) = GPS nahi", () => {
    const x = readExif(jpeg({ date: "2026:11:19 08:00:00", lat: [0, 0, 0, "N"], lng: [0, 0, 0, "E"] }));
    expect([x.lat, x.lng]).toEqual([null, null]);
  });
});

describe("upload ki gayi photo ki jaanch (Rohit: tarikh, samay, GPS wali hi)", () => {
  const ok = { takenAt: "2026-11-19T08:12:30+05:30", lat: 19.66, lng: 81.62 };
  it("sab theek → takenAt + gps", () => {
    expect(exifPhotoCheck(ok, "2026-11-19")).toEqual({ ok: true, takenAt: "2026-11-19T08:12:30+05:30", gps: { lat: 19.66, lng: 81.62, accuracyM: null } });
  });
  it("tarikh nahi / GPS nahi / doosre din ki → saaf message (WhatsApp mein Document ki tarah bhejo)", () => {
    expect(exifPhotoCheck({ ...ok, takenAt: null }, "2026-11-19")).toEqual({ ok: false, error: "This photo has no date / time inside. Ask them to send it on WhatsApp as a Document (not as a photo)." });
    expect(exifPhotoCheck({ ...ok, lat: null, lng: null }, "2026-11-19")).toEqual({ ok: false, error: "This photo has no GPS location inside. Location must be on in the camera, and it must be sent on WhatsApp as a Document." });
    expect(exifPhotoCheck(ok, "2026-11-20")).toEqual({ ok: false, error: "This photo was taken on 19 Nov 2026, not 20 Nov 2026." });
  });
  it("raat 11:50 IST ki photo usi din ki (UTC mein agle din nahi)", () => {
    expect(exifPhotoCheck({ ...ok, takenAt: "2026-11-19T23:50:00+05:30" }, "2026-11-19").ok).toBe(true);
  });
});

describe("kiski photo zaroori (Rohit)", () => {
  it("staff: P / HD zaroori, A nahi", () => {
    expect(attendancePhotoNeed("STAFF", { mark: "P" })).toBe("REQUIRED");
    expect(attendancePhotoNeed("STAFF", { mark: "HD" })).toBe("REQUIRED");
    expect(attendancePhotoNeed("STAFF", { mark: "A" })).toBe("NONE");
  });
  it("company ki labour zaroori; thekedar ke aadmi optional; absent ki nahi", () => {
    expect(attendancePhotoNeed("LABOUR", { mark: "P", group: "COMPANY" })).toBe("REQUIRED");
    expect(attendancePhotoNeed("LABOUR", { mark: "P", group: "suraj" })).toBe("OPTIONAL");
    expect(attendancePhotoNeed("LABOUR", { mark: "A", group: "COMPANY" })).toBe("NONE");
  });
  it("thekedar ki gintti: optional (koi ho to); company ki gintti zaroori; 0 ho to kuch nahi", () => {
    expect(attendancePhotoNeed("MUSTER", { group: "suraj", count: 12 })).toBe("OPTIONAL");
    expect(attendancePhotoNeed("MUSTER", { group: "COMPANY", count: 5 })).toBe("REQUIRED");
    expect(attendancePhotoNeed("MUSTER", { group: "suraj", count: 0 })).toBe("NONE");
  });
});

describe("bina photo wali zaroori haazri (alert ke liye)", () => {
  it("din-wise naam; photo judi / optional / absent / hati entry nahi ginti", () => {
    const list = attendanceMissingPhotos(
      [
        { col: "staffAttendance", id: "s1", businessDate: "2026-11-19", name: "Anil", kind: "STAFF", mark: "P" },
        { col: "staffAttendance", id: "s2", businessDate: "2026-11-19", name: "Bablu", kind: "STAFF", mark: "P" },
        { col: "staffAttendance", id: "s3", businessDate: "2026-11-19", name: "Chhotu", kind: "STAFF", mark: "A" },
        { col: "staffAttendance", id: "s4", businessDate: "2026-11-19", name: "Dinesh", kind: "STAFF", mark: "HD", deleted: true },
        { col: "labourAttendance", id: "l1", businessDate: "2026-11-18", name: "Ramu", kind: "LABOUR", mark: "P", group: "COMPANY" },
        { col: "labourAttendance", id: "l2", businessDate: "2026-11-18", name: "Shyam", kind: "LABOUR", mark: "P", group: "suraj" },
      ],
      new Set(["staffAttendance/s2"]),
    );
    expect(list).toEqual([
      { date: "2026-11-18", names: ["Ramu"] },
      { date: "2026-11-19", names: ["Anil"] },
    ]);
  });
});
