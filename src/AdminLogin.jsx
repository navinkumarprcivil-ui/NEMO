function AdminLogin({onSuccess,onBack,onAdminSignIn,settings={}}){
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [configured,setConfigured]=useState(String(settings.adminSetupHash||"").trim());
  const [checking,setChecking]=useState(!String(settings.adminSetupHash||"").trim());

  useEffect(()=>{
    const fromSettings=String(settings.adminSetupHash||"").trim();
    if(fromSettings){ setConfigured(fromSettings); setChecking(false); return; }
    let live=true;
    (async()=>{
      setChecking(true);
      try{
        await waitForFirebase(4000);
        if(FB_OK&&FB_DB){
          const snap=await FB_DB.ref("settings/adminSetupHash").get();
          if(live) setConfigured(String((snap&&snap.val())||"").trim());
        }
      }catch(e){}
      finally{ if(live) setChecking(false); }
    })();
    return()=>{ live=false; };
  },[settings.adminSetupHash]);

  const unlock=async()=>{
    if(checking){ setMsg("Checking Admin password setup…"); return; }
    if(!configured){ setMsg("Admin password has not been set yet. Sign in once with the main Google account, then set it in Admin Security."); return; }
    if(!password){ setMsg("Enter the admin password."); return; }
    setBusy(true); setMsg("");
    try{
      const digest=await adminPasswordDigest(password);
      if(digest!==configured){ setMsg("Incorrect admin password."); return; }
      onSuccess();
    }finally{ setBusy(false); }
  };

  const bootstrap=async()=>{
    setBusy(true); setMsg("");
    try{
      const u=await onAdminSignIn?.();
      if(u) await refreshAdminAccess();
      if(u&&isMainAdminUid(u.uid)) onSuccess();
      else if(u) setMsg("Only the main admin can initialise the Admin password.");
    }finally{ setBusy(false); }
  };

  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",background:C.bg,padding:"24px",position:"relative"}}>
      <button className="press" onClick={onBack} style={{position:"absolute",top:20,left:16,background:"none",border:"none",fontSize:24,color:C.textSub,width:44,height:44}}>←</button>
      <div style={{fontSize:56,marginBottom:14}}>🔐</div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:24,fontWeight:800,color:C.text,marginBottom:7}}>Admin</div>
      <div style={{fontSize:12.5,color:C.textSub,textAlign:"center",lineHeight:1.6,maxWidth:380,marginBottom:18}}>Enter the Admin password every time you open Admin. Google sign-in is needed only for shared Firebase data and changes; only the main admin or the added co-admin UID can sync changes.</div>
      <div style={{width:"min(100%,360px)"}}>
        <input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")unlock();}} placeholder="Admin password" aria-label="Admin password" style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,outline:"none",marginBottom:10}}/>
        <button className="press" onClick={unlock} disabled={busy||checking} style={{width:"100%",background:(busy||checking)?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:12,padding:"12px 16px",fontSize:13,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{checking?"Checking…":busy?"Checking…":"Unlock Admin"}</button>
      </div>
      {!configured&&!checking&&(
        <button className="press" onClick={bootstrap} disabled={busy} style={{marginTop:12,background:"white",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"10px 14px",fontSize:11.5,fontWeight:800,color:C.text}}>{busy?"Signing in…":"Main admin: set up password"}</button>
      )}
      {msg&&<div style={{marginTop:12,maxWidth:380,textAlign:"center",fontSize:11.5,color:msg.toLowerCase().includes("incorrect")||msg.toLowerCase().includes("only")?C.danger:C.textSub,lineHeight:1.5}}>{msg}</div>}
    </div>
  );
}
