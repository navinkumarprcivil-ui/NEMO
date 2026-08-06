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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { transformSync } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const src = readFileSync(join(root, "app.jsx"), "utf8");
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
