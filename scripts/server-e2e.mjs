// Server (Apps Script) ka asli code Firestore emulator ke against chalao — Node VM + Apps Script stubs.
// Chalane ke liye: npm run test:server   (emulator khud chalta hai)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const PROJECT = "demo-bpmc";
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

function http(method, url, body) {
  const args = ["-s", "-X", method.toUpperCase(), "-H", "Content-Type: application/json", "-H", "Authorization: Bearer owner", "-w", "\n%{http_code}", url];
  if (body !== undefined) args.push("--data-binary", "@-");
  const out = execFileSync("curl", args, { input: body ?? "", encoding: "utf8", maxBuffer: 64 << 20 });
  const i = out.lastIndexOf("\n");
  return { code: Number(out.slice(i + 1)), text: out.slice(0, i) };
}

// ---- Apps Script stubs ----
const logs = [];
const sandbox = {
  console,
  Logger: { log: (m) => logs.push(String(m)) },
  UrlFetchApp: {
    fetch: (url, o) => {
      const r = http(o.method ?? "get", url.replace("https://firestore.googleapis.com/v1/projects/" + PROJECT, `http://${HOST}/v1/projects/${PROJECT}`), o.payload);
      return { getResponseCode: () => r.code, getContentText: () => r.text };
    },
  },
  ScriptApp: { getOAuthToken: () => "owner" },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === "FIREBASE_PROJECT_ID" ? PROJECT : null) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { formatDate: (d) => d.toISOString().replace(/[-:]/g, "").slice(0, 15), getUuid: () => Math.random().toString(36).slice(2) },
  Session: { getActiveUser: () => ({ getEmail: () => "test@bpmc" }) },
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(`${root}/apps/server/src/core.js`, "utf8"), sandbox);
vm.runInContext(readFileSync(`${root}/apps/server/src/Code.js`, "utf8"), sandbox);
const S = sandbox;
const B = sandbox.BPMCCore;

// ---- seed ----
const today = B.toBusinessDateIST(new Date());
const yday = B.addDays(today, -1);
const month = today.slice(0, 7);
function put(path, data) {
  const r = http("patch", `${BASE}/${path}`, JSON.stringify({ fields: S.encFields_(data) }));
  if (r.code >= 300) throw new Error(`seed ${path}: ${r.code} ${r.text}`);
}
const P = (o) => ({ projectId: "KSK", serverStatus: "PENDING", deleted: null, rev: 1, createdBy: "munshi@bpmc", ...o });

put("settings/global", { rental: { shiftHours: 8, halfDayFactor: 0.5, idleDayFactor: 0, monthDivisor: 30 } });
put("projects/KSK", { name: "EMRS Keshkal", vault: "EMRS KESHKAL" });
put("masters_materials/diesel", { name: "Diesel", baseUnit: "Ltr", deleted: null });
put("masters_materials/cement", { name: "Cement", baseUnit: "Bags", deleted: null });
put("masters_machines/poc210", { name: "Poclain 210", kind: "COMPANY", deleted: null });
put("masters_machines/ajax2", { name: "AJAX II", kind: "RENTAL", rateType: "DAY", ratePaise: 800000, deleted: null });
put("masters_machines/poc200", { name: "Poclain 200", kind: "RENTAL", rateType: "MONTH", ratePaise: 10000000, siteFrom: `${month}-20`, deleted: null });

put("projects/KSK/stockMoves/d1", P({ businessDate: yday, itemId: "diesel", type: "IN", qty: 246, payMode: "NAKAD" }));
put("projects/KSK/stockMoves/d2", P({ businessDate: today, itemId: "diesel", itemName: "Diesel", type: "IN", qty: 600, payMode: "UDHAAR", partyId: "hpcl", partyName: "HPCL", ratePaise: 8950, gstPct: 0 }));
put("projects/KSK/stockMoves/ml_L1", P({ businessDate: today, itemId: "diesel", type: "USE", qty: 115, source: "machinery", linkedMachineLogId: "L1" }));
put("projects/KSK/stockMoves/ml_L2", P({ businessDate: today, itemId: "diesel", type: "USE", qty: 80, source: "machinery", linkedMachineLogId: "L2" }));
put("projects/KSK/stockMoves/t1", P({ businessDate: today, itemId: "diesel", type: "USE", qty: 5, issuedTo: "Tanker" }));
put("projects/KSK/stockMoves/c1", P({ businessDate: today, itemId: "cement", type: "IN", qty: 50, payMode: "UDHAAR", partyId: "agr", ratePaise: 38000, gstPct: 28, deleted: { by: "x", reason: "galti" } }));
put("projects/KSK/machineLogs/L1", P({ businessDate: today, machineId: "poc210", status: "FULL", sr: 2944.0, cr: 2951.8, dieselLtr: 115 }));
put("projects/KSK/machineLogs/L2", P({ businessDate: today, machineId: "ajax2", status: "HALF", sr: 271.4, cr: 273.0, dieselLtr: 80 }));
put("projects/KSK/machineLogs/L3", P({ businessDate: today, machineId: "poc200", status: "BREAKDOWN", dieselLtr: 0 }));
put("projects/KSK/machineDeductions/A1", P({ businessDate: today, machineId: "poc200", kind: "OWNER_ADVANCE", amountPaise: 2000000 }));

