// Live build ke baad jaanch: dist mein sirf live Firebase project ho, test ka naam kahin nahi. Galat config live par kabhi na jaaye.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../apps/web/dist/assets/", import.meta.url));
const js = readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(dir + f, "utf8")).join("\n");
const problems = [];
if (!js.includes("bpmc-site-live")) problems.push("bpmc-site-live is not in the build");
if (js.includes("bpmc-site-test")) problems.push("bpmc-site-test is in the build");
if (problems.length) {
  console.error("LIVE BUILD BLOCKED: " + problems.join("; "));
  process.exit(1);
}
console.log("Live build OK: only bpmc-site-live");
