// Firestore rules ke tests — PLAN.md §2.4, §2.5, §4.
// Chalane ke liye (root se):  npm run test:rules
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { addDays, toBusinessDateIST } from "../../core/src/date";

const PID = "KSK";
const TODAY = toBusinessDateIST(new Date());
const ADMIN = "admin@bpmc.test";
const SITE = "site@bpmc.test";
const OTHER = "other@bpmc.test"; // sirf Dantewada
const INACTIVE = "old@bpmc.test";

let env: RulesTestEnvironment;
let auditSeq = 0;

function dbAs(email: string, verified = true): Firestore {
  return env.authenticatedContext(email.split("@")[0]!, { email, email_verified: verified }).firestore() as unknown as Firestore;
}

/** Entry + uska audit ek hi batch mein (phone isi tarah likhega). */
function writeEntry(
  db: Firestore,
  email: string,
  id: string,
  data: Record<string, unknown>,
  opts: { action?: "CREATE" | "UPDATE" | "DELETE" | "RESTORE"; withAudit?: boolean; rev?: number; reason?: string; pid?: string } = {},
) {
  const pid = opts.pid ?? PID;
  const action = opts.action ?? "CREATE";
  const rev = opts.rev ?? 1;
  const auditId = `a${++auditSeq}`;
  const batch = writeBatch(db);
  const ref = doc(db, `projects/${pid}/stockMoves/${id}`);
  const base = { lastAuditId: auditId, rev, serverStatus: "PENDING", ...data };
  if (action === "CREATE") {
    batch.set(ref, { projectId: pid, createdBy: email, createdAt: serverTimestamp(), deleted: null, ...base });
  } else {
    batch.update(ref, { updatedBy: email, updatedAt: serverTimestamp(), ...base });
  }
  if (opts.withAudit !== false) {
    batch.set(doc(db, `projects/${pid}/auditLog/${auditId}`), {
      entity: `stockMoves/${id}`,
      action,
      rev,
      by: email,
      at: serverTimestamp(),
      reason: opts.reason ?? (action === "CREATE" ? null : "galat number"),
    });
  }
  return batch.commit();
}

const move = (businessDate = TODAY) => ({ businessDate, itemId: "diesel", type: "IN", qty: 200 });

/** Rules band karke seedha data daalo (jaise purani entry). */
async function seedEntry(id: string, businessDate: string, extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `projects/${PID}/stockMoves/${id}`), {
      ...move(businessDate),
      projectId: PID,
      createdBy: SITE,
      createdAt: Timestamp.now(),
      rev: 1,
      deleted: null,
      serverStatus: "DONE",
      lastAuditId: "seed",
      ...extra,
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bpmc",
    firestore: { rules: readFileSync(fileURLToPath(new URL("../../../firestore.rules", import.meta.url)), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "roles/site_user"), { permissions: ["entry.create", "entry.edit", "entry.delete", "masters.edit", "report.generate"] });
    await setDoc(doc(db, `users/${ADMIN}`), { role: "admin", active: true, projectIds: [] });
    await setDoc(doc(db, `users/${SITE}`), { role: "site_user", active: true, projectIds: [PID] });
    await setDoc(doc(db, `users/${OTHER}`), { role: "site_user", active: true, projectIds: ["DNT"] });
    await setDoc(doc(db, `users/${INACTIVE}`), { role: "site_user", active: false, projectIds: [PID] });
    await setDoc(doc(db, `projects/${PID}`), { name: "EMRS Keshkal" });
    await setDoc(doc(db, `projects/${PID}/days/${TODAY}`), { items: {} });
  });
});

describe("kaun entry bana sakta hai", () => {
  it("project ka user aaj ki entry audit ke saath bana sake", async () => {
    await assertSucceeds(writeEntry(dbAs(SITE), SITE, "e1", move()));
  });

  it("audit ke bina entry nahi", async () => {
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", move(), { withAudit: false }));
  });

  it("dusre project ka user nahi (Dantewada wala Keshkal mein nahi)", async () => {
    await assertFails(writeEntry(dbAs(OTHER), OTHER, "e1", move()));
    await assertFails(getDoc(doc(dbAs(OTHER), `projects/${PID}`)));
  });

  it("band (inactive) user aur bina-verify email nahi", async () => {
    await assertFails(writeEntry(dbAs(INACTIVE), INACTIVE, "e1", move()));
    await assertFails(writeEntry(dbAs(SITE, false), SITE, "e1", move()));
  });

  it("kisi aur ke naam se entry nahi (createdBy jhooth)", async () => {
    await assertFails(writeEntry(dbAs(SITE), ADMIN, "e1", move()));
  });
});