// Attendance (Phase 2)
put("masters_staff/anil", { name: "Anil", salaryPaise: 2800000, deleted: null });
put("projects/KSK/labourMuster/LM1", P({ businessDate: today, contractorId: "COMPANY", mistri: 1, kuli: 1, reja: 3 }));
put("projects/KSK/labourMuster/LM2", P({ businessDate: today, contractorId: "suraj", mistri: 3, kuli: 5, reja: 0 }));
put("projects/KSK/labourMuster/LM3", P({ businessDate: today, contractorId: "hemlal", mistri: 2, kuli: 8, reja: 0 }));
put("projects/KSK/labourMuster/LM4", P({ businessDate: today, contractorId: "hemlal", mistri: 9, kuli: 9, reja: 9, deleted: { by: "x", reason: "galti" } }));
put("projects/KSK/staffAttendance/SA1", P({ businessDate: today, staffId: "anil", mark: "P" }));
put("projects/KSK/staffPassbook/SP1", P({ businessDate: today, staffId: "anil", kind: "ADVANCE", amountPaise: 200000 }));

// Labour attendance — naam-wise, hafta 19–25 Oct 2026 (Mon–Sun)
put("projects/KSK/labour/R1", { name: "Ramu", type: "KULI", ratePaise: 60000, group: "COMPANY", deleted: null });
put("projects/KSK/labour/R2", { name: "Shyam", type: "MISTRI", ratePaise: 90000, group: "suraj", deleted: null });
put("projects/KSK/labourAttendance/W1", P({ businessDate: "2026-10-19", labourId: "R1", group: "COMPANY", mark: "P", otHours: 2, ratePaise: 60000 }));
put("projects/KSK/labourAttendance/W2", P({ businessDate: "2026-10-20", labourId: "R1", group: "COMPANY", mark: "P", otHours: 0, ratePaise: 60000 }));
put("projects/KSK/labourAttendance/W3", P({ businessDate: "2026-10-21", labourId: "R1", group: "COMPANY", mark: "HD", otHours: 0, ratePaise: 60000 }));
put("projects/KSK/labourAttendance/W4", P({ businessDate: "2026-10-22", labourId: "R1", group: "COMPANY", mark: "A", otHours: 0, ratePaise: 60000 }));
put("projects/KSK/labourAttendance/W5", P({ businessDate: "2026-10-19", labourId: "R2", group: "suraj", mark: "P", otHours: 0, ratePaise: 90000 }));
put("projects/KSK/labourMuster/C1", P({ businessDate: "2026-10-19", contractorId: "suraj", mistri: 9, kuli: 9, reja: 9 }));
put("projects/KSK/labourMuster/C2", P({ businessDate: "2026-10-19", contractorId: "hemlal", mistri: 2, kuli: 8, reja: 0 }));
put("projects/KSK/labourPassbook/LP1", P({ businessDate: "2026-10-20", labourId: "R1", kind: "ADVANCE", amountPaise: 50000, mode: "CASH" }));

