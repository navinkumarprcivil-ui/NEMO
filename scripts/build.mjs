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
import { composeMobileUxSource } from "./compose-mobile-ux.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const appSource = readFileSync(join(root, "app.jsx"), "utf8");
const adminLoginSource = readFileSync(join(root, "src", "AdminLogin.jsx"), "utf8");
let src = composeAdminLoginSource(appSource, adminLoginSource);
src = composeOfferBannersPortalSource(src);
src = composeReviewDeleteConfirmationSource(src);
src = composeMobileUxSource(src);
const shell = readFileSync(join(root, "index.html"), "utf8");
const BUILD_RE = /const APP_BUILD\s*=\s*"([^"]+)"/;
const prevBuild = (src.match(BUILD_RE) || [])[1];
if (!prevBuild) throw new Error("APP_BUILD not found in app.jsx — the auto-update check needs it");

/* The owner-only Admin UI is more than a quarter of the source but is irrelevant to every
 * normal shopping session. Keep the canonical source complete for maintainability/tests, then
 * split only the generated deployment into a small initial app and an on-demand classic-script
 * chunk. Both scripts share the same browser global scope, so the Admin code can keep using the
 * existing helpers without a risky application-wide module rewrite. */
function splitAdminChunk(source){
  const adminStart=source.indexOf("/* ═══════════════════ ADMIN LOGIN");
  const exitStart=source.indexOf("function AdminExitConfirm(",adminStart);
  const hubStart=source.indexOf("/* ═══════════════════ ADMIN HUB",exitStart);
  const adminEnd=source.indexOf("/* ═══════════════════ CARE GUIDES PAGE",hubStart);
  if(adminStart<0||exitStart<0||hubStart<0||adminEnd<0) throw new Error("Admin split boundaries not found");

  const adminLogin=source.slice(adminStart,exitStart)
    .replace("function AdminLogin(","function NemoAdminLoginImpl(");
  const alwaysLoadedDialogs=source.slice(exitStart,hubStart);
  const adminHub=source.slice(hubStart,adminEnd)
    .replace("function AdminHub(","function NemoAdminHubImpl(");
  if(!adminLogin.includes("function NemoAdminLoginImpl(")||!adminHub.includes("function NemoAdminHubImpl(")){
    throw new Error("Admin entry components were not renamed for lazy loading");
  }

  const loader=`/* Generated lazy boundary for the owner-only Admin UI. */
let ADMIN_CHUNK_PROMISE=null;
function loadAdminChunk(){
  if(window.NemoAdminLogin&&window.NemoAdminHub) return Promise.resolve();
  if(ADMIN_CHUNK_PROMISE) return ADMIN_CHUNK_PROMISE;
  ADMIN_CHUNK_PROMISE=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="/admin.js?v="+encodeURIComponent(APP_BUILD);
    script.async=true;
    script.onload=()=>{
      if(window.NemoAdminLogin&&window.NemoAdminHub) resolve();
      else reject(new Error("Admin chunk did not register its components"));
    };
    script.onerror=()=>reject(new Error("Admin tools could not be downloaded"));
    document.head.appendChild(script);
  }).catch(error=>{ ADMIN_CHUNK_PROMISE=null; throw error; });
  return ADMIN_CHUNK_PROMISE;
}
function AdminChunkGate({name,props}){
  const [status,setStatus]=useState(()=>window[name]?"ready":"loading");
  const [error,setError]=useState("");
  const start=()=>{
    setStatus("loading"); setError("");
    loadAdminChunk().then(()=>setStatus("ready")).catch(e=>{ setStatus("error"); setError(e&&e.message||"Admin tools could not be loaded"); });
  };
  useEffect(()=>{ if(status!=="ready") start(); },[]);
  const Loaded=window[name];
  if(status==="ready"&&Loaded) return <Loaded {...props}/>;
  return <div style={{minHeight:"70vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:24,textAlign:"center",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
    {status==="error"?<><div style={{fontSize:38}}>⚠️</div><div style={{fontSize:14,fontWeight:800,color:C.text}}>{error}</div><button className="press" onClick={start} style={{border:"none",borderRadius:999,padding:"11px 20px",background:C.primary,color:"white",fontWeight:800,cursor:"pointer"}}>Retry</button></>:<><Spinner/><div style={{fontSize:13,fontWeight:700,color:C.textSub}}>Loading secure Admin tools…</div></>}
  </div>;
}
function AdminLogin(props){ return <AdminChunkGate name="NemoAdminLogin" props={props}/>; }
function AdminHub(props){ return <AdminChunkGate name="NemoAdminHub" props={props}/>; }

`;
  const adminSource=adminLogin+adminHub+`\nwindow.NemoAdminLogin=NemoAdminLoginImpl;\nwindow.NemoAdminHub=NemoAdminHubImpl;\n`;
  const mainSource=source.slice(0,adminStart)+alwaysLoadedDialogs+loader+source.slice(adminEnd);
  return {mainSource,adminSource};
}

