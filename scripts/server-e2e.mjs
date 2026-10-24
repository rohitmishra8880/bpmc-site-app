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

console.log(fails ? `\n${fails} jaanch FAIL` : "\nSab server jaanch pass");
process.exit(fails ? 1 : 0);
