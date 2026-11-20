import { describe, expect, it } from "vitest";
import { buildAlerts, diffAlerts, sameAlerts, unreadCount, type AlertInput } from "./alerts";

const base = (o: Partial<AlertInput> = {}): AlertInput => ({
  today: "2026-11-17",
  now: new Date("2026-11-17T10:00:00+05:30"),
  machineLogs: [],
  machineNames: { jcb: "JCB 3DX", poc: "Poclain 210" },
  stock: null,
  materials: { diesel: { name: "Diesel", baseUnit: "Ltr", minStock: 100 }, cement: { name: "Cement", baseUnit: "Bags", minStock: 50 }, sand: { name: "Sand (Reti)", baseUnit: "cu.m", minStock: null } },
  storeAlerts: [],
  storeItemNames: { sheet: "Sheet", nail: "Nails" },
  contractorNames: { suraj: "Suraj" },
  parties: {},
  draftDprDates: [],
  lastBackupAt: null,
  ...o,
});

describe("alerts — breakdown (galti #12: breakdown ka alert nahi aaya)", () => {
  it("aaj machine khadi hai → crit alert, kaaran aur samay ke saath", () => {
    const a = buildAlerts(base({ machineLogs: [{ machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN", breakdownFrom: "10:30", breakdownReason: "Hydraulic pipe phat gaya" }] }));
    expect(a).toEqual([
      {
        key: "BREAKDOWN:jcb",
        kind: "BREAKDOWN",
        severity: "crit",
        title: "Machine breakdown",
        text: "JCB 3DX is in breakdown since 17 Nov 2026 10:30 — Hydraulic pipe phat gaya",
        link: "/machinery",
        since: "2026-11-17",
        adminOnly: false,
      },
    ]);
  });

  it("kal se khadi, aaj ki entry nahi → abhi bhi alert, kal se", () => {
    const a = buildAlerts(base({ machineLogs: [
      { machineId: "jcb", businessDate: "2026-11-15", status: "FULL" },
      { machineId: "jcb", businessDate: "2026-11-16", status: "BREAKDOWN" },
    ] }));
    expect(a[0]!.text).toBe("JCB 3DX is in breakdown since 16 Nov 2026");
  });

  it("do din lagatar breakdown → since pehla din", () => {
    const a = buildAlerts(base({ machineLogs: [
      { machineId: "poc", businessDate: "2026-11-16", status: "BREAKDOWN", breakdownFrom: "14:00" },
      { machineId: "poc", businessDate: "2026-11-17", status: "BREAKDOWN" },
    ] }));
    expect(a[0]!.since).toBe("2026-11-16");
    expect(a[0]!.text).toBe("Poclain 210 is in breakdown since 16 Nov 2026 14:00");
  });

  it("theek ho gayi (breakdownTo bhara) ya aaj chal rahi → koi alert nahi", () => {
    expect(buildAlerts(base({ machineLogs: [{ machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN", breakdownFrom: "09:00", breakdownTo: "13:00" }] }))).toEqual([]);
    expect(buildAlerts(base({ machineLogs: [
      { machineId: "jcb", businessDate: "2026-11-16", status: "BREAKDOWN" },
      { machineId: "jcb", businessDate: "2026-11-17", status: "FULL" },
    ] }))).toEqual([]);
  });

  it("hata di gayi entry nahi ginti; ek din ki do entry mein baad wali", () => {
    expect(buildAlerts(base({ machineLogs: [{ machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN", deleted: true }] }))).toEqual([]);
    expect(buildAlerts(base({ machineLogs: [
      { machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN" },
      { machineId: "jcb", businessDate: "2026-11-17", status: "HALF" },
    ] }))).toEqual([]);
  });

  it("master mein naam nahi → id dikhe (kabhi khaali nahi)", () => {
    const a = buildAlerts(base({ machineLogs: [{ machineId: "dg1", businessDate: "2026-11-17", status: "BREAKDOWN" }] }));
    expect(a[0]!.text).toBe("dg1 is in breakdown since 17 Nov 2026");
  });
});

describe("alerts — material kam (diesel / cement ki apni limit)", () => {
  it("Diesel 80 L, limit 100 → warn; Cement 0 → crit; limit nahi to alert nahi", () => {
    const a = buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 80 }, cement: { closing: 0 }, sand: { closing: 0 } } } }));
    expect(a.map((x) => [x.key, x.severity, x.text])).toEqual([
      ["LOW_MATERIAL:cement", "crit", "Cement: 0 Bags left (limit 50 Bags)"],
      ["LOW_MATERIAL:diesel", "warn", "Diesel: 80 L left (limit 100 L)"],
    ]);
    expect(a[0]!.link).toBe("/inventory");
  });

  it("limit ke barabar ya upar → alert nahi; purane din ka stock ho to tarikh likhe", () => {
    expect(buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 100 } } } }))).toEqual([]);
    const a = buildAlerts(base({ stock: { date: "2026-11-14", items: { diesel: { closing: 12.5 } } } }));
    expect(a[0]!.text).toBe("Diesel: 12.5 L left (limit 100 L) — last calculated 14 Nov 2026");
  });
});

describe("alerts — store register", () => {
  it("consumable kam aur thekedar ke paas pada saman", () => {
    const a = buildAlerts(base({ storeAlerts: [
      { kind: "LOW_STOCK", itemId: "nail", qty: 3, limit: 5 },
      { kind: "NOT_RETURNED", itemId: "sheet", contractorId: "suraj", qty: 24, days: 9 },
    ] }));
    expect(a.map((x) => [x.key, x.severity, x.text, x.link])).toEqual([
      ["NOT_RETURNED:suraj:sheet", "warn", "Suraj has Sheet × 24 for 9 days — not returned", "/store"],
      ["STORE_LOW:nail", "warn", "Nails: only 3 left in store (limit 5)", "/store"],
    ]);
  });
});

describe("alerts — bakaya overdue", () => {
  it("sirf overdue wali party, ₹ Indian format mein; thekedar ka bakaya alert nahi (RA bill se chukta — Rohit)", () => {
    const a = buildAlerts(base({ parties: {
      p1: { name: "Shree Traders", overduePaise: 5000000, bakayaPaise: 8000000, kind: "PARTY" },
      p2: { name: "Jai Hardware", overduePaise: 0, bakayaPaise: 100000, kind: "PARTY" },
      suraj: { name: "Suraj", overduePaise: 75665000, bakayaPaise: 75665000, kind: "CONTRACTOR" },
    } }));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: "OVERDUE:p1", severity: "warn", text: "Shree Traders: ₹50,000.00 overdue (total bakaya ₹80,000.00)", link: "/creditors" });
  });
});

describe("alerts — DPR lock yaad dilana", () => {
  it("kal / parson ka draft → info, kab tak edit ho sakta hai; window band → alert nahi (tab file khud banti hai)", () => {
    const a = buildAlerts(base({ draftDprDates: ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"] }));
    expect(a.map((x) => [x.key, x.severity, x.text, x.link])).toEqual([
      ["DPR:2026-11-15", "info", "DPR for 15 Nov 2026 is not locked yet — editing closes 17 Nov 2026, 11:59 PM", "/dpr?date=2026-11-15"],
      ["DPR:2026-11-16", "info", "DPR for 16 Nov 2026 is not locked yet — editing closes 18 Nov 2026, 11:59 PM", "/dpr?date=2026-11-16"],
    ]);
  });
});

describe("alerts — bina photo ki haazri (staff / company labour ki photo zaroori)", () => {
  it("din-wise ek alert, pehle 4 naam, phir \"+N more\"", () => {
    const a = buildAlerts(base({ missingPhotos: [{ date: "2026-11-16", names: ["Anil"] }, { date: "2026-11-17", names: ["A", "B", "C", "D", "E", "F"] }] }));
    expect(a.map((x) => [x.key, x.kind, x.severity, x.text, x.link])).toEqual([
      ["NO_PHOTO:2026-11-16", "ATTENDANCE_NO_PHOTO", "warn", "16 Nov 2026: 1 attendance entry has no photo — Anil", "/attendance"],
      ["NO_PHOTO:2026-11-17", "ATTENDANCE_NO_PHOTO", "warn", "17 Nov 2026: 6 attendance entries have no photo — A, B, C, D +2 more", "/attendance"],
    ]);
  });
});

describe("alerts — backup (sirf Admin)", () => {
  it("30 ghante se zyada purana → crit, adminOnly", () => {
    const a = buildAlerts(base({ lastBackupAt: new Date("2026-11-15T23:31:00+05:30") }));
    expect(a).toEqual([
      { key: "BACKUP", kind: "BACKUP_STALE", severity: "crit", title: "Backup not running", text: "Last backup was on 15 Nov 2026 — the nightly backup has not run since", link: "/settings", since: "2026-11-15", adminOnly: true },
    ]);
  });

  it("kal raat ka backup ya abhi tak koi backup nahi → alert nahi", () => {
    expect(buildAlerts(base({ lastBackupAt: new Date("2026-11-16T23:31:00+05:30") }))).toEqual([]);
    expect(buildAlerts(base({ lastBackupAt: null }))).toEqual([]);
  });
});

describe("alerts — kram aur badlav", () => {
  it("crit pehle, phir warn, phir info", () => {
    const a = buildAlerts(base({
      draftDprDates: ["2026-11-16"],
      parties: { p1: { name: "A", overduePaise: 100, bakayaPaise: 100 } },
      machineLogs: [{ machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN" }],
    }));
    expect(a.map((x) => x.severity)).toEqual(["crit", "warn", "info"]);
  });

  it("diff: naya alert opened, gaya hua resolved; text badla to naya notification nahi", () => {
    const next = buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 60 } } }, machineLogs: [{ machineId: "jcb", businessDate: "2026-11-17", status: "BREAKDOWN" }] }));
    const d = diffAlerts(["LOW_MATERIAL:diesel", "OVERDUE:p9"], next);
    expect(d.opened.map((x) => x.key)).toEqual(["BREAKDOWN:jcb"]);
    expect(d.resolved).toEqual(["OVERDUE:p9"]);
  });

  it("sameAlerts: same list → true, text badla → false", () => {
    const a = buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 60 } } } }));
    const b = buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 60 } } } }));
    const c = buildAlerts(base({ stock: { date: "2026-11-17", items: { diesel: { closing: 50 } } } }));
    expect(sameAlerts(a, b)).toBe(true);
    expect(sameAlerts(a, c)).toBe(false);
  });
});

describe("notification counter (galti #12: '0 Active' jabki notification dikh rahi thi)", () => {
  const n = (at: string, adminOnly = false) => ({ createdAtMs: Date.parse(at), adminOnly });
  it("seen ke baad wali hi unread; adminOnly sirf Admin ko", () => {
    const list = [n("2026-11-17T09:00:00Z"), n("2026-11-17T11:00:00Z"), n("2026-11-17T12:00:00Z", true)];
    expect(unreadCount(list, Date.parse("2026-11-17T10:00:00Z"), false)).toBe(1);
    expect(unreadCount(list, Date.parse("2026-11-17T10:00:00Z"), true)).toBe(2);
    expect(unreadCount(list, null, false)).toBe(2);
  });
});
