export function replaceSourceBlock(source,startMarker,endMarker,replacement){
  if(typeof source!=="string"||typeof replacement!=="string") throw new TypeError("Source and replacement must be strings");
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  if(start<0||end<0||end<=start) throw new Error(`Source block boundary not found: ${startMarker}`);
  const normalized=replacement.trimEnd()+"\n\n";
  return source.slice(0,start)+normalized+source.slice(end);
}

export function composeAdminLoginSource(appSource,adminLoginSource){
  return replaceSourceBlock(appSource,"function AdminLogin(","function MediaUploader(",adminLoginSource);
}

/* OfferBanners is rendered from inside Home. Portal is the primary escape hatch from the
 * animated/transformed Home container. The explicit one-viewport geometry is deliberate too:
 * if a browser temporarily treats that Home container as the fixed-position containing block,
 * inset:0 would make the backdrop as tall as the whole Home document and vertically center the
 * card several screens down. A 100dvh/100vh layer keeps the card centred in the visible screen
 * even during that transient layout state. */
export function composeOfferBannersPortalSource(source){
  if(typeof source!=="string") throw new TypeError("Source must be a string");
  const start=source.indexOf("function OfferBanners(");
  const end=source.indexOf("function FoodReorderBanner(",start);
  if(start<0||end<0||end<=start) throw new Error("OfferBanners boundary not found");

  let next=source.slice(start,end);

  const oldViewport='position:"fixed",inset:0,zIndex:4200';
  const fixedViewport='position:"fixed",top:0,left:0,right:0,height:"100dvh",minHeight:"100vh",zIndex:4200';
  if(next.includes(oldViewport)) next=next.replace(oldViewport,fixedViewport);
  if(!next.includes(fixedViewport)) throw new Error("OfferBanners viewport geometry not found");

  if(!next.includes("<Portal>")){
    const openMarker='  return(\n    <div onClick={close} role="presentation"';
    const closeMarker='    </div>\n  );\n}';
    if(!next.includes(openMarker)) throw new Error("OfferBanners root opening not found");
    if(!next.includes(closeMarker)) throw new Error("OfferBanners root closing not found");

    next=next.replace(openMarker,'  return(\n    <Portal>\n    <div onClick={close} role="presentation"');
    const closeAt=next.lastIndexOf(closeMarker);
    if(closeAt<0) throw new Error("OfferBanners root closing not found after opening compose");
    next=next.slice(0,closeAt)+'    </div>\n    </Portal>\n  );\n}'+next.slice(closeAt+closeMarker.length);
  }

  return source.slice(0,start)+next+source.slice(end);
}

function replaceRequiredOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0) throw new Error(`${label} not found`);
  if(source.indexOf(needle,first+needle.length)>=0) throw new Error(`${label} is not unique`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

/* Review deletion has two entry points: Admin review management and the customer's own review
 * on the product page. Both must stop for explicit confirmation before the destructive write.
 * The customer button is shown only when the stored review uid belongs to the current user.
 * After an owner deletes their own review, clear the device's reviewed marker as well so they
 * can submit a replacement review later instead of being permanently treated as "already rated". */
export function composeReviewDeleteConfirmationSource(source){
  if(typeof source!=="string") throw new TypeError("Source must be a string");
  if(source.includes('Delete your review?\\n\\nThis permanently removes your review and cannot be undone.')) return source;

  const reviewedHelperEnd='function addReviewedLocal(key,pid){ const s=loadReviewedSet(key); if(!s.includes(pid)){ s.push(pid); try{ localStorage.setItem(reviewedKey(key),JSON.stringify(s)); }catch{} } return s; }\n';
  const reviewedHelpers=reviewedHelperEnd+'function removeReviewedLocal(key,pid){ const s=loadReviewedSet(key).filter(x=>x!==pid); try{ localStorage.setItem(reviewedKey(key),JSON.stringify(s)); }catch{} return s; }\n';
  source=replaceRequiredOnce(source,reviewedHelperEnd,reviewedHelpers,"reviewed local helper");

  const detailSig='function DetailPage({product:p,products=[],mediaCache={},media={images:[],video:null},settings={},addToCart,cart=[],nav,goBack,user,orders,goAuth,onReviewsChanged,onReviewed,autoReview,reviewPreset=0,isFav=false,onFav,isInterested=false,onInterest,restockSet=[],onRestock}){';
  const detailSigNext='function DetailPage({product:p,products=[],mediaCache={},media={images:[],video:null},settings={},addToCart,cart=[],nav,goBack,user,orders,goAuth,onReviewsChanged,onReviewed,onReviewDeleted,autoReview,reviewPreset=0,isFav=false,onFav,isInterested=false,onInterest,restockSet=[],onRestock}){';
  source=replaceRequiredOnce(source,detailSig,detailSigNext,"DetailPage signature");

  const reviewHandlerTail='    setSubmitted(true);\n    setTimeout(()=>setSubmitted(false),3000);\n  };\n\n  return(';
  const reviewHandlerNext='    setSubmitted(true);\n    setTimeout(()=>setSubmitted(false),3000);\n  };\n\n  const handleDeleteOwnReview=async(r)=>{\n    const mine=userKey(user);\n    if(!r||!mine||r.uid!==mine) return;\n    if(!window.confirm("Delete your review?\\n\\nThis permanently removes your review and cannot be undone.")) return;\n    const next=await deleteReview(p.id,r.id);\n    setReviews(next);\n    onReviewsChanged && onReviewsChanged(p.id,next);\n    onReviewDeleted && onReviewDeleted(p.id);\n  };\n\n  return(';
  source=replaceRequiredOnce(source,reviewHandlerTail,reviewHandlerNext,"customer review delete handler");

  const stars='<ReviewStars value={r.rating} size={13}/>';
  const starsWithDelete=`<div style={{display:"flex",alignItems:"center",gap:8}}>
                      <ReviewStars value={r.rating} size={13}/>
                      {user&&r.uid===userKey(user)&&(<button className="press" onClick={()=>handleDeleteOwnReview(r)} aria-label="Delete your review" style={{background:"#fee2e2",border:"none",borderRadius:8,padding:"4px 9px",fontSize:10.5,fontWeight:700,color:C.danger,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>Delete</button>)}
                    </div>`;
  const detailStart=source.indexOf(detailSigNext);
  const detailEnd=source.indexOf("function CartPage(",detailStart);
  if(detailStart<0||detailEnd<0) throw new Error("DetailPage review block boundary not found");
  let detailBlock=source.slice(detailStart,detailEnd);
  detailBlock=replaceRequiredOnce(detailBlock,stars,starsWithDelete,"customer review delete button");
  source=source.slice(0,detailStart)+detailBlock+source.slice(detailEnd);

  const markReviewed='  const markReviewed=(pid)=>{ if(user){ setReviewedSet(addReviewedLocal(userKey(user),pid)); } };\n  const startReview=';
  const markReviewedNext='  const markReviewed=(pid)=>{ if(user){ setReviewedSet(addReviewedLocal(userKey(user),pid)); } };\n  const unmarkReviewed=(pid)=>{ if(user){ setReviewedSet(removeReviewedLocal(userKey(user),pid)); } };\n  const startReview=';
  source=replaceRequiredOnce(source,markReviewed,markReviewedNext,"reviewed state callbacks");

  const detailCall='onReviewsChanged={recomputeProductRating} onReviewed={markReviewed} autoReview=';
  const detailCallNext='onReviewsChanged={recomputeProductRating} onReviewed={markReviewed} onReviewDeleted={unmarkReviewed} autoReview=';
  source=replaceRequiredOnce(source,detailCall,detailCallNext,"DetailPage review delete callback");

  const adminHandler='  const handleDeleteReview=async(pid,rid)=>{\n    const next=await deleteReview(pid,rid);';
  const adminHandlerNext='  const handleDeleteReview=async(pid,rid)=>{\n    if(!window.confirm("Delete this customer review?\\n\\nThis permanently removes the review and cannot be undone.")) return;\n    const next=await deleteReview(pid,rid);';
  source=replaceRequiredOnce(source,adminHandler,adminHandlerNext,"Admin review delete confirmation");

  return source;
}
