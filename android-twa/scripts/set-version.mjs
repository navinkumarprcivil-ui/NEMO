import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "..", "twa-manifest.json");
const [codeArg, nameArg] = process.argv.slice(2);
const code = Number(codeArg);
const name = String(nameArg || "").trim();

if (!Number.isInteger(code) || code < 2) {
  console.error("Usage: npm run set-version -- <versionCode> <versionName>");
  console.error("versionCode must be an integer >= 2 and higher than the latest Play Console versionCode.");
  process.exit(1);
}
if (!name || name.toLowerCase().includes("backup")) {
  console.error("versionName is required, for example: 1.1.0");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.appVersionCode = code;
manifest.appVersion = name;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Nemo Android version set to ${name} (versionCode ${code}).`);
console.log("Confirm versionCode is higher than the latest bundle in Play Console before building.");
