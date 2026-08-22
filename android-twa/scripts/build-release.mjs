import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifestPath = path.resolve("twa-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.packageId !== "in.nemoaquastore.app") fail("Unexpected packageId. Do not build a Play update with a different package name.");
if (manifest.host !== "www.nemoaquastore.in") fail("Unexpected TWA host.");
if (!Number.isInteger(manifest.appVersionCode) || manifest.appVersionCode < 2) {
  fail("Set a real Play version first: npm run set-version -- <newVersionCode> <newVersionName>");
}
if (!manifest.appVersion || String(manifest.appVersion).toLowerCase().includes("backup")) {
  fail("Replace the backup version name before building a release.");
}

const keyPath = path.resolve(process.env.NEMO_UPLOAD_KEY_PATH || manifest.signingKey?.path || "");
const keyAlias = String(process.env.NEMO_UPLOAD_KEY_ALIAS || "").trim();

if (!keyPath || !fs.existsSync(keyPath)) {
  fail("Original upload keystore not found. Put it under android-twa/secrets/ or set NEMO_UPLOAD_KEY_PATH to its local path. Never commit the keystore.");
}
if (!keyAlias) {
  fail("Set NEMO_UPLOAD_KEY_ALIAS to the alias of the EXISTING Google Play upload key. Do not guess or generate a replacement key.");
}

console.log(`Preparing Nemo Aqua Store ${manifest.appVersion} (versionCode ${manifest.appVersionCode})...`);
run(process.execPath, ["scripts/sync.mjs"]);

const gradle = fs.readFileSync(path.resolve("app", "build.gradle"), "utf8");
if (!/targetSdkVersion\s+36/.test(gradle)) fail("targetSdkVersion is not 36 after sync.");

const bubblewrap = process.platform === "win32" ? "bubblewrap.cmd" : "bubblewrap";
run(bubblewrap, [
  "build",
  "--manifest=./twa-manifest.json",
  `--signingKeyPath=${keyPath}`,
  `--signingKeyAlias=${keyAlias}`
]);

const bundle = path.resolve("app-release-bundle.aab");
if (!fs.existsSync(bundle)) fail("Bubblewrap finished but app-release-bundle.aab was not found.");

console.log("\nRelease bundle created: android-twa/app-release-bundle.aab");
console.log("Upload this .aab to the existing Nemo Aqua Store app in Play Console.");
