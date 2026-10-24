// Doosri backup copy (PLAN.md §5 parat C) — GitHub Actions roz chalata hai.
// Firestore ko service account se SIRF PADHTA hai, poora data encrypt karke ek file banata hai.
//   env: GCP_SA_KEY (service account JSON), BACKUP_PASSPHRASE, FIREBASE_PROJECT_ID, OUT (file ka naam)
// Kholne ke liye: node scripts/decrypt-backup.mjs <file.enc> > backup.json
import { createCipheriv, createSign, randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const sa = JSON.parse(process.env.GCP_SA_KEY ?? "{}");
const pass = process.env.BACKUP_PASSPHRASE ?? "";
const project = process.env.FIREBASE_PROJECT_ID ?? sa.project_id;
const out = process.env.OUT ?? "bpmc-backup.json.enc";
if (!sa.client_email || !sa.private_key) throw new Error("GCP_SA_KEY secret set nahi hai");
if (pass.length < 12) throw new Error("BACKUP_PASSPHRASE kam se kam 12 akshar ka ho");

const GLOBAL = ["users", "roles", "settings", "projects", "masters_materials", "masters_machines", "masters_contractors",
  "masters_parties", "masters_storeItems", "masters_staff", "auditLog", "backupRuns", "migrations"];
const PER_PROJECT = ["stockMoves", "machineLogs", "machineDeductions", "labourMuster", "staffAttendance", "staffPassbook",
  "workEntries", "storeMoves", "ledger", "photos", "auditLog", "unlocks", "days", "machineBills"];

const b64url = (b) => Buffer.from(b).toString("base64url");

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`Token nahi mila: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

async function list(tok, path) {
  const docs = [];
  let pageToken = "";
  do {
    const res = await fetch(`${base}/${path}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 404) return docs;
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    const j = await res.json();
    docs.push(...(j.documents ?? []));
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

const tok = await token();
const data = { type: "bpmc-firestore-raw", project, takenAt: new Date().toISOString(), global: {}, projects: {} };
for (const c of GLOBAL) data.global[c] = await list(tok, c);
for (const p of data.global.projects) {
  const id = p.name.split("/").pop();
  data.projects[id] = {};
  for (const c of PER_PROJECT) data.projects[id][c] = await list(tok, `projects/${id}/${c}`);
}
const counts = Object.fromEntries(Object.entries(data.global).map(([k, v]) => [k, v.length]));
if (!counts.projects || !counts.users) throw new Error(`Backup ajeeb lag raha hai (projects ${counts.projects}, users ${counts.users}) — file nahi banayi`);

// AES-256-GCM: [salt 16][iv 12][tag 16][ciphertext]
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(pass, salt, 32);
const c = createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([c.update(JSON.stringify(data)), c.final()]);
writeFileSync(out, Buffer.concat([salt, iv, c.getAuthTag(), enc]));
console.log(`Backup bana: ${out} (${enc.length} bytes, encrypted). Gin-ti:`, counts, "projects:", Object.keys(data.projects).join(", "));
