// packages/core (TypeScript) → src/core.js (Apps Script ke liye ek global: BPMCCore).
// Formule ek hi jagah rehte hain; server wahi code chalata hai jiske tests pass hain.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, "../../packages/core/src/index.ts")],
  bundle: true,
  format: "iife",
  globalName: "BPMCCore",
  target: "es2019",
  platform: "neutral",
  outfile: resolve(here, "src/core.js"),
  banner: { js: "// AUTO-GENERATED from packages/core — haath se mat badlo. Banane ke liye: npm run build -w @bpmc/server" },
  logLevel: "info",
});
