/* Build the shipped bundle: app.jsx + split source components → app.js
 *
 *   npx esbuild@0.25 --version   (any 0.25.x reproduces the committed output)
 *   node scripts/build.mjs
 *
 * index.html loads the precompiled `app.js` on the fast path. The production build
 * composes split components in memory and never repairs or rewrites application source.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transformSync } from "esbuild";
import { composeAdminLoginSource, composeOfferBannersPortalSource, composeReviewDeleteConfirmationSource } from "./compose-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const appSource = readFileSync(join(root, "app.jsx"), "utf8");
const adminLoginSource = readFileSync(join(root, "src", "AdminLogin.jsx"), "utf8");
let src = composeAdminLoginSource(appSource, adminLoginSource);
src = composeOfferBannersPortalSource(src);
src = composeReviewDeleteConfirmationSource(src);
const shell = readFileSync(join(root, "index.html"), "utf8");
const BUILD_RE = /const APP_BUILD\s*=\s*"([^"]+)"/;
const prevBuild = (src.match(BUILD_RE) || [])[1];
if (!prevBuild) throw new Error("APP_BUILD not found in app.jsx — the auto-update check needs it");

// Hash everything EXCEPT the id itself, so the id is a function of the shipped code.
// The new id is substituted only in the in-memory build source; app.jsx is never rewritten.
const fingerprint = createHash("sha256")
  .update(src.replace(BUILD_RE, 'const APP_BUILD = ""'))
  .update(shell)
  .digest("hex").slice(0, 8);
const series = (prevBuild.split(".")[0]) || "v90";
const build = `${series}.${fingerprint}`;
src = src.replace(BUILD_RE, `const APP_BUILD = "${build}"`);

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

// Cloudflare ships this composed source only as the browser fallback when app.js is unavailable.
// Keeping it exported avoids ever rewriting the repository's app.jsx during a build.
export { src as builtSource, build };
