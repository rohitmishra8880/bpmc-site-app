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

  it("site user doosre user ka record nahi padh sakta", async () => {
    await assertSucceeds(getDoc(doc(dbAs(SITE), `users/${SITE}`)));
    await assertFails(getDoc(doc(dbAs(SITE), `users/${OTHER}`)));
  });
});

describe("masters (material / Oil & Lubricants)", () => {
  const oil = { name: "Engine Oil 15W-40", group: "Oil & Lubricants", baseUnit: "Ltr", createdBy: SITE, deleted: null };

  it("site user item jod / badal sake", async () => {
    const db = dbAs(SITE);
    await assertSucceeds(setDoc(doc(db, "masters_materials/oil1"), oil));
    await assertSucceeds(updateDoc(doc(db, "masters_materials/oil1"), { name: "Engine Oil 20W-40", updatedBy: SITE }));
  });

  it("delete sirf soft, reason ke saath; wapas sirf Admin", async () => {
    const db = dbAs(SITE);
    await setDoc(doc(db, "masters_materials/oil1"), oil);
    await assertFails(deleteDoc(doc(db, "masters_materials/oil1")));
    await assertFails(updateDoc(doc(db, "masters_materials/oil1"), { deleted: { reason: "" }, updatedBy: SITE }));
    await assertSucceeds(updateDoc(doc(db, "masters_materials/oil1"), { deleted: { reason: "galat naam se bana" }, updatedBy: SITE }));
    await assertFails(updateDoc(doc(db, "masters_materials/oil1"), { deleted: null, updatedBy: SITE }));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), "masters_materials/oil1"), { deleted: null, updatedBy: ADMIN }));
  });
});
