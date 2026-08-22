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

/* OfferBanners is rendered from inside Home, whose animated/transformed page container can
 * become the containing block for position:fixed and can clip the dialog. The result is the
 * dark/blur backdrop being visible while the actual welcome/promotion card is missing.
 * Other full-screen dialogs already escape that layout through Portal, so compose this one
 * the same way without mutating the monolithic app.jsx source during the build. */
export function composeOfferBannersPortalSource(source){
  if(typeof source!=="string") throw new TypeError("Source must be a string");
  const start=source.indexOf("function OfferBanners(");
  const end=source.indexOf("function FoodReorderBanner(",start);
  if(start<0||end<0||end<=start) throw new Error("OfferBanners boundary not found");

  const block=source.slice(start,end);
  if(block.includes("<Portal>")) return source;

  const openMarker='  return(\n    <div onClick={close} role="presentation"';
  const closeMarker='    </div>\n  );\n}';
  if(!block.includes(openMarker)) throw new Error("OfferBanners root opening not found");
  if(!block.includes(closeMarker)) throw new Error("OfferBanners root closing not found");

  let next=block.replace(openMarker,'  return(\n    <Portal>\n    <div onClick={close} role="presentation"');
  const closeAt=next.lastIndexOf(closeMarker);
  if(closeAt<0) throw new Error("OfferBanners root closing not found after opening compose");
  next=next.slice(0,closeAt)+'    </div>\n    </Portal>\n  );\n}'+next.slice(closeAt+closeMarker.length);

  return source.slice(0,start)+next+source.slice(end);
}
