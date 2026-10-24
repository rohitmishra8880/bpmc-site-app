// GitHub wali encrypted backup file kholo:  BACKUP_PASSPHRASE=... node scripts/decrypt-backup.mjs bpmc-backup.json.enc > backup.json
import { createDecipheriv, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

const file = process.argv[2];
const pass = process.env.BACKUP_PASSPHRASE ?? "";
if (!file || !pass) throw new Error("Use: BACKUP_PASSPHRASE=... node scripts/decrypt-backup.mjs <file.enc>");
const buf = readFileSync(file);
const d = createDecipheriv("aes-256-gcm", scryptSync(pass, buf.subarray(0, 16), 32), buf.subarray(16, 28));
d.setAuthTag(buf.subarray(28, 44));
process.stdout.write(Buffer.concat([d.update(buf.subarray(44)), d.final()]));
