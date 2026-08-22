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
