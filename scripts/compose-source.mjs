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
