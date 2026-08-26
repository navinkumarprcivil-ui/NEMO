function replaceRequiredOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0) throw new Error(`${label} not found`);
  if(source.indexOf(needle,first+needle.length)>=0) throw new Error(`${label} is not unique`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

/* Mobile UX belongs in the shipped React source, not in a shell-only helper script.
 * That gives TWA/PWA sessions one Back handler, makes the build fingerprint change when
 * this behavior changes, and guarantees the service-worker version moves with it. */
export function composeMobileUxSource(source){
  if(typeof source!=="string") throw new TypeError("Source must be a string");

  // Stop accidental long-press Select/Copy handles while a customer scrolls the app.
  // Editing fields stay selectable; data-allow-select is the explicit opt-in escape hatch.
  const tapStyle='*{-webkit-tap-highlight-color:transparent;}\n';
  const selectionStyles=tapStyle+
    '.nemo-app,.nemo-app *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}\n'+
    '.nemo-app input,.nemo-app textarea,.nemo-app select,.nemo-app [contenteditable="true"],.nemo-app [data-allow-select="true"]{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important;}\n';
  source=replaceRequiredOnce(source,tapStyle,selectionStyles,"native mobile selection styles");

  // The Android shell already keeps the webpage above the phone's system navigation area.
  // Move the cart/discount pill a little closer to Nemo's own bottom navigation there, while
  // preserving the existing browser/PWA safe-area spacing everywhere else.
  const floatingCartBottom='bottom:"calc(76px + env(safe-area-inset-bottom))"';
  const floatingCartBottomApp='bottom:(window.nemoInApp?"68px":"calc(76px + env(safe-area-inset-bottom))")';
  source=replaceRequiredOnce(source,floatingCartBottom,floatingCartBottomApp,"Android floating cart position");

  // Use an in-app sheet because window.confirm() is unreliable inside popstate on phones.
  const adminHubMarker='/* ═══════════════════ ADMIN HUB (Dashboard + Orders) ═══════════════════ */';
  const appExitComponent=`/* Confirmation shown when the phone's Back button is pressed at the top of Home.
   Kept inside React so the same behavior is used by the precompiled app and fallback source. */
function AppExitConfirm({onStay,onExit}){
  return(
    <div role="presentation" onClick={onStay}
      style={{position:"fixed",inset:0,background:"rgba(17,24,39,.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:4100}}>
      <div role="dialog" aria-modal="true" aria-labelledby="nemo-app-exit-title" className="slide-up" onClick={e=>e.stopPropagation()}
        style={{width:"100%",maxWidth:440,background:"#fff",borderRadius:"20px 20px 0 0",padding:"22px 20px calc(22px + env(safe-area-inset-bottom))",boxShadow:"0 -12px 40px rgba(0,0,0,.25)"}}>
        <div style={{fontSize:34,textAlign:"center",marginBottom:10}}>🐠</div>
        <div id="nemo-app-exit-title" style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:20,fontWeight:800,color:C.text,marginBottom:8,textAlign:"center"}}>Exit Nemo Aqua Store?</div>
        <div style={{fontSize:13.5,color:C.textSub,lineHeight:1.6,marginBottom:18,textAlign:"center"}}>Are you sure you want to close the app?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button autoFocus className="press" onClick={onStay}
            style={{background:C.primary,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:14.5,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>Cancel</button>
          <button className="press" onClick={onExit}
            style={{background:"#fff",color:C.danger,border:"1.5px solid "+C.danger,borderRadius:14,padding:"15px",fontSize:14.5,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>Exit Nemo</button>
        </div>
      </div>
    </div>
  );
}

`;
  source=replaceRequiredOnce(source,adminHubMarker,appExitComponent+adminHubMarker,"app exit confirmation component");

  const oldBackComment='  // Phone Back button: from any inner page → one step back up the trail; on Home → "press back again to exit".\n';
  const newBackComment='  // Phone Back button: inner pages follow the real trail; top-of-Home asks before leaving Nemo.\n';
  source=replaceRequiredOnce(source,oldBackComment,newBackComment,"phone Back comment");

  const oldExitRef='  const exitArmRef = useRef(0);\n';
  const exitState='  const [appExitAsk,setAppExitAsk]=useState(false);\n  const appExitAskRef=useRef(false);\n';
  source=replaceRequiredOnce(source,oldExitRef,exitState,"app exit state");

  // Back while the confirmation is open means Cancel, so the consumed sentinel is re-armed.
  const popStart='    const onPop=()=>{\n      if(pageRef.current==="admin"){';
  const popStartNext='    const onPop=()=>{\n      if(appExitAskRef.current){\n        try{ history.pushState({nemo:1},""); }catch(e){}\n        appExitAskRef.current=false;\n        setAppExitAsk(false);\n        return;\n      }\n      if(pageRef.current==="admin"){';
  source=replaceRequiredOnce(source,popStart,popStartNext,"hardware Back handler start");

  // Replace only the final Home branch, leaving inner-page, Admin, and scroll-to-top behavior intact.
  const exitComment='        // At the top of Home: classic mobile "press back again to exit"';
  const commentAt=source.indexOf(exitComment);
  if(commentAt<0) throw new Error("legacy Home exit branch not found");
  const branchStart=source.lastIndexOf('      } else {',commentAt);
  const handlerTail='    };\n    window.addEventListener("popstate",onPop);';
  const branchEnd=source.indexOf(handlerTail,commentAt);
  if(branchStart<0||branchEnd<0||branchEnd<=branchStart) throw new Error("legacy Home exit branch boundary not found");
  const homeExit=`      } else {
        // At the top of Home, stay inside Nemo until the customer explicitly confirms exit.
        // This Back press consumed the sentinel, so re-arm it before opening the sheet.
        try{ history.pushState({nemo:1},""); }catch(e){}
        appExitAskRef.current=true;
        setAppExitAsk(true);
      }
`;
  source=source.slice(0,branchStart)+homeExit+source.slice(branchEnd);

  const adminExitRender='      {adminExitAsk&&<AdminExitConfirm onStay={()=>setAdminExitAsk(false)} onLeave={()=>{setAdminExitAsk(false);nav("home");}}/>}\n';
  const exitRender=adminExitRender+
    '      {appExitAsk&&<AppExitConfirm onStay={()=>{appExitAskRef.current=false;setAppExitAsk(false);}} onExit={()=>{try{window.close();}catch(e){}}}/>}\n';
  source=replaceRequiredOnce(source,adminExitRender,exitRender,"app exit confirmation render");

  return source;
}