describe("2 din ka niyam", () => {
  it("parson (D−2) ki entry ban sake", async () => {
    await assertSucceeds(writeEntry(dbAs(SITE), SITE, "e1", move(addDays(TODAY, -2))));
  });

  it("D−3 ki entry nahi — lock", async () => {
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", move(addDays(TODAY, -3))));
  });

  it("aage ki tarikh nahi", async () => {
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", move(addDays(TODAY, 1))));
  });

  it("locked din ki entry edit nahi; Admin khole to ho; site user khol nahi sakta", async () => {
    const old = addDays(TODAY, -5);
    await seedEntry("old1", old);
    await assertFails(writeEntry(dbAs(SITE), SITE, "old1", { qty: 180 }, { action: "UPDATE", rev: 2 }));

    const unlock = { by: SITE, reason: "entry chhoot gayi", expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) };
    await assertFails(setDoc(doc(dbAs(SITE), `projects/${PID}/unlocks/${old}`), unlock));
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), `projects/${PID}/unlocks/${old}`), { ...unlock, by: ADMIN }));

    await assertSucceeds(writeEntry(dbAs(SITE), SITE, "old1", { qty: 180 }, { action: "UPDATE", rev: 2 }));
  });

  it("unlock ka samay khatam → phir lock", async () => {
    const old = addDays(TODAY, -5);
    await seedEntry("old1", old);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `projects/${PID}/unlocks/${old}`), { by: ADMIN, reason: "purana", expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    });
    await assertFails(writeEntry(dbAs(SITE), SITE, "old1", { qty: 180 }, { action: "UPDATE", rev: 2 }));
  });

  it("khule din ki entry ko locked din par khiskana nahi", async () => {
    await seedEntry("e1", TODAY);
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { businessDate: addDays(TODAY, -4) }, { action: "UPDATE", rev: 2 }));
  });
});

describe("edit aur Edit History", () => {
  it("edit: reason + rev+1 + audit ke saath ho", async () => {
    await seedEntry("e1", TODAY);
    await assertSucceeds(writeEntry(dbAs(SITE), SITE, "e1", { qty: 180 }, { action: "UPDATE", rev: 2 }));
  });

  it("rev na badhe / reason na ho to nahi", async () => {
    await seedEntry("e1", TODAY);
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { qty: 180 }, { action: "UPDATE", rev: 1 }));
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { qty: 180 }, { action: "UPDATE", rev: 2, reason: "" }));
  });

  it("createdBy / createdAt badalna nahi", async () => {
    await seedEntry("e1", TODAY);
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { createdBy: ADMIN }, { action: "UPDATE", rev: 2 }));
  });

  it("audit record koi badal / mita nahi sakta (Admin bhi nahi)", async () => {
    await writeEntry(dbAs(SITE), SITE, "e1", move());
    const ref = `projects/${PID}/auditLog/a${auditSeq}`;
    await assertFails(updateDoc(doc(dbAs(ADMIN), ref), { reason: "badla" }));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), ref)));
  });

  it("Edit History sirf Admin padhe", async () => {
    await writeEntry(dbAs(SITE), SITE, "e1", move());
    const ref = `projects/${PID}/auditLog/a${auditSeq}`;
    await assertFails(getDoc(doc(dbAs(SITE), ref)));
    await assertSucceeds(getDoc(doc(dbAs(ADMIN), ref)));
  });
});

