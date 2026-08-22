import fs from "node:fs";
import path from "node:path";

const gradlePath = path.resolve("app", "build.gradle");
if (!fs.existsSync(gradlePath)) {
  console.error("Generated app/build.gradle not found. Run npm run sync first.");
  process.exit(1);
}

let source = fs.readFileSync(gradlePath, "utf8");
const compileRe = /compileSdkVersion\s+\d+/;
const targetRe = /targetSdkVersion\s+\d+/;

if (!compileRe.test(source) || !targetRe.test(source)) {
  console.error("Could not locate compileSdkVersion/targetSdkVersion in generated build.gradle.");
  process.exit(1);
}

source = source.replace(compileRe, "compileSdkVersion 36");
source = source.replace(targetRe, "targetSdkVersion 36");
fs.writeFileSync(gradlePath, source);

const verify = fs.readFileSync(gradlePath, "utf8");
if (!/compileSdkVersion\s+36/.test(verify) || !/targetSdkVersion\s+36/.test(verify)) {
  console.error("API 36 patch verification failed.");
  process.exit(1);
}

console.log("Generated Android project now uses compileSdkVersion 36 and targetSdkVersion 36.");
