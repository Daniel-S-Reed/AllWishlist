// Runs every *.test.js file in this folder and reports a summary.
// Usage: npm install && npm test
const { readdirSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const files = readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort();
let failed = 0;

for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const bad = out.split("\n").filter((l) => l.startsWith("FAIL") || l.startsWith("CRASH"));
  const ok = r.status === 0 && bad.length === 0;
  console.log((ok ? "ok    " : "FAIL  ") + f);
  if (!ok) {
    failed++;
    bad.forEach((l) => console.log("      " + l));
  }
}

console.log(failed ? `\n${failed} of ${files.length} test files failed` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
