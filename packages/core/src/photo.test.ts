import { describe, expect, it } from "vitest";
import { fitSize, gpsLabel, photoFileName, photoFolder, validatePhotoMeta } from "./photo";

describe("photo — Drive folder aur file ka naam", () => {
  it("project vault ke andar Photos\\saal\\mahina (Daily Report jaisa dhaancha)", () => {
    expect(photoFolder("EMRS KESHKAL", "2026-10-25")).toBe("EMRS KESHKAL/Photos/2026/10-October");
    expect(photoFolder("EMRS DANTEWADA NBCC", "2027-01-03")).toBe("EMRS DANTEWADA NBCC/Photos/2027/01-January");
  });
  it("file naam: tarikh samay, kisse jura, number — mana chinh hatao", () => {
    expect(photoFileName("2026-10-25", "10:24", "Concrete / Footing F1", 2)).toBe("2026-10-25 1024 Concrete - Footing F1 2.jpg");
    expect(photoFileName("2026-10-25", "09:05", "", 1)).toBe("2026-10-25 0905 Site 1.jpg");
  });
  it("kharab tarikh nahi", () => {
    expect(() => photoFolder("V", "25-10-2026")).toThrow();
  });
});

describe("photo — GPS aur samay", () => {
  it("lat / lng 5 decimal, accuracy meter; GPS na ho to saaf likha", () => {
    expect(gpsLabel({ lat: 18.9456789, lng: 81.3512345, accuracyM: 12.4 })).toBe("18.94568, 81.35123 (±12 m)");
    expect(gpsLabel(null)).toBe("No GPS");
  });
  it("meta: lat −90..90, lng −180..180, samay ISO", () => {
    expect(validatePhotoMeta({ lat: 18.9, lng: 81.3, takenAt: "2026-10-25T04:54:00.000Z" })).toEqual([]);
    expect(validatePhotoMeta({ lat: 99, lng: 81.3, takenAt: "2026-10-25T04:54:00.000Z" })).toContain("Latitude out of range");
    expect(validatePhotoMeta({ lat: 18.9, lng: 200, takenAt: "2026-10-25T04:54:00.000Z" })).toContain("Longitude out of range");
    expect(validatePhotoMeta({ takenAt: "kal" })).toContain("Bad photo time");
    expect(validatePhotoMeta({ takenAt: "2026-10-25T04:54:00.000Z" })).toEqual([]);
  });
});

describe("photo — phone par chhota karna (Drive / data bachane ke liye)", () => {
  it("lambi side 1600 tak; chhoti photo bade nahi hoti; ratio wahi", () => {
    expect(fitSize(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });
  it("galat size nahi", () => {
    expect(() => fitSize(0, 100, 1600)).toThrow();
  });
});