// Store / Saman Register
put("projects/DNT", { name: "EMRS Dantewada", vault: "EMRS DANTEWADA NBCC" });
put("masters_storeItems/rcm", { name: "Rod cutter machine", category: "RETURNABLE", unit: "Nos", tagPrefix: "RCM", deleted: null });
put("masters_storeItems/sheet", { name: "Sheet", category: "RETURNABLE", unit: "Nos", deleted: null });
put("masters_storeItems/pipe", { name: "GI pipe", category: "CONSUMABLE", unit: "Mtr", minStock: 20, deleted: null });
const dAgo = (n) => B.addDays(today, -n);
put("projects/KSK/storeMoves/S1", P({ businessDate: dAgo(10), type: "INWARD", itemId: "rcm", itemName: "Rod cutter machine", qty: 2, ratePaise: 1500000, gstPct: 18, payMode: "UDHAAR", partyId: "sharma", partyName: "Sharma Hardware", billNo: "SH-77" }));
put("projects/KSK/storeMoves/S2", P({ businessDate: dAgo(10), type: "ISSUE", itemId: "rcm", qty: 1, contractorId: "suraj", purpose: "Footing" }));
put("projects/KSK/storeMoves/S3", P({ businessDate: dAgo(3), type: "INWARD", itemId: "sheet", qty: 40, ratePaise: 90000, payMode: "NAKAD" }));
put("projects/KSK/storeMoves/S4", P({ businessDate: dAgo(2), type: "ISSUE", itemId: "sheet", qty: 24, contractorId: "suraj" }));
put("projects/KSK/storeMoves/S5", P({ businessDate: dAgo(1), type: "RETURN", itemId: "sheet", qty: 10, contractorId: "suraj", condition: "OK" }));
put("projects/KSK/storeMoves/S6", P({ businessDate: dAgo(1), type: "RETURN", itemId: "sheet", itemName: "Sheet", qty: 2, contractorId: "suraj", contractorName: "Suraj", condition: "BROKEN", recoveryPaise: 120000 }));
put("projects/KSK/storeMoves/S7", P({ businessDate: today, type: "INWARD", itemId: "pipe", qty: 60, ratePaise: 25000, payMode: "UPI" }));
put("projects/KSK/storeMoves/S8", P({ businessDate: today, type: "CONSUME", itemId: "pipe", qty: 38, purpose: "Water line" }));
put("projects/KSK/storeMoves/S9", P({ businessDate: today, type: "TRANSFER_OUT", itemId: "pipe", itemName: "GI pipe", qty: 5, otherProjectId: "DNT" }));
put("projects/KSK/storeMoves/S10", P({ businessDate: today, type: "INWARD", itemId: "rcm", qty: 1, payMode: "NAKAD", deleted: { by: "x", reason: "galti" } }));
put("projects/KSK/storeService/V1", P({ businessDate: today, itemId: "rcm", tag: "RCM-01", kind: "REPAIR", costPaise: 80000, remark: "Blade changed" }));

// ---- chalao ----
S.runHisab();

// ---- jaancho ----
const get = (path) => S.getDoc_(path);
let fails = 0;
function expect(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    mila:  ${JSON.stringify(got)}\n    chahiye: ${JSON.stringify(want)}`}`);
}

