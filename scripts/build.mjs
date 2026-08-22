/* Build the shipped bundle: app.jsx → app.js
 *
 *   npx esbuild@0.25 --version   (any 0.25.x reproduces the committed output)
 *   node scripts/build.mjs
 *
 * index.html loads the precompiled `app.js` on the fast path and only falls back to
 * compiling `app.jsx` in the browser with Babel if `app.js` is missing. It does NOT
 * fall back when app.js is merely *stale* — a stale bundle just silently ships old
 * code. So: any edit to app.jsx must be followed by a rebuild in the same commit.
 *
 * Settings below are the ones the existing bundle was built with — changing them
 * makes the diff on every future rebuild unreadable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transformSync } from "esbuild";
import { ensureAdminLoginSource } from "./admin-login-fix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The build id must change whenever the code does, or nothing updates: version.json is what a
 * running tab compares itself against, and CACHE in sw.js is what makes a browser install the
 * new worker at all. Both were derived from a hand-typed APP_BUILD — and a hand-typed constant
 * is a constant somebody forgets. It sat at one value across a run of deploys, so every tab
 * decided it was already current and every service worker file was byte-identical; on a slow
 * connection the worker's network-first race then kept serving the cached bundle, and fixes
 * that had shipped days earlier were simply never seen.
 *
 * It is derived from the source now. Same code in, same id out — reproducible — but any change
 * to app.jsx or index.html produces a new one, and it is written back into app.jsx so the
 * source, the bundle, version.json and the worker can never disagree. */
let src = readFileSync(join(root, "app.jsx"), "utf8");
const adminFixed = ensureAdminLoginSource(src);
if(adminFixed !== src){
  src = adminFixed;
  writeFileSync(join(root, "app.jsx"), src);
  console.log("AdminLogin normalized — password field is always rendered");
}
const shell = readFileSync(join(root, "index.html"), "utf8");
const BUILD_RE = /const APP_BUILD\s*=\s*"([^"]+)"/;
const prevBuild = (src.match(BUILD_RE) || [])[1];
if (!prevBuild) throw new Error("APP_BUILD not found in app.jsx — the auto-update check needs it");
// Hash everything EXCEPT the id itself, so the id is a function of the code and nothing else.
const fingerprint = createHash("sha256")
  .update(src.replace(BUILD_RE, 'const APP_BUILD = ""'))
  .update(shell)
  .digest("hex").slice(0, 8);
const series = (prevBuild.split(".")[0]) || "v90";   // keep the human-readable series
const build = `${series}.${fingerprint}`;
if (prevBuild !== build) {
  src = src.replace(BUILD_RE, `const APP_BUILD = "${build}"`);
  writeFileSync(join(root, "app.jsx"), src);
  console.log(`APP_BUILD ${prevBuild} -> ${build}`);
}
const { code } = transformSync(src, {
  loader: "jsx",
  jsx: "transform", // classic React.createElement — there is no bundler/import map at runtime
  minify: true,
  legalComments: "none",
});

// The loader injects this as a plain <script>; a stray `import` would kill the whole app.
if (/^\s*import[\s{("']/.test(code)) throw new Error("bundle contains an import — check the jsx setting");
if (!/function NemoStore/.test(code)) throw new Error("bundle is missing NemoStore");
new Function(code); // parse check

writeFileSync(join(root, "app.js"), code);
console.log(`app.js written — ${code.length} bytes`);

writeFileSync(join(root, "version.json"), JSON.stringify({ build }) + "\n");

const swPath = join(root, "sw.js");
const sw = readFileSync(swPath, "utf8");
const swNext = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'nemo-${build}';`);
if (swNext === sw && !sw.includes(`'nemo-${build}'`)) throw new Error("could not rewrite CACHE in sw.js");
if (swNext !== sw) writeFileSync(swPath, swNext);
console.log(`build ${build} — version.json + sw.js CACHE in sync`);
