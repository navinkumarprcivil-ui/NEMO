from pathlib import Path
import json, re

APP = Path('app.jsx')
RULES = Path('database.rules.json')
TEST = Path('test/ux-lifecycle.test.mjs')
INDEX = Path('index.html')

app = APP.read_text()
if 'const ADMIN_SECTION_KEYS=[' in app:
    print('release patch already applied')
    raise SystemExit(0)

# ── Helpers ────────────────────────────────────────────────────────────────
def must_replace(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

def replace_function(text, start_marker, end_marker, replacement, label):
    a = text.find(start_marker)
    b = text.find(end_marker, a + len(start_marker))
    if a < 0 or b < 0:
        raise RuntimeError(f'missing function boundary: {label}')
    return text[:a] + replacement.rstrip() + '\n\n' + text[b:]

# ── Admin identity / permissions ───────────────────────────────────────────
old_auth = '''const ADMIN_UID_2    = ""; // OPTIONAL co-admin (your helper). Paste their Google UID here, then also add it in database.rules.json + Firebase console. Leave "" if unused.\nconst ADMIN_UIDS     = [ADMIN_UID, ADMIN_UID_2].filter(Boolean); // everyone allowed admin access\nlet RUNTIME_CO_ADMIN = ""; // optional co-admin UID entered in Admin → Settings (kept in sync from settings.coAdminUid)\nfunction isAdminUid(uid){ return !!uid && (ADMIN_UIDS.indexOf(uid)!==-1 || (!!RUNTIME_CO_ADMIN && uid===RUNTIME_CO_ADMIN)); }'''
new_auth = '''const ADMIN_SECTION_KEYS=["orders","dashboard","products","wallets","reviews","requests","guides","settings"];\nconst DEFAULT_CO_ADMIN_PERMISSIONS={orders:false,dashboard:false,products:false,wallets:false,reviews:false,requests:false,guides:false,settings:false};\nlet RUNTIME_ADMIN_ACCESS={coAdminUid:"",permissions:{...DEFAULT_CO_ADMIN_PERMISSIONS}};\nfunction isMainAdminUid(uid){ return !!uid && uid===ADMIN_UID; }\nfunction isCoAdminUid(uid){ return !!uid && !!RUNTIME_ADMIN_ACCESS.coAdminUid && uid===RUNTIME_ADMIN_ACCESS.coAdminUid; }\nfunction isAdminUid(uid){ return isMainAdminUid(uid)||isCoAdminUid(uid); }\nfunction canAdminSection(section,uid=(FB_AUTH&&FB_AUTH.currentUser&&FB_AUTH.currentUser.uid)||""){\n  if(isMainAdminUid(uid)) return true;\n  return isCoAdminUid(uid)&&RUNTIME_ADMIN_ACCESS.permissions&&RUNTIME_ADMIN_ACCESS.permissions[section]===true;\n}\nfunction cleanAdminAccess(raw){\n  raw=raw&&typeof raw==="object"?raw:{};\n  const permissions={...DEFAULT_CO_ADMIN_PERMISSIONS};\n  ADMIN_SECTION_KEYS.forEach(k=>{ permissions[k]=raw.permissions&&raw.permissions[k]===true; });\n  return {coAdminUid:String(raw.coAdminUid||"").trim(),permissions};\n}\nasync function refreshAdminAccess(){\n  if(!FB_OK||!FB_DB||!FB_AUTH||!FB_AUTH.currentUser) return RUNTIME_ADMIN_ACCESS;\n  try{\n    const s=await FB_DB.ref("adminAccess").get();\n    RUNTIME_ADMIN_ACCESS=cleanAdminAccess(s&&s.val());\n  }catch(e){\n    if(isMainAdminUid(FB_AUTH.currentUser.uid)) RUNTIME_ADMIN_ACCESS=cleanAdminAccess(null);\n  }\n  return RUNTIME_ADMIN_ACCESS;\n}\nasync function saveAdminAccess(raw){\n  if(!FB_OK||!FB_DB||!FB_AUTH||!isMainAdminUid(FB_AUTH.currentUser&&FB_AUTH.currentUser.uid)) throw new Error("main-admin-required");\n  const access=cleanAdminAccess(raw);\n  await FB_DB.ref("adminAccess").set(access);\n  RUNTIME_ADMIN_ACCESS=access;\n  return access;\n}\nasync function adminPasswordDigest(value){\n  const bytes=new TextEncoder().encode("nemo-admin-v1:"+String(value||""));\n  const hash=await crypto.subtle.digest("SHA-256",bytes);\n  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");\n}'''
app = must_replace(app, old_auth, new_auth, 'admin auth constants')

# ── Customer Orders: original one-list view ────────────────────────────────
app = app.replace('  const [stageFilter,setStageFilter]=useState("Orders Placed");\n','',1)
app = app.replace('  const orderStages=["Orders Placed","Shipped","Delivered","Past Orders"];\n  const stageCounts=Object.fromEntries(orderStages.map(s=>[s,myOrders.filter(o=>customerOrderStage(o)===s).length]));\n  const visibleOrders=myOrders.filter(o=>customerOrderStage(o)===stageFilter);', '  const visibleOrders=myOrders;', 1)
# Remove the customer-only lifecycle tab strip.
start = app.find('        {myOrders.length>0&&(\n          <div style={{display:"flex",gap:7,overflowX:"auto"')
end = app.find('        {myOrders.length===0?(', start)
if start < 0 or end < 0:
    raise RuntimeError('missing customer lifecycle tab strip')
app = app[:start] + app[end:]
app = app.replace('          <div style={{fontSize:12,color:C.textSub,fontWeight:600,marginBottom:12}}>{visibleOrders.length} {stageFilter.toLowerCase()}</div>\n          {visibleOrders.length===0&&<div style={{textAlign:"center",padding:"36px 16px",color:C.textSub,fontSize:13}}>No {stageFilter.toLowerCase()}.</div>}\n', '          <div style={{fontSize:12,color:C.textSub,fontWeight:600,marginBottom:12}}>{visibleOrders.length} order{visibleOrders.length===1?"":"s"}</div>\n', 1)

# ── Promotions: once-per-day modal, X and outside click close ──────────────
promo_fn = r'''function OfferBanners({settings,orders=[]}){
  const list=usableCoupons(settings,orders,"welcome");
  const [copied,setCopied]=useState("");
  const [open,setOpen]=useState(false);
  const promoDay=()=>{ try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}catch(e){return new Date().toISOString().slice(0,10);} };
  useEffect(()=>{
    if(!list.length) return;
    const day=promoDay();
    try{
      if(localStorage.getItem("nemo-promo-popup-day-v1")===day) return;
      localStorage.setItem("nemo-promo-popup-day-v1",day);
    }catch(e){}
    const timer=setTimeout(()=>setOpen(true),220);
    return()=>clearTimeout(timer);
  },[list.map(c=>c.id).join("|")]);
  if(!list.length||!open) return null;
  const close=()=>setOpen(false);
  const copy=(code)=>{ try{ navigator.clipboard.writeText(code); }catch(e){} setCopied(code); setTimeout(()=>setCopied(""),1600); };
  return(
    <div onClick={close} role="presentation" style={{position:"fixed",inset:0,zIndex:4200,background:"rgba(15,23,42,.56)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Today's promotions" className="fade-rise" style={{position:"relative",width:"min(92vw,430px)",maxHeight:"82vh",overflowY:"auto",background:C.card,borderRadius:22,padding:"18px",boxShadow:"0 24px 70px rgba(15,23,42,.32)"}}>
        <button className="press" onClick={close} aria-label="Close promotion" style={{position:"absolute",right:10,top:9,width:36,height:36,borderRadius:18,border:`1px solid ${C.border}`,background:"rgba(255,255,255,.94)",fontSize:20,fontWeight:800,color:C.text,zIndex:2}}>×</button>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:18,color:C.text,paddingRight:38,marginBottom:12}}>Today at Nemo</div>
        {list.map(c=>{
          const bg=c.bg||"#7c3aed";
          const worth=c.type==="coins"?`${c.value} reward coins`:c.type==="percent"?`${c.value}% off${c.maxDiscount>0?` (up to ₹${c.maxDiscount})`:""}`:`₹${c.value} off`;
          return(
            <div key={c.id} style={{background:`linear-gradient(135deg,${bg},${bg}cc)`,borderRadius:18,padding:"18px 16px",marginBottom:12,textAlign:"center",boxShadow:`0 8px 22px ${bg}33`}}>
              <div style={{fontSize:30,lineHeight:1}}>{c.emoji||"🎉"}</div>
              <div style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.92)",marginTop:6,letterSpacing:.3}}>{c.name||"Special offer"}</div>
              {c.value>0&&<div style={{fontFamily:PRICE_FONT,fontSize:26,fontWeight:800,color:"white",lineHeight:1.15,marginTop:2}}>{worth}</div>}
              {(c.minOrder>0||c.firstOrderOnly)&&<div style={{fontSize:11.5,color:"rgba(255,255,255,.85)",marginTop:4}}>{c.firstOrderOnly?"First order":""}{c.firstOrderOnly&&c.minOrder>0?" · ":""}{c.minOrder>0?`On orders above ₹${c.minOrder}`:""}</div>}
              {c.code&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:11,flexWrap:"wrap"}}>
                <div style={{background:"rgba(255,255,255,.2)",borderRadius:8,padding:"5px 14px",border:"1px dashed rgba(255,255,255,.6)"}}><span style={{fontFamily:"monospace",fontSize:14,fontWeight:800,color:"white",letterSpacing:2}}>{c.code}</span></div>
                <button className="press" onClick={()=>copy(c.code)} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.4)",borderRadius:10,padding:"7px 13px",color:"white",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{copied===c.code?"✓ Copied":"Copy"}</button>
              </div>}
            </div>
          );
        })}
        <div style={{fontSize:10.5,color:C.textSub,textAlign:"center"}}>Shown once per day. Tap outside this card or × to close.</div>
      </div>
    </div>
  );
}'''
app = replace_function(app, 'function OfferBanners(', '/* ═══════════════════ LOYALTY POINTS WIDGET', promo_fn, 'OfferBanners')

# ── Password-first admin shell ─────────────────────────────────────────────
admin_login = r'''function AdminLogin({onSuccess,onBack,onAdminSignIn,settings={}}){
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const configured=String(settings.adminSetupHash||"").trim();

  useEffect(()=>{
    try{ if(sessionStorage.getItem("nemo-admin-unlocked-v1")==="1") onSuccess(); }catch(e){}
  },[]);

  const unlock=async()=>{
    if(!configured){ setMsg("Admin password has not been set yet. Use the main Google account once, then set it in Admin Security."); return; }
    if(!password){ setMsg("Enter the admin password."); return; }
    setBusy(true); setMsg("");
    try{
      const digest=await adminPasswordDigest(password);
      if(digest!==configured){ setMsg("Incorrect admin password."); return; }
      try{ sessionStorage.setItem("nemo-admin-unlocked-v1","1"); }catch(e){}
      onSuccess();
    }finally{ setBusy(false); }
  };

  const bootstrap=async()=>{
    setBusy(true); setMsg("");
    try{
      const u=await onAdminSignIn?.();
      if(u) await refreshAdminAccess();
      if(u&&isMainAdminUid(u.uid)){
        try{ sessionStorage.setItem("nemo-admin-unlocked-v1","1"); }catch(e){}
        onSuccess();
      }else if(u) setMsg("Only the main admin can initialise the Admin password.");
    }finally{ setBusy(false); }
  };

  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",background:C.bg,padding:"24px",position:"relative"}}>
      <button className="press" onClick={onBack} style={{position:"absolute",top:20,left:16,background:"none",border:"none",fontSize:24,color:C.textSub,width:44,height:44}}>←</button>
      <div style={{fontSize:56,marginBottom:14}}>🔐</div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:24,fontWeight:800,color:C.text,marginBottom:7}}>Admin</div>
      <div style={{fontSize:12.5,color:C.textSub,textAlign:"center",lineHeight:1.6,maxWidth:380,marginBottom:18}}>The password unlocks the Admin workspace. Google sign-in is still required inside Admin before Firebase orders or changes can be accessed.</div>
      {configured?(
        <div style={{width:"min(100%,360px)"}}>
          <input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")unlock();}} placeholder="Admin password" aria-label="Admin password" style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,outline:"none",marginBottom:10}}/>
          <button className="press" onClick={unlock} disabled={busy} style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:12,padding:"12px 16px",fontSize:13,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{busy?"Checking…":"Unlock Admin"}</button>
        </div>
      ):(
        <button className="press" onClick={bootstrap} disabled={busy} style={{background:"white",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"11px 16px",fontSize:12.5,fontWeight:800,color:C.text}}>{busy?"Signing in…":"Sign in with main Google to set password"}</button>
      )}
      {msg&&<div style={{marginTop:12,maxWidth:380,textAlign:"center",fontSize:11.5,color:msg.toLowerCase().includes("incorrect")||msg.toLowerCase().includes("only")?C.danger:C.textSub,lineHeight:1.5}}>{msg}</div>}
    </div>
  );
}'''
app = replace_function(app, 'function AdminLogin(', 'function AdminHub(', admin_login, 'AdminLogin')
app = app.replace('<AdminLogin onSuccess={()=>nav("admin")} onBack={goBack} onAdminSignIn={adminGoogleSignIn}/>', '<AdminLogin onSuccess={()=>nav("admin")} onBack={goBack} onAdminSignIn={adminGoogleSignIn} settings={settings}/>', 1)

# ── AdminHub role-gated navigation and unknown-UID onboarding ──────────────
hub = app.find('function AdminHub(')
line_end = app.find('\n', hub)
if hub < 0 or line_end < 0:
    raise RuntimeError('AdminHub missing')
hub_insert = '''\n  const adminUid=(FB_AUTH&&FB_AUTH.currentUser&&FB_AUTH.currentUser.uid)||"";\n  const allowedTabs=ADMIN_SECTION_KEYS.filter(k=>canAdminSection(k,adminUid));\n  useEffect(()=>{\n    if(ADMIN_SECTION_KEYS.includes(tab)&&!canAdminSection(tab,adminUid)&&allowedTabs.length) setTab(allowedTabs[0]);\n  });\n'''
app = app[:line_end+1] + hub_insert + app[line_end+1:]
app = app.replace('["orders","dashboard","products","wallets","reviews","requests","guides","settings"].map(t=>(', 'allowedTabs.map(t=>(', 1)
# Guard each primary section even if state is manipulated outside the tab bar.
for section in ['orders','dashboard','products','wallets','reviews','requests','guides','settings']:
    app = re.sub(r'\{tab==="'+re.escape(section)+r'"\s*&&\s*\(', '{tab==="'+section+'"&&canAdminSection("'+section+'",adminUid)&&(', app, count=1)
# Unknown Google account: only expose its UID for main-admin onboarding, never admin data.
warning_anchor = '      {!isAdminSignedIn()&&(\n'
uid_block = '''      {FB_OK&&FB_AUTH?.currentUser&&!isAdminUid(FB_AUTH.currentUser.uid)&&(\n        <div style={{margin:"14px 16px 0",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:14,padding:"14px",fontSize:12,color:"#14532d",lineHeight:1.55}}>\n          <b>New co-admin Google UID</b><br/>\n          <code style={{display:"inline-block",marginTop:6,fontSize:11,wordBreak:"break-all",background:"rgba(0,0,0,.06)",borderRadius:5,padding:"3px 7px"}}>{FB_AUTH.currentUser.uid}</code>\n          <button className="press" onClick={()=>navigator.clipboard?.writeText(FB_AUTH.currentUser.uid)} style={{display:"block",marginTop:9,background:"#16a34a",color:"white",border:"none",borderRadius:8,padding:"7px 13px",fontSize:11,fontWeight:800}}>📋 Copy UID</button>\n          <div style={{marginTop:7}}>Copy this UID, then sign back in with the main admin account and assign its permissions in Admin Security.</div>\n        </div>\n      )}\n'''
app = must_replace(app, warning_anchor, uid_block + warning_anchor, 'admin sign-in warning')

# Google sign-in must refresh the server-authoritative access record before role checks.
old_signin = '''        const usr={...u,keep:true};\n        setUser(usr); saveUser(usr);\n        if(isAdminUid(u.uid)){ showToast("✓ Admin signed in — changes will now sync"); }\n        else{ showToast("Signed in, but this isn't the admin account"); }'''
new_signin = '''        const usr={...u,keep:true};\n        setUser(usr); saveUser(usr);\n        await refreshAdminAccess();\n        if(isAdminUid(u.uid)){ showToast("✓ Admin signed in — permitted sections are available"); }\n        else{ showToast("Signed in — copy this account UID to add it as a co-admin"); }'''
app = must_replace(app, old_signin, new_signin, 'admin google sign-in')

# ── Settings persistence: co-admin can save public settings, not security ──
old_save = '''async function saveSettings(s){\n  await dbSet("nemo-settings",JSON.stringify(s));   // local cache keeps the whole thing (admin's own device)\n  if(FB_OK){\n    const {pub,priv,bank}=splitSettings(s);\n    await fbSetObj("settings",pub);\n    await fbSetObj("settingsPrivate",priv);\n    await fbSetObj("settingsBank",bank);\n    // One-time cleanup: these used to be written into the public node, so a store that saved\n    // settings before this change still has them sitting there readable. Clear them out.\n    try{ await Promise.all(NON_PUBLIC_SETTING_KEYS.map(k=>FB_DB.ref("settings/"+k).remove())); }catch(e){}\n  }\n}'''
new_save = '''async function saveSettings(s){\n  await dbSet("nemo-settings",JSON.stringify(s));\n  if(FB_OK){\n    const {pub,priv,bank}=splitSettings(s);\n    if(isMainAdminUid(FB_AUTH&&FB_AUTH.currentUser&&FB_AUTH.currentUser.uid)){\n      await fbSetObj("settings",pub);\n      await fbSetObj("settingsPrivate",priv);\n      await fbSetObj("settingsBank",bank);\n      try{ await Promise.all(NON_PUBLIC_SETTING_KEYS.map(k=>FB_DB.ref("settings/"+k).remove())); }catch(e){}\n    }else if(canAdminSection("settings")){\n      // Firebase compares protected security keys with their existing values, so a co-admin\n      // can update ordinary store settings but cannot alter the password or role assignment.\n      await FB_DB.ref("settings").update(pub);\n    }\n  }\n}'''
app = must_replace(app, old_save, new_save, 'saveSettings')

# Main-admin-only role assignment is saved separately from ordinary settings.
old_handler = '''  const saveSettingsHandler=async(s)=>{\n    if(lifetimeReferralLimit(s)!==lifetimeReferralLimit(settings)) await snapshotExistingReferralProfiles(orders,settings);\n    setSettings(s); RUNTIME_CO_ADMIN=(s&&s.coAdminUid||"").trim(); await saveSettings(s); showToast("Settings saved");\n  };\n  // Keep the runtime co-admin UID in sync so an entered helper account also unlocks admin (cloud writes still gated by Firebase rules).\n  useEffect(()=>{ RUNTIME_CO_ADMIN=((settings&&settings.coAdminUid)||"").trim(); },[settings.coAdminUid]);'''
new_handler = '''  const saveSettingsHandler=async(s)=>{\n    if(lifetimeReferralLimit(s)!==lifetimeReferralLimit(settings)) await snapshotExistingReferralProfiles(orders,settings);\n    if(isMainAdminUid(FB_AUTH&&FB_AUTH.currentUser&&FB_AUTH.currentUser.uid)){\n      try{ await saveAdminAccess({coAdminUid:s.coAdminUid||"",permissions:s.coAdminPermissions||{}}); }catch(e){ showToast("Could not save co-admin access","error"); return; }\n    }\n    setSettings(s); await saveSettings(s); showToast("Settings saved");\n  };'''
app = must_replace(app, old_handler, new_handler, 'saveSettingsHandler')

# ── Main-only Admin Security + password and role editor ───────────────────
settings_sig = 'function SettingsPanel({settings,onSave,products=[]}){\n  const [f,setF]=useState({...DEFAULT_SETTINGS,...settings});'
settings_new = '''function SettingsPanel({settings,onSave,products=[]}){\n  const [f,setF]=useState({...DEFAULT_SETTINGS,...settings,coAdminUid:RUNTIME_ADMIN_ACCESS.coAdminUid||settings.coAdminUid||"",coAdminPermissions:{...DEFAULT_CO_ADMIN_PERMISSIONS,...RUNTIME_ADMIN_ACCESS.permissions}});'''
app = must_replace(app, settings_sig, settings_new, 'SettingsPanel state')
state_anchor = '  const adminOk=isAdminSignedIn();\n'
state_insert = '''  const adminOk=isAdminSignedIn();\n  const mainAdminOk=isMainAdminUid(FB_AUTH&&FB_AUTH.currentUser&&FB_AUTH.currentUser.uid);\n  const [newAdminPassword,setNewAdminPassword]=useState("");\n  const [confirmAdminPassword,setConfirmAdminPassword]=useState("");\n  const changeAdminPassword=async()=>{\n    if(!mainAdminOk){ setPwMsg("Only the main admin can change the Admin password."); return; }\n    if(newAdminPassword.length<6){ setPwMsg("Use at least 6 characters for the Admin password."); return; }\n    if(newAdminPassword!==confirmAdminPassword){ setPwMsg("The two passwords do not match."); return; }\n    const adminSetupHash=await adminPasswordDigest(newAdminPassword);\n    const nf={...f,adminSetupHash};\n    setF(nf); await onSave(nf);\n    setNewAdminPassword(""); setConfirmAdminPassword("");\n    setPwMsg("✓ Admin password updated. It will be required the next time Admin is unlocked.");\n  };\n'''
app = must_replace(app, state_anchor, state_insert, 'SettingsPanel admin state')

# Locate Admin Security card and replace the obsolete manual source-edit co-admin instructions.
sec_start = app.find('<Collapsible title="Admin Security"')
next_card = app.find('<Collapsible title="Data & Backup"', sec_start)
if sec_start < 0 or next_card < 0:
    raise RuntimeError('Admin Security / Data & Backup anchors missing')
comment = app.find('{/* ── Change Admin Google Account ── */}', sec_start, next_card)
if comment < 0:
    raise RuntimeError('old co-admin settings marker missing')
closing = app.rfind('</Collapsible>', comment, next_card)
if closing < 0:
    raise RuntimeError('Admin Security closing tag missing')
access_ui = r'''        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
          <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:9}}>🔑 Admin password</div>
          <div style={{fontSize:11,color:C.textSub,lineHeight:1.55,marginBottom:9}}>This password only unlocks the Admin workspace. Firebase still requires the authorised Google account for protected data.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input type="password" value={newAdminPassword} onChange={e=>setNewAdminPassword(e.target.value)} placeholder="New password" aria-label="New admin password" style={{minWidth:0,border:`1.5px solid ${C.border}`,borderRadius:9,padding:"9px 10px"}}/>
            <input type="password" value={confirmAdminPassword} onChange={e=>setConfirmAdminPassword(e.target.value)} placeholder="Confirm password" aria-label="Confirm admin password" style={{minWidth:0,border:`1.5px solid ${C.border}`,borderRadius:9,padding:"9px 10px"}}/>
          </div>
          <button className="press" onClick={changeAdminPassword} style={{marginTop:8,background:C.primary,color:"white",border:"none",borderRadius:9,padding:"8px 13px",fontSize:11.5,fontWeight:800}}>Save Admin password</button>
        </div>
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
          <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:8}}>🤝 Co-admin access</div>
          <div style={{fontSize:11,color:C.textSub,lineHeight:1.55,marginBottom:9}}>Paste the UID copied after the helper signs in with Google. Saving here activates database access; no source-code or Firebase-console edit is required.</div>
          <input value={f.coAdminUid||""} onChange={e=>set("coAdminUid",e.target.value.trim())} placeholder="Co-admin Google UID" aria-label="Co-admin Google UID" style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"9px 10px",fontFamily:"monospace",fontSize:11.5}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:10}}>
            {[['orders','📋 Orders'],['dashboard','📊 Dashboard'],['products','📦 Products'],['wallets','👛 Wallets'],['reviews','⭐ Reviews'],['requests','📨 Requests'],['guides','📖 Guides'],['settings','⚙️ Settings']].map(([key,label])=>(
              <label key={key} style={{display:"flex",alignItems:"center",gap:7,border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 9px",fontSize:11.5,fontWeight:700,color:C.text}}>
                <input type="checkbox" checked={!!(f.coAdminPermissions&&f.coAdminPermissions[key])} onChange={e=>set("coAdminPermissions",{...DEFAULT_CO_ADMIN_PERMISSIONS,...(f.coAdminPermissions||{}),[key]:e.target.checked})}/>{label}
              </label>
            ))}
          </div>
          <div style={{fontSize:10.5,color:C.textSub,lineHeight:1.55,marginTop:8}}>A co-admin cannot edit this UID, these permissions, or the Admin password. Disabled sections are hidden and Firebase rejects direct access.</div>
        </div>
'''
app = app[:comment] + access_ui + app[closing:]
# Hide the entire security card from co-admins.
sec_start = app.find('<Collapsible title="Admin Security"')
next_card = app.find('<Collapsible title="Data & Backup"', sec_start)
closing = app.rfind('</Collapsible>', sec_start, next_card) + len('</Collapsible>')
block = app[sec_start:closing]
app = app[:sec_start] + '{mainAdminOk&&(' + block + ')}' + app[closing:]

# ── Faster first paint: wallet refreshes after the cached storefront appears ─
old_gate = '''  /* Keep the cinematic loader over the app until the shared data needed by the home screen\n     and every customer page is ready. The wallet is included deliberately: previously the\n     cached shell dismissed the splash first and the coin total visibly changed afterward. */\n  useEffect(()=>{\n    if(loading||!hydrated||!settingsReady||!walletReady) return;\n    try{ window.__nemoBootReady=true; }catch(e){}\n    revealStore();\n  },[loading,hydrated,settingsReady,walletReady]);'''
new_gate = '''  /* First paint uses the cached storefront as soon as products + settings are ready. Wallet\n     balance refreshes in the background; it must never hold a returning customer behind splash. */\n  useEffect(()=>{\n    if(loading||!hydrated||!settingsReady) return;\n    try{ window.__nemoBootReady=true; }catch(e){}\n    revealStore();\n  },[loading,hydrated,settingsReady]);'''
app = must_replace(app, old_gate, new_gate, 'splash wallet gate')
app = app.replace('    setWalletReady(false);\n    const cached=loadLoyaltyLocal(uid);', '    const cached=loadLoyaltyLocal(uid);\n    setWalletReady(true);', 1)
app = app.replace('    /* If Firebase is unavailable, do not strand an offline customer behind the splash. Six\n       seconds gives the async SDK and authenticated wallet read time to complete on a slow\n       phone, then accepts the cached balance as the best available result. */\n    const fallback=setTimeout(()=>{ if(alive) setWalletReady(true); },6000);', '    // Cached balance is already painted; Firebase now refreshes it without delaying first paint.\n    const fallback=setTimeout(()=>{},0);', 1)

# ── Firebase security rules ────────────────────────────────────────────────
rules = json.loads(RULES.read_text())
r = rules['rules']
uid_match = re.search(r'const ADMIN_UID\s*=\s*"([^"]+)"', app)
if not uid_match:
    raise RuntimeError('main admin UID missing')
UID = uid_match.group(1)
main_atom = f"auth.uid === '{UID}'"
co_atom = "auth.uid === root.child('adminAccess/coAdminUid').val()"

def access_atom(section):
    return f"({main_atom} || ({co_atom} && root.child('adminAccess/permissions/{section}').val() === true))"

def replace_in(node, replacement, reads_replacement=None):
    if isinstance(node, dict):
        for k,v in list(node.items()):
            if isinstance(v, str):
                rep = reads_replacement if k == '.read' and reads_replacement else replacement
                node[k] = v.replace(main_atom, rep)
            else:
                replace_in(v, replacement, reads_replacement)
    elif isinstance(node, list):
        for x in node: replace_in(x, replacement, reads_replacement)

# Data-level enforcement for the eight role switches.
for key,section in {
    'products':'products','guides':'guides','reviews':'reviews','experienceReviews':'reviews',
    'requests':'requests','loyalty':'wallets','showcase':'reviews','testimonials':'reviews'
}.items():
    if key in r: replace_in(r[key], access_atom(section))
if 'media' in r:
    replace_in(r['media'], f"({main_atom} || ({co_atom} && (root.child('adminAccess/permissions/products').val() === true || root.child('adminAccess/permissions/guides').val() === true)))")
if 'orders' in r:
    replace_in(r['orders'], access_atom('orders'), f"({main_atom} || ({co_atom} && (root.child('adminAccess/permissions/orders').val() === true || root.child('adminAccess/permissions/dashboard').val() === true)))")
# Dashboard supporting nodes, when present.
for key in ['visitorLog','interest','analytics','productEvents','searchLog','pageViews','adminAnalytics']:
    if key in r: replace_in(r[key], access_atom('dashboard'))
# Orders-facing helper nodes, when present.
for key in ['abandonedCarts']:
    if key in r: replace_in(r[key], access_atom('orders'))
# Settings: co-admin may edit ordinary public settings but cannot mutate security/roles.
if 'settings' in r:
    r['settings']['.write'] = (
        f"auth != null && ({main_atom} || ({co_atom} && root.child('adminAccess/permissions/settings').val() === true "
        "&& newData.child('adminSetupHash').val() === data.child('adminSetupHash').val() "
        "&& newData.child('coAdminUid').val() === data.child('coAdminUid').val() "
        "&& newData.child('coAdminPermissions').val() === data.child('coAdminPermissions').val()))"
    )
# Private security/payment/bank data remains main-admin only.
for key in ['settingsPrivate','settingsBank','purchases','stockLedger']:
    if key in r:
        # normalise any accidental prior change back to main-only admin checks while keeping auth/self clauses absent here
        replace_in(r[key], main_atom)

r['adminAccess'] = {
    '.read': f"auth != null && ({main_atom} || {co_atom})",
    '.write': f"auth != null && {main_atom}",
    'coAdminUid': {'.validate': "!newData.exists() || (newData.isString() && newData.val().length <= 128)"},
    'permissions': {
        **{k:{'.validate':'newData.isBoolean()'} for k in ['orders','dashboard','products','wallets','reviews','requests','guides','settings']},
        '$other': {'.validate': False},
    },
    '$other': {'.validate': False},
}
RULES.write_text(json.dumps(rules, indent=2, ensure_ascii=False) + '\n')

# ── Tests: customer one-list + release invariants ─────────────────────────
test = TEST.read_text()
old_test = '''test('customer orders use four simple lifecycle groups', () => {\n  assert.match(app, /const orderStages=\\["Orders Placed","Shipped","Delivered","Past Orders"\\]/);\n  assert.match(app, /function customerOrderStage\\(/);\n  assert.match(app, /category==="Accessories"\\) \\? 3 : 1/);\n  assert.match(app, /!\\[['"]Shipped['"],['"]Delivered['"]\\]\\.includes\\(o\\.status\\)/);\n});'''
new_test = '''test('customer orders are the original single list, without lifecycle tabs', () => {\n  const customer = app.slice(app.indexOf('function OrderHistoryPage('), app.indexOf('function OrderTrackingBar('));\n  assert.match(customer, /const visibleOrders=myOrders/);\n  assert.doesNotMatch(customer, /orderStages|stageFilter|customerOrderStage\\(o\\)===/);\n});'''
if old_test not in test:
    raise RuntimeError('customer order test anchor missing')
test = test.replace(old_test, new_test, 1)
TEST.write_text(test)

release_test = Path('test/admin-access-release.test.mjs')
release_test.write_text(r'''import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app=readFileSync(new URL('../app.jsx',import.meta.url),'utf8');
const rules=JSON.parse(readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')).rules;
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('admin password gate and eight independent co-admin permissions are wired',()=>{
  for(const key of ['orders','dashboard','products','wallets','reviews','requests','guides','settings']) assert.match(app,new RegExp(`['"]${key}['"]`));
  assert.match(app,/ADMIN_SECTION_KEYS\.filter\(k=>canAdminSection/);
  assert.match(app,/type="password"/);
  assert.match(app,/adminSetupHash/);
  assert.match(app,/isMainAdminUid/);
  assert.match(app,/mainAdminOk&&\(<Collapsible title="Admin Security"/);
});

test('firebase has a main-owned access record and section rules reference permissions',()=>{
  assert.ok(rules.adminAccess);
  assert.match(rules.adminAccess['.write'],/auth\.uid ===/);
  assert.doesNotMatch(rules.adminAccess['.write'],/permissions\//);
  for(const key of ['orders','dashboard','products','wallets','reviews','requests','guides','settings']) assert.ok(rules.adminAccess.permissions[key]);
  assert.match(rules.orders['.read'],/permissions\/(orders|dashboard)/);
  assert.match(rules.products['.write'],/permissions\/products/);
  assert.match(rules.guides['.write'],/permissions\/guides/);
  assert.match(rules.settings['.write'],/adminSetupHash/);
});

test('promotion is a once-daily dismissible popup',()=>{
  const block=app.slice(app.indexOf('function OfferBanners('),app.indexOf('LOYALTY POINTS WIDGET'));
  assert.match(block,/nemo-promo-popup-day-v1/);
  assert.match(block,/onClick=\{close\}/);
  assert.match(block,/stopPropagation/);
  assert.match(block,/Close promotion/);
});

test('first paint does not wait for wallet and splash fallback is bounded',()=>{
  const boot=app.slice(app.indexOf('First paint uses the cached storefront'),app.indexOf('const deepLinkRef'));
  assert.doesNotMatch(boot,/walletReady/);
  const max=Number((index.match(/SPLASH_MAX_MS\s*=\s*(\d+)/)||[])[1]);
  assert.ok(max>0&&max<=5000,`splash max was ${max}`);
});
''')

# Bound the shell's hard fallback. Normal cached starts usually reveal earlier.
index = INDEX.read_text()
index, n = re.subn(r'const SPLASH_MAX_MS\s*=\s*12000', 'const SPLASH_MAX_MS = 4000', index, count=1)
if n != 1:
    raise RuntimeError('splash max anchor missing')
INDEX.write_text(index)
APP.write_text(app)
print('release patch applied')