const day = get(`projects/KSK/days/${today}`).data;
expect("Diesel: 246 + 600 − (115 + 80 + 5) = 646", day.stock.diesel, { opening: 246, inward: 600, uses: 200, adjust: 0, closing: 646 });
expect("Cement: hataayi entry hisab mein nahi", day.stock.cement.closing, 0);
expect("Kal ka closing = aaj ka opening", get(`projects/KSK/days/${yday}`).data.stock.diesel.closing, 246);
expect("Poclain 210: 7h 48m, amount nahi (company)", [day.machines.poc210.hoursText, day.machines.poc210.amountPaise], ["7h 48m", null]);
expect("AJAX II half = ₹4,000", day.machines.ajax2.amountPaise, 400000);
expect("Machine diesel kul 195 L (Inventory se mel)", day.machineTotals.dieselLtr, 195);
const bill = get(`projects/KSK/machineBills/poc200_${month}`).data;
expect("Poclain 200: 20 ko aayi, 1 din breakdown → 1,00,000 − 20 din = ₹33,333.33", bill.rentalPaise, 3333333);
expect("Advance ₹20,000 minus → ₹13,333.33 dena", bill.netPaise, 1333333);
const led = get("projects/KSK/ledger/sm_d2").data;
expect("Udhaar diesel → HPCL khate mein ₹53,700 ka bill", [led.type, led.partyId, led.amountPaise], ["BILL", "hpcl", 5370000]);
expect("Hataayi udhaar entry ka bill nahi bana", get("projects/KSK/ledger/sm_c1"), null);
const statuses = ["stockMoves/d2", "machineLogs/L1", "machineDeductions/A1"].map((p) => get(`projects/KSK/${p}`).data.serverStatus);
expect("Entries DONE", statuses, ["DONE", "DONE", "DONE"]);
expect("serverRuns record bana", S.listDocs_("serverRuns").length >= 1, true);
expect("Labour: 6 Mistri / 14 Kuli / 3 Reja = 23 (hataayi entry nahi gini)", day.labour?.totals, { mistri: 6, kuli: 14, reja: 3, total: 23 });
expect("Labour: Suraj 8", day.labour?.byContractor?.suraj?.total, 8);
expect("Staff aaj: 1 present", day.staff, { present: 1, halfDay: 0, absent: 0, marked: 1 });
const kh = get("projects/KSK/staffBalances/anil")?.data;
expect("Anil khata: ₹933.33 kamai − ₹2,000 advance = −₹1,066.67", [kh?.earnedPaise, kh?.paidPaise, kh?.balancePaise], [93333, 200000, -106667]);
const wk = get("projects/KSK/labourWeeks/2026-10-19")?.data;
expect("Ramu hafta: 2.5 din × ₹600 + 2 ghante OT (₹150) = ₹1,650", wk?.labour?.R1, { days: 2.5, otHours: 2, wagesPaise: 150000, otPaise: 15000, amountPaise: 165000 });
expect("Shyam (Suraj ka) hafta: 1 din × ₹900", wk?.labour?.R2?.amountPaise, 90000);
expect("Hafte ka kul ₹2,550", wk?.totalPaise, 255000);
const rb = get("projects/KSK/labourBalances/R1")?.data;
expect("Ramu khata: ₹1,650 − ₹500 advance = ₹1,150 dena", [rb?.earnedPaise, rb?.paidPaise, rb?.balancePaise], [165000, 50000, 115000]);
expect("Ramu statement (hafta-wise): 19 Oct hafta — 2.5 din, ₹1,650 kamai, ₹500 diya, ₹1,150 baaki", rb?.weeks, [{ weekStart: "2026-10-19", days: 2.5, otHours: 2, earnedPaise: 165000, paidPaise: 50000, balancePaise: 115000 }]);
const sbAnil = get("projects/KSK/staffBalances/anil")?.data;
expect("Anil statement (mahina-wise): 1 P, ₹933.33 kamai, ₹2,000 diya", sbAnil?.months, [{ month: today.slice(0, 7), present: 1, halfDay: 0, absent: 0, earnedPaise: 93333, expensePaise: 0, paidPaise: 200000, balancePaise: -106667 }]);
expect("19 Oct gin-ti: naam-wise (Company 1 Kuli, Suraj 1 Mistri) + Hemlal gin-ti 2/8 = 3/9/0 (Suraj ki 9/9/9 double nahi)", get("projects/KSK/days/2026-10-19")?.data?.labour?.totals, { mistri: 3, kuli: 9, reja: 0, total: 12 });
expect("22 Oct: Ramu Absent → 0", get("projects/KSK/days/2026-10-22")?.data?.labour?.totals?.total, 0);
expect("Labour entries DONE", ["labourAttendance/W1", "labourPassbook/LP1"].map((p) => get(`projects/KSK/${p}`).data.serverStatus), ["DONE", "DONE"]);
expect("Attendance entries DONE", ["labourMuster/LM2", "staffAttendance/SA1", "staffPassbook/SP1"].map((p) => get(`projects/KSK/${p}`).data.serverStatus), ["DONE", "DONE", "DONE"]);