describe("machine log + diesel ek save mein (Phase 2)", () => {
  it("machineLogs + linked stockMoves, dono ke apne audit ke saath — chale", async () => {
    const db = dbAs(SITE);
    const batch = writeBatch(db);
    const base = { projectId: PID, createdBy: SITE, createdAt: serverTimestamp(), deleted: null, rev: 1, serverStatus: "PENDING" };
    batch.set(doc(db, `projects/${PID}/machineLogs/L1`), { ...base, lastAuditId: "ma1", businessDate: TODAY, machineId: "poc210", status: "FULL", sr: 2944, cr: 2951.8, dieselLtr: 115 });
    batch.set(doc(db, `projects/${PID}/stockMoves/ml_L1`), { ...base, lastAuditId: "ma2", businessDate: TODAY, itemId: "diesel", type: "USE", qty: 115, linkedMachineLogId: "L1" });
    batch.set(doc(db, `projects/${PID}/auditLog/ma1`), { entity: "machineLogs/L1", action: "CREATE", rev: 1, by: SITE, at: serverTimestamp(), reason: null });
    batch.set(doc(db, `projects/${PID}/auditLog/ma2`), { entity: "stockMoves/ml_L1", action: "CREATE", rev: 1, by: SITE, at: serverTimestamp(), reason: null });
    await assertSucceeds(batch.commit());
  });

  it("ek audit do entry par nahi chalega", async () => {
    const db = dbAs(SITE);
    const batch = writeBatch(db);
    const base = { projectId: PID, createdBy: SITE, createdAt: serverTimestamp(), deleted: null, rev: 1, serverStatus: "PENDING", lastAuditId: "same" };
    batch.set(doc(db, `projects/${PID}/machineLogs/L1`), { ...base, businessDate: TODAY, machineId: "x", status: "FULL" });
    batch.set(doc(db, `projects/${PID}/stockMoves/ml_L1`), { ...base, businessDate: TODAY, itemId: "diesel", type: "USE", qty: 1 });
    batch.set(doc(db, `projects/${PID}/auditLog/same`), { entity: "machineLogs/L1", action: "CREATE", rev: 1, by: SITE, at: serverTimestamp(), reason: null });
    await assertFails(batch.commit());
  });

  it("phone machine bill / server status DONE nahi likh sakta", async () => {
    await assertFails(setDoc(doc(dbAs(SITE), `projects/${PID}/machineBills/poc200_2026-10`), { netPaise: 1 }));
    await assertFails(writeEntry(dbAs(SITE), SITE, "e9", { ...move(), serverStatus: "DONE" }));
  });
});

describe("delete / Recycle Bin", () => {
  it("hard delete kisi ko nahi — Admin ko bhi nahi", async () => {
    await seedEntry("e1", TODAY);
    await assertFails(deleteDoc(doc(dbAs(SITE), `projects/${PID}/stockMoves/e1`)));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), `projects/${PID}/stockMoves/e1`)));
  });

  it("soft-delete reason ke saath; wapas sirf Admin", async () => {
    await seedEntry("e1", TODAY);
    const deleted = { deleted: { by: SITE, reason: "do baar entry ho gayi", at: Timestamp.now() } };
    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { deleted: { by: SITE, reason: "" } }, { action: "DELETE", rev: 2 }));
    await assertSucceeds(writeEntry(dbAs(SITE), SITE, "e1", deleted, { action: "DELETE", rev: 2 }));

    await assertFails(writeEntry(dbAs(SITE), SITE, "e1", { deleted: null }, { action: "RESTORE", rev: 3 }));
    await assertSucceeds(writeEntry(dbAs(ADMIN), ADMIN, "e1", { deleted: null }, { action: "RESTORE", rev: 3 }));
  });
});

describe("hisab sirf server likhe", () => {
  it("days/ phone se koi nahi likh sakta (Admin bhi nahi), padh sakte hain", async () => {
    await assertFails(setDoc(doc(dbAs(SITE), `projects/${PID}/days/${TODAY}`), { items: { diesel: { closing: 9999 } } }));
    await assertFails(setDoc(doc(dbAs(ADMIN), `projects/${PID}/days/${TODAY}`), { items: {} }));
    await assertSucceeds(getDoc(doc(dbAs(SITE), `projects/${PID}/days/${TODAY}`)));
  });

  it("DPR version aur machine bill bhi nahi", async () => {
    await assertFails(setDoc(doc(dbAs(ADMIN), `projects/${PID}/dpr/${TODAY}/versions/v1`), { x: 1 }));
    await assertFails(setDoc(doc(dbAs(ADMIN), `projects/${PID}/machineBills/jcb_2026-10`), { x: 1 }));
  });
});

