(function(){
  'use strict';

  /* ── Native-feeling mobile text behaviour ────────────────────────────────
     Normal app copy is intentionally not selectable. On phones, a tiny hold
     while scrolling otherwise opens the Select / Copy handles and makes the
     storefront feel like a web page rather than an app. Editing surfaces stay
     selectable so cursor placement, cut/copy/paste and accessibility tools keep
     working normally. Add data-allow-select="true" to any future element that
     should deliberately remain copyable. */
  var style=document.createElement('style');
  style.id='nemo-native-mobile-ux';
  style.textContent='\
.nemo-app,.nemo-app *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}\
.nemo-app input,.nemo-app textarea,.nemo-app [contenteditable="true"],.nemo-app [data-allow-select="true"]{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important;}\
#nemo-exit-confirm{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.58);display:flex;align-items:flex-end;justify-content:center;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;-webkit-user-select:none;user-select:none;}\
#nemo-exit-confirm .nemo-exit-sheet{width:100%;max-width:430px;box-sizing:border-box;background:#fff;border-radius:22px 22px 0 0;padding:24px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -14px 44px rgba(15,23,42,.28);animation:nemoExitUp .2s ease-out both;}\
#nemo-exit-confirm .nemo-exit-icon{text-align:center;font-size:36px;margin-bottom:10px;}\
#nemo-exit-confirm .nemo-exit-title{text-align:center;color:#0f172a;font-size:20px;font-weight:800;margin:0 0 7px;}\
#nemo-exit-confirm .nemo-exit-copy{text-align:center;color:#64748b;font-size:13.5px;line-height:1.55;margin:0 0 20px;}\
#nemo-exit-confirm .nemo-exit-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}\
#nemo-exit-confirm button{min-height:48px;border-radius:14px;font:800 14px/1 \'Plus Jakarta Sans\',system-ui,sans-serif;cursor:pointer;}\
#nemo-exit-cancel{background:#0ea5e9;color:#fff;border:0;}\
#nemo-exit-leave{background:#fff;color:#e11d48;border:1.5px solid #e11d48;}\
@keyframes nemoExitUp{from{transform:translateY(20px);opacity:.75}to{transform:none;opacity:1}}\
@media(prefers-reduced-motion:reduce){#nemo-exit-confirm .nemo-exit-sheet{animation:none;}}';
  (document.head||document.documentElement).appendChild(style);

  function allowSelect(target){
    return !!(target&&target.closest&&target.closest('input,textarea,[contenteditable="true"],[data-allow-select="true"]'));
  }
  document.addEventListener('selectstart',function(e){
    if(allowSelect(e.target)) return;
    if(e.target&&e.target.closest&&e.target.closest('.nemo-app')) e.preventDefault();
  },true);

  /* ── Home exit confirmation ───────────────────────────────────────────────
     app.jsx already owns the useful part of hardware Back: inner screens pop
     the app's navigation trail, and a Back press on a scrolled Home returns to
     the top. We only intercept the final Back at the TOP of Home, before the
     React popstate listener sees it, and replace the old double-back toast with
     an explicit confirmation sheet. This shell-level listener runs before the
     app bundle, so it applies to both the precompiled app.js fast path and the
     app.jsx fallback path without duplicating their navigation logic. */
  var modal=null;
  var exitRequested=false;
  var restoreFocus=null;

  function visibleHome(){
    var hero=document.querySelector('.home-hero');
    if(!hero||!hero.getClientRects().length) return null;
    return hero;
  }
  function appScroller(start){
    for(var n=start;n&&n!==document.body;n=n.parentElement){
      if(n.scrollHeight>n.clientHeight+1){
        var oy='';
        try{ oy=getComputedStyle(n).overflowY||''; }catch(e){}
        if(oy==='auto'||oy==='scroll'||oy==='overlay') return n;
      }
    }
    return null;
  }
  function homeAtTop(){
    var hero=visibleHome();
    if(!hero) return false;
    var sc=appScroller(hero);
    return !sc||sc.scrollTop<=8;
  }
  function rearmBackTrap(){
    try{ history.pushState({nemo:1},''); }catch(e){}
  }
  function hideExit(){
    if(!modal) return;
    var old=modal; modal=null;
    if(old.parentNode) old.parentNode.removeChild(old);
    try{ if(restoreFocus&&document.contains(restoreFocus)) restoreFocus.focus({preventScroll:true}); }catch(e){}
    restoreFocus=null;
  }
  function showExit(){
    if(modal) return;
    restoreFocus=document.activeElement;
    var wrap=document.createElement('div');
    wrap.id='nemo-exit-confirm';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.setAttribute('aria-labelledby','nemo-exit-title');
    wrap.innerHTML='<div class="nemo-exit-sheet" role="document">'+
      '<div class="nemo-exit-icon" aria-hidden="true">🐠</div>'+
      '<div class="nemo-exit-title" id="nemo-exit-title">Exit Nemo Aqua Store?</div>'+
      '<p class="nemo-exit-copy">Are you sure you want to close the app?</p>'+
      '<div class="nemo-exit-actions">'+
        '<button type="button" id="nemo-exit-cancel">Cancel</button>'+
        '<button type="button" id="nemo-exit-leave">Exit Nemo</button>'+
      '</div></div>';
    wrap.addEventListener('click',function(e){ if(e.target===wrap) hideExit(); });
    wrap.querySelector('#nemo-exit-cancel').addEventListener('click',hideExit);
    wrap.querySelector('#nemo-exit-leave').addEventListener('click',function(){
      hideExit();
      exitRequested=true;
      try{ history.back(); }catch(e){ exitRequested=false; }
    });
    document.body.appendChild(wrap);
    modal=wrap;
    setTimeout(function(){ try{ wrap.querySelector('#nemo-exit-cancel').focus({preventScroll:true}); }catch(e){} },0);
  }

  function onPop(e){
    /* Exit button: first traverse from Nemo's sentinel to the page-load entry,
       suppressing the app's own Back handler, then take the real system Back.
       That matches the app's existing two-step history trap but needs only one
       deliberate tap after the confirmation. */
    if(exitRequested){
      e.stopImmediatePropagation();
      exitRequested=false;
      setTimeout(function(){ try{ history.back(); }catch(err){} },0);
      return;
    }
    /* Pressing hardware Back while the confirmation itself is open means
       "dismiss", not "exit". Re-arm the consumed sentinel and close the sheet. */
    if(modal){
      e.stopImmediatePropagation();
      rearmBackTrap();
      hideExit();
      return;
    }
    /* Inner pages and a scrolled Home remain entirely under app.jsx control. */
    if(!homeAtTop()) return;

    e.stopImmediatePropagation();
    rearmBackTrap();
    showExit();
  }
  window.addEventListener('popstate',onPop,true);

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&modal){ e.preventDefault(); hideExit(); }
  },true);
})();