const split=splitAdminChunk(src);

/* A function defined in the lazily-loaded Admin chunk but called from the always-loaded main
 * bundle is a ReferenceError for every normal visitor: admin.js is only fetched when the owner
 * opens Admin, so the call works for whoever just used the panel and for nobody else. The
 * `new Function(code)` checks below cannot see it — they parse, they do not resolve — and the
 * test suite reads app.jsx, not the split. That is exactly how the Care Guides poster viewer
 * shipped broken, so the boundary is checked here, where the split is made. */
function topLevelNames(source){
  const names = new Set();
  for (const m of source.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return names;
}
const adminNames = topLevelNames(split.adminSource);
const mainNames  = topLevelNames(split.mainSource);
/* A name the main bundle also declares for itself is fine — that is exactly how the generated
   loader provides AdminLogin/AdminHub as lazy gates. Comparing the two sets rather than keeping
   an exclusion list means new intentional boundaries need no maintenance here, and covers
   `const`/`class` components as well as function declarations. */
const leaked = [...adminNames].filter(name =>
  !mainNames.has(name) && new RegExp(`\\b${name}\\b`).test(split.mainSource));
if(leaked.length){
  throw new Error(
    `main bundle references Admin-only ${leaked.join(", ")} — admin.js is not loaded for a shopper, so ` +
    `this throws "is not defined" at runtime. Move the definition below the CARE GUIDES PAGE marker.`
  );
}

// Hash everything EXCEPT the id itself, so the id is a function of the shipped code.
// The new id is substituted only in the in-memory build source; app.jsx is never rewritten.
const fingerprint = createHash("sha256")
  .update(src.replace(BUILD_RE, 'const APP_BUILD = ""'))
  .update(shell)
  .digest("hex").slice(0, 8);
const series = (prevBuild.split(".")[0]) || "v90";
const build = `${series}.${fingerprint}`;
const builtSource = split.mainSource.replace(BUILD_RE, `const APP_BUILD = "${build}"`);

const { code } = transformSync(builtSource, {
  loader: "jsx",
  jsx: "transform", // classic React.createElement — there is no bundler/import map at runtime
  minify: true,
  legalComments: "none",
});
const { code: adminCode } = transformSync(split.adminSource, {
  loader: "jsx",
  jsx: "transform",
  minify: true,
  legalComments: "none",
});

// The loader injects this as a plain <script>; a stray `import` would kill the whole app.
if (/^\s*import[\s{("']/.test(code)) throw new Error("bundle contains an import — check the jsx setting");
if (!/function NemoStore/.test(code)) throw new Error("bundle is missing NemoStore");
new Function(code); // parse check
new Function(adminCode); // parse check

writeFileSync(join(root, "app.js"), code);
console.log(`app.js written — ${code.length} bytes`);
writeFileSync(join(root, "admin.js"), adminCode);
console.log(`admin.js written lazily — ${adminCode.length} bytes`);

writeFileSync(join(root, "version.json"), JSON.stringify({ build }) + "\n");

const swPath = join(root, "sw.js");
const sw = readFileSync(swPath, "utf8");
const swNext = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'nemo-${build}';`);
if (swNext === sw && !sw.includes(`'nemo-${build}'`)) throw new Error("could not rewrite CACHE in sw.js");
if (swNext !== sw) writeFileSync(swPath, swNext);
console.log(`build ${build} — version.json + sw.js CACHE in sync`);

// Cloudflare ships this composed source only as the browser fallback when app.js is unavailable.
// Keeping it exported avoids ever rewriting the repository's app.jsx during a build.
export { builtSource, build };