const ss = get("projects/KSK/storeSummary/current")?.data;
expect("Store: Rod cutter 2 aaye (1 hataayi entry nahi), 1 Suraj ko → store 1, Suraj ke paas 1", [ss?.items?.rcm?.inStore, ss?.items?.rcm?.withContractors], [1, 1]);
expect("Store: Sheet 40 − 24 + 10 theek = 26 store; Suraj ke paas 24 − 10 − 2 toote = 12", [ss?.items?.sheet?.inStore, ss?.items?.sheet?.withContractors, ss?.items?.sheet?.broken], [26, 12, 2]);
expect("Store: GI pipe 60 − 38 − 5 transfer = 17", ss?.items?.pipe?.inStore, 17);
expect("Thekedar ke paas: Suraj — Rod cutter 1 (10 din), Sheet 12 (2 din)", ss?.holdings, [
  { contractorId: "suraj", itemId: "rcm", qty: 1, since: dAgo(10), days: 10 },
  { contractorId: "suraj", itemId: "sheet", qty: 12, since: dAgo(2), days: 2 },
]);
expect("Alert: GI pipe 17 < 20; Rod cutter 10 din se wapas nahi", ss?.alerts, [
  { kind: "LOW_STOCK", itemId: "pipe", qty: 17, limit: 20 },
  { kind: "NOT_RETURNED", itemId: "rcm", contractorId: "suraj", qty: 1, days: 10 },
]);
expect("Mahine ka statement: GI pipe opening 0, aaya 60, kharch 38, transfer 5, closing 17", (({ openingStore, inward, consumed, transferOut, closingStore }) => ({ openingStore, inward, consumed, transferOut, closingStore }))(get(`projects/KSK/storeSummary/m_${month}`)?.data?.items?.pipe ?? {}), { openingStore: 0, inward: 60, consumed: 38, transferOut: 5, closingStore: 17 });
expect("Item number: RCM-01, RCM-02 (S1 se); hataayi entry ka number nahi", S.listDocs_("projects/KSK/storeAssets").map((d) => [d.id, d.data.inwardMoveId, d.data.status]), [["RCM-01", "S1", "ACTIVE"], ["RCM-02", "S1", "ACTIVE"]]);
const sb = get("projects/KSK/ledger/st_S1")?.data;
expect("Udhaar saman → Sharma Hardware khate mein ₹35,400 (2 × ₹15,000 + 18%)", [sb?.type, sb?.partyId, sb?.amountPaise], ["BILL", "sharma", 3540000]);
const rc = get("projects/KSK/ledger/sr_S6")?.data;
expect("Toota saman → Suraj ke khate mein ₹1,200 katauti", [rc?.type, rc?.partyId, rc?.partyKind, rc?.amountPaise], ["RECOVERY", "suraj", "CONTRACTOR", 120000]);
expect("Nakad saman ka bill nahi", get("projects/KSK/ledger/st_S3"), null);
const tr = get("projects/DNT/storeMoves/tr_KSK_S9")?.data;
expect("Transfer: Dantewada mein 5 GI pipe TRANSFER_IN (Keshkal se, naam ke saath)", [tr?.type, tr?.qty, tr?.otherProjectId, tr?.otherProjectName, tr?.serverStatus], ["TRANSFER_IN", 5, "KSK", "EMRS Keshkal", "DONE"]);
expect("Transfer: Dantewada ka stock 5", get("projects/DNT/storeSummary/current")?.data?.items?.pipe?.inStore, 5);
expect("Store entries DONE", ["storeMoves/S1", "storeMoves/S9", "storeService/V1"].map((p) => get(`projects/KSK/${p}`).data.serverStatus), ["DONE", "DONE", "DONE"]);

// ---- baad mein badlav: transfer hataya, Rod cutter qty 2 → 1, toote ki katauti hatayi ----
put("projects/KSK/storeMoves/S9", P({ rev: 2, businessDate: today, type: "TRANSFER_OUT", itemId: "pipe", qty: 5, otherProjectId: "DNT", deleted: { by: "munshi@bpmc", reason: "galat site" } }));
put("projects/KSK/storeMoves/S1", P({ rev: 2, businessDate: dAgo(10), type: "INWARD", itemId: "rcm", qty: 1, ratePaise: 1500000, gstPct: 18, payMode: "UDHAAR", partyId: "sharma" }));
put("projects/KSK/storeMoves/S6", P({ rev: 2, businessDate: dAgo(1), type: "RETURN", itemId: "sheet", qty: 2, contractorId: "suraj", condition: "BROKEN", recoveryPaise: 0 }));
S.runHisab();
expect("Edit: transfer hataya → Dantewada ka TRANSFER_IN bhi hata, stock 0", [!!get("projects/DNT/storeMoves/tr_KSK_S9")?.data?.deleted, get("projects/DNT/storeSummary/current")?.data?.items?.pipe], [true, undefined]);
expect("Edit: Keshkal GI pipe wapas 22 (alert hata)", [get("projects/KSK/storeSummary/current")?.data?.items?.pipe?.inStore, get("projects/KSK/storeSummary/current")?.data?.alerts?.map((a) => a.kind)], [22, ["NOT_RETURNED"]]);
expect("Edit: Rod cutter 1 → RCM-02 CANCELLED, RCM-01 bana raha", S.listDocs_("projects/KSK/storeAssets").map((d) => [d.id, d.data.status]), [["RCM-01", "ACTIVE"], ["RCM-02", "CANCELLED"]]);
expect("Edit: udhaar bill ₹17,700 (1 × ₹15,000 + 18%), rev 2", [get("projects/KSK/ledger/st_S1")?.data?.amountPaise, get("projects/KSK/ledger/st_S1")?.data?.rev], [1770000, 2]);
expect("Edit: katauti 0 ki → khate se hati", !!get("projects/KSK/ledger/sr_S6")?.data?.deleted, true);

console.log(fails ? `\n${fails} jaanch FAIL` : "\nSab server jaanch pass");
process.exit(fails ? 1 : 0);