describe("Admin ke kaam", () => {
  it("user / role / settings sirf Admin badle", async () => {
    await assertFails(setDoc(doc(dbAs(SITE), `users/${SITE}`), { role: "admin", active: true, projectIds: [] }));
    await assertFails(setDoc(doc(dbAs(SITE), "roles/site_user"), { permissions: ["day.unlock"] }));
    await assertFails(setDoc(doc(dbAs(SITE), "settings/global"), { shiftHours: 4 }));
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), "users/new@bpmc.test"), { role: "site_user", active: true, projectIds: [PID] }));
  });

  it("backup ka record: Admin padhe, site user nahi; likhe koi nahi (sirf server)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "backupRuns/r1"), { ok: true });
    });
    await assertSucceeds(getDoc(doc(dbAs(ADMIN), "backupRuns/r1")));
    await assertFails(getDoc(doc(dbAs(SITE), "backupRuns/r1")));
    await assertFails(setDoc(doc(dbAs(ADMIN), "backupRuns/r2"), { ok: true }));
  });

  it("site user doosre user ka record nahi padh sakta", async () => {
    await assertSucceeds(getDoc(doc(dbAs(SITE), `users/${SITE}`)));
    await assertFails(getDoc(doc(dbAs(SITE), `users/${OTHER}`)));
  });
});

/** Master + global audit ek batch mein (web app ka saveMaster isi tarah likhta hai) */
function writeMaster(db: Firestore, email: string, id: string, data: Record<string, unknown>, rev: number, action: string, opts: { withAudit?: boolean; reason?: string | null } = {}) {
  const auditId = `g${++auditSeq}`;
  const batch = writeBatch(db);
  const ref = doc(db, `masters_materials/${id}`);
  const base = { ...data, rev, lastAuditId: auditId, updatedBy: email };
  if (action === "CREATE") batch.set(ref, { ...base, createdBy: email, deleted: null });
  else batch.update(ref, base);
  if (opts.withAudit !== false) {
    batch.set(doc(db, `auditLog/${auditId}`), {
      entity: `masters_materials/${id}`,
      action,
      rev,
      by: email,
      at: serverTimestamp(),
      reason: opts.reason !== undefined ? opts.reason : action === "CREATE" ? null : "galat naam",
    });
  }
  return batch.commit();
}

describe("masters (material / Oil & Lubricants)", () => {
  const oil = { name: "Engine Oil 15W-40", group: "OIL", baseUnit: "Ltr" };

  it("site user item jod / badal sake (audit ke saath)", async () => {
    const db = dbAs(SITE);
    await assertSucceeds(writeMaster(db, SITE, "oil1", oil, 1, "CREATE"));
    await assertSucceeds(writeMaster(db, SITE, "oil1", { name: "Engine Oil 20W-40" }, 2, "UPDATE"));
  });

  it("audit ke bina master nahi", async () => {
    await assertFails(writeMaster(dbAs(SITE), SITE, "oil1", oil, 1, "CREATE", { withAudit: false }));
  });

  it("badalne ka kaaran zaroori", async () => {
    const db = dbAs(SITE);
    await writeMaster(db, SITE, "oil1", oil, 1, "CREATE");
    await assertFails(writeMaster(db, SITE, "oil1", { name: "x" }, 2, "UPDATE", { reason: "" }));
  });

  it("delete sirf soft, reason ke saath; wapas sirf Admin", async () => {
    const db = dbAs(SITE);
    await writeMaster(db, SITE, "oil1", oil, 1, "CREATE");
    await assertFails(deleteDoc(doc(db, "masters_materials/oil1")));
    await assertFails(writeMaster(db, SITE, "oil1", { deleted: { reason: "" } }, 2, "DELETE"));
    await assertSucceeds(writeMaster(db, SITE, "oil1", { deleted: { reason: "galat naam se bana" } }, 2, "DELETE", { reason: "galat naam se bana" }));
    await assertFails(writeMaster(db, SITE, "oil1", { deleted: null }, 3, "RESTORE"));
    await assertSucceeds(writeMaster(dbAs(ADMIN), ADMIN, "oil1", { deleted: null }, 3, "RESTORE"));
  });

  it("global audit koi badal / mita nahi sakta; site user padh nahi sakta", async () => {
    await writeMaster(dbAs(SITE), SITE, "oil1", oil, 1, "CREATE");
    const ref = `auditLog/g${auditSeq}`;
    await assertFails(getDoc(doc(dbAs(SITE), ref)));
    await assertSucceeds(getDoc(doc(dbAs(ADMIN), ref)));
    await assertFails(updateDoc(doc(dbAs(ADMIN), ref), { reason: "badla" }));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), ref)));
  });
});
