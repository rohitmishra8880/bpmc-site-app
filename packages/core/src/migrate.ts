// Migration (Point 2): purana data naye format mein — kabhi kuch kho na jaye.
// Server pehle backup leta hai, phir planMigration se "kya badlega" dikhata hai, phir hi likhta hai.

export type Data = Record<string, unknown>;

export interface Migration {
  /** jaise "2026-11-02-material-minStock" */
  id: string;
  describe: string;
  collections: string[];
  /** Is migration ke baad documents ka schemaVersion */
  toVersion: number;
  /** Purana data → naya data. Data ki copy milti hai. */
  migrate: (data: Data) => Data;
  /** Agar sach mein koi field hatana ho to yahan naam + kaaran (warna hatana mana) */
  dropKeys?: Record<string, string>;
}

export interface MigrationDoc {
  path: string;
  data: Data;
}

export interface MigrationPlan {
  id: string;
  scanned: number;
  alreadyDone: number;
  changes: { path: string; before: Data; after: Data }[];
  errors: { path: string; error: string }[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function planMigration(m: Migration, docs: MigrationDoc[]): MigrationPlan {
  const plan: MigrationPlan = { id: m.id, scanned: docs.length, alreadyDone: 0, changes: [], errors: [] };
  for (const d of docs) {
    const from = typeof d.data.schemaVersion === "number" ? d.data.schemaVersion : 1;
    if (from >= m.toVersion) {
      plan.alreadyDone++;
      continue;
    }
    try {
      const after = { ...m.migrate(clone(d.data)), schemaVersion: m.toVersion };
      const lost = Object.keys(d.data).filter((k) => !(k in after) && !(m.dropKeys && k in m.dropKeys));
      if (lost.length) throw new Error(`Yeh field gaayab ho rahe the: ${lost.join(", ")}`);
      plan.changes.push({ path: d.path, before: d.data, after });
    } catch (e) {
      plan.errors.push({ path: d.path, error: (e as Error).message });
    }
  }
  return plan;
}

/** Migration ke baad dobara padha data plan se milao — gin-ti aur har badla document. */
export function verifyMigration(plan: MigrationPlan, afterDocs: MigrationDoc[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (afterDocs.length !== plan.scanned) problems.push(`Gin-ti badal gayi: pehle ${plan.scanned}, ab ${afterDocs.length}`);
  const byPath = new Map(afterDocs.map((d) => [d.path, d.data]));
  for (const c of plan.changes) {
    const now = byPath.get(c.path);
    if (!now) {
      problems.push(`${c.path} gaayab`);
      continue;
    }
    for (const [k, v] of Object.entries(c.after)) {
      if (JSON.stringify(now[k]) !== JSON.stringify(v)) problems.push(`${c.path}.${k} ummeed ke mutabik nahi`);
    }
  }
  return { ok: problems.length === 0, problems };
}
