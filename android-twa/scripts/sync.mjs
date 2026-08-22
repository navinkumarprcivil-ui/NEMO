import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const bubblewrap = process.platform === "win32" ? "bubblewrap.cmd" : "bubblewrap";

console.log("Regenerating Android wrapper from twa-manifest.json without changing version...");
run(bubblewrap, ["update", "--skipVersionUpgrade", "--manifest=./twa-manifest.json"]);

console.log("Applying Google Play target API requirement...");
run(process.execPath, ["scripts/patch-target-sdk.mjs"]);

console.log("Android wrapper sync complete.");
