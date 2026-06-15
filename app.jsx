const { useState, useEffect, useRef, useMemo } = React;

/* ═══════════════════ THEME ═══════════════════ */
const C = {
  bg:"#eef9fa", card:"#fff", primary:"#0b6e72", primaryDark:"#084f53",
  accent:"#12b5bc", accentLight:"#d4f4f5", coral:"#ff5a40",
  text:"#0a2426", textSub:"#5a8085", border:"#cce8ea",
  navBg:"rgba(255,255,255,0.97)", adminBg:"#0b6e72",
  success:"#16a34a", danger:"#dc2626",
};
const STORE_NAME     = "Nemo";
const PRICE_FONT     = "'Space Grotesk','Baloo 2',sans-serif"; // distinct font for prices / amounts
const ADMIN_PASS_HASH = "hlltu9q"; // default admin password stored as a non-reversible hash (never plaintext). Change it right after launch: tap the logo 10× → Settings → Admin Security.
const ADMIN_OVERRIDE_HASH = "h11ya21j"; // secret-answer fallback when the OTP email can't be sent. Clue shown: "IITM Roll Number". (hash, never plaintext)
const ADMIN_UID      = "cI2HmMt6FdR7fO7uUnugH85GeZt2"; // your Google account — must match Firebase rules
const ADMIN_UID_2    = ""; // OPTIONAL co-admin (your helper). Paste their Google UID here, then also add it in database.rules.json + Firebase console. Leave "" if unused.
const ADMIN_UIDS     = [ADMIN_UID, ADMIN_UID_2].filter(Boolean); // everyone allowed admin access
let RUNTIME_CO_ADMIN = ""; // optional co-admin UID entered in Admin → Settings (kept in sync from settings.coAdminUid)
function isAdminUid(uid){ return !!uid && (ADMIN_UIDS.indexOf(uid)!==-1 || (!!RUNTIME_CO_ADMIN && uid===RUNTIME_CO_ADMIN)); }
const BUSINESS_WA    = "919360921030"; // ← change to your WhatsApp number
const BUSINESS_EMAIL = "nemoaquastore@gmail.com"; // store email — used for order alerts + admin OTP when Settings email is blank
const SECRET_TAPS    = 10;             // tap logo this many times to open admin
// Guaranteed-present inline logo (used only if both the uploaded logo and the bundled file fail to load)
const NEMO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230b8f96'/%3E%3Cstop offset='1' stop-color='%23085f63'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='100' cy='100' r='100' fill='url(%23g)'/%3E%3Cpath d='M70 100c0-20 20-34 44-34 14 0 26 6 33 14l18-14v68l-18-14c-7 8-19 14-33 14-24 0-44-14-44-34z' fill='%23ff8c3b'/%3E%3Ccircle cx='86' cy='92' r='5' fill='%23fff'/%3E%3Cpath d='M70 100l-22-16v32z' fill='%23ffd9b8'/%3E%3C/svg%3E";
const STORE_LOGO = "assets/nemo-logo.png"; // hard-coded brand logo (NEMO AQUA STORE wordmark)

/* Is the current Firebase user the admin Google account? (cloud writes only work when true) */
function isAdminSignedIn(){ return !!(FB_OK && FB_AUTH && FB_AUTH.currentUser && isAdminUid(FB_AUTH.currentUser.uid)); }
/* Lightweight non-reversible hash so the admin password is never stored in plaintext */
function hashPass(s){ let h=5381; for(let i=0;i<String(s).length;i++){ h=(((h<<5)+h)+String(s).charCodeAt(i))>>>0; } return "h"+h.toString(36); }
/* Crop any image to a centered circle (cover-fit), returns a transparent PNG data-URL */
function cropToCircle(dataURL, size=512){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const cv=document.createElement("canvas"); cv.width=size; cv.height=size;
      const ctx=cv.getContext("2d");
      // Explicitly clear to fully transparent — prevents black-background artefact
      ctx.clearRect(0,0,size,size);
      ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.closePath(); ctx.clip();
      const scale=Math.max(size/img.width,size/img.height);
      const w=img.width*scale, h=img.height*scale;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
      res(cv.toDataURL("image/png"));
    };
    img.onerror=()=>res(dataURL);
    img.src=dataURL;
  });
}

const CAT_META = {
  "Live Fish":   { emoji:"🐠", c1:"#0b6e72", c2:"#12b5bc" },
  "Plants":      { emoji:"🌿", c1:"#1a6b3c", c2:"#2da85f" },
  "Accessories": { emoji:"⚙️",  c1:"#1a3060", c2:"#2d52a8" },
  "Tanks":       { emoji:"🐋", c1:"#0a3050", c2:"#1a5080" },
  "Feed":        { emoji:"🥣", c1:"#7a3a00", c2:"#c46000" },
};
const CATEGORIES  = Object.keys(CAT_META);
const ORDER_STATUSES = ["Payment Review","Confirmed","Shipped","Delivered"]; // post-payment progress
const ALL_STATUSES   = ["Awaiting Payment","Payment Review","Confirmed","Shipped","Delivered","Cancelled"];
const PAY_WINDOW_MIN = 10; // minutes a customer has to pay before auto-cancel
const DEFAULT_STOCK  = 10;
const MAX_PER_ORDER  = 10;
const SORT_OPTS = [
  {id:"relevance", label:"Relevance"},
  {id:"price-asc", label:"Price: Low to High"},
  {id:"price-desc",label:"Price: High to Low"},
  {id:"name",      label:"Name (A–Z)"},
  {id:"rating",    label:"Top Rated"},
  {id:"new",       label:"Newest"},
];

/* Live fish variants — default set applied when a Live Fish product has no variants */
const DEFAULT_FISH_VARIANTS = [
  { id:"v1", label:"1 Pair — 1 Male & 1 Female",    priceMul:1.0, soldOut:false },
  { id:"v2", label:"5 Pair — 5 Male & 5 Female",    priceMul:4.5, soldOut:false },
  { id:"v3", label:"Trio — 1 Male & 2 Female",       priceMul:1.4, soldOut:false },
  { id:"v4", label:"Breeding Pair — 1 Male & 1 Female", priceMul:1.6, soldOut:true  },
  { id:"v5", label:"Adult — 1 Pair (Male & Female)",  priceMul:1.8, soldOut:false },
];
function productVariants(p){
  if(p.category!=="Live Fish") return null;
  return p.variants && p.variants.length ? p.variants : DEFAULT_FISH_VARIANTS;
}
/* Absolute (pre-discount) price for a variant — prefers admin-set price, falls back to legacy multiplier */
function variantBasePrice(p, v){
  if(!v) return p.price||0;
  if(typeof v.price==="number") return v.price;
  if(typeof v.priceMul==="number") return Math.round((p.price||0)*v.priceMul);
  return p.price||0;
}
/* Price a customer pays for a variant (discount applied) */
function variantEffPrice(p, v){
  const base=variantBasePrice(p,v);
  const d=p.discountPct||0;
  return Math.round(base*(1-d/100));
}
function effectivePrice(p, discountPct){
  const d = discountPct ?? p.discountPct ?? 0;
  return Math.round(p.price * (1 - d/100));
}

/* ═══════════════════ SHIPPING ═══════════════════ */
const DEFAULT_SHIPPING_RATES = {
  basePackagingKg: 0.5,        // base box/material weight added to every dry-goods order
  liveBasePackagingKg: 0.5,    // base box/oxygen-bag weight added to every live-fish order
  dryGoods: {
    "Up to 500g":{ TN:60,  SouthIndia:80,  CentralIndia:100, NorthIndia:120 },
    "500g-1kg":  { TN:80,  SouthIndia:100, CentralIndia:120, NorthIndia:150 },
    "1-2kg":     { TN:120, SouthIndia:150, CentralIndia:180, NorthIndia:220 },
    "2-5kg":     { TN:200, SouthIndia:250, CentralIndia:300, NorthIndia:400 },
    "5-10kg":    { TN:350, SouthIndia:450, CentralIndia:550, NorthIndia:700 },
  },
  liveFish: {
    // Same weight tiers as dry goods — live fish carry a premium due to oxygen packing & insulation
    "Up to 500g":{ TN:130, SouthIndia:180, CentralIndia:220, NorthIndia:300 },
    "500g-1kg":  { TN:170, SouthIndia:230, CentralIndia:290, NorthIndia:380 },
    "1-2kg":     { TN:250, SouthIndia:300, CentralIndia:400, NorthIndia:500 },
    "2-5kg":     { TN:400, SouthIndia:500, CentralIndia:650, NorthIndia:800 },
    "5-10kg":    { TN:600, SouthIndia:750, CentralIndia:900, NorthIndia:1200 },
  },
  // Thermacol (insulated) box material surcharge — added ONLY when a thermacol packing is chosen.
  // Charged by total live-parcel weight bracket, just like the courier rates above.
  thermacol: {
    "Up to 500g":40, "500g-1kg":70, "1-2kg":110, "2-5kg":200, "5-10kg":350,
  },
};
/* Canonical weight tiers shared by dry goods AND live fish. */
const SHIP_TIERS = ["Up to 500g","500g-1kg","1-2kg","2-5kg","5-10kg"];
/* Migrate any legacy shipping brackets (e.g. old Small/Medium/Large live-fish keys) to the
   weight tiers above, preserving prices for any tier that already matches. */
function normalizeShippingRates(rates){
  if(!rates || typeof rates!=="object") return rates;
  const fixType=(obj,def)=>{
    const keys=Object.keys(obj||{});
    const clean = keys.length===SHIP_TIERS.length && SHIP_TIERS.every(t=>keys.includes(t));
    if(clean) return obj; // already weight-based
    const out={};
    SHIP_TIERS.forEach(t=>{ out[t]={...def[t], ...((obj&&obj[t])?obj[t]:{})}; });
    return out;
  };
  return { ...rates,
    dryGoods: fixType(rates.dryGoods, DEFAULT_SHIPPING_RATES.dryGoods),
    liveFish: fixType(rates.liveFish, DEFAULT_SHIPPING_RATES.liveFish) };
}
/* Normalize a whole settings object loaded from storage (currently just shipping rates). */
function normalizeSettings(s){
  if(!s) return s;
  if(s.shippingRates) return {...s, shippingRates: normalizeShippingRates(s.shippingRates)};
  return s;
}
const ZONE_LABELS = { TN:"Tamil Nadu", SouthIndia:"South India", CentralIndia:"Central India", NorthIndia:"North India" };
const ZONE_KEYS   = Object.keys(ZONE_LABELS);
function pincodeToZone(pin){
  const p=parseInt((pin||"").replace(/\D/g,""),10);
  if(!p||isNaN(p))return null;
  if(p>=600000&&p<=643999)return "TN";
  if((p>=500000&&p<=535999)||(p>=560000&&p<=599999)||(p>=670000&&p<=695999)||(p>=605000&&p<=607999))return "SouthIndia";
  if((p>=400000&&p<=445999)||(p>=450000&&p<=497999)||(p>=360000&&p<=396999)||(p>=403000&&p<=403999))return "CentralIndia";
  return "NorthIndia";
}
/* Live Arrival Guarantee opt-in fee varies by destination: Inside TN / South India / Rest of India (North).
   Central India + anything unknown is grouped under "North" (rest of India). Falls back to the flat price. */
function liveGuaranteeZoneKey(zone){
  if(zone==="TN") return "TN";
  if(zone==="SouthIndia") return "South";
  return "North"; // NorthIndia + CentralIndia + unknown
}
function liveGuaranteeZoneLabel(zone){
  const k=liveGuaranteeZoneKey(zone);
  return k==="TN"?"Inside Tamil Nadu":k==="South"?"South India":"Rest of India";
}
function liveGuaranteePriceForZone(zone, settings){
  const flat=Number(settings.liveGuaranteePrice||150);
  const map={ TN:settings.liveGuaranteePriceTN, South:settings.liveGuaranteePriceSouth, North:settings.liveGuaranteePriceNorth };
  const v=map[liveGuaranteeZoneKey(zone)];
  return (v===0||v) ? Number(v) : flat;
}
/* Lowest of the three zone prices — used to show a "from ₹X" hint before an address is entered. */
function liveGuaranteeMinPrice(settings){
  const vals=["liveGuaranteePriceTN","liveGuaranteePriceSouth","liveGuaranteePriceNorth"]
    .map(k=>settings[k]).filter(v=>v===0||v).map(Number);
  if(!vals.length) return Number(settings.liveGuaranteePrice||150);
  return Math.min(...vals);
}
/* Live fish uses the same 5-tier weight brackets as dry goods so rates are directly comparable */
function getLiveFishWeightBracket(kg){
  if(kg<=0.5)return "Up to 500g";
  if(kg<=1)  return "500g-1kg";
  if(kg<=2)  return "1-2kg";
  if(kg<=5)  return "2-5kg";
  return "5-10kg";
}
function getWeightBracket(kg){
  if(kg<=0.5)return "Up to 500g";
  if(kg<=1)  return "500g-1kg";
  if(kg<=2)  return "1-2kg";
  if(kg<=5)  return "2-5kg";
  return "5-10kg";
}
/* ─────────── Live-fish packing options (customer chooses one at checkout) ───────────
   Two independent layers fold into 4 named options:
     • box     : carton | thermacol  (thermacol = insulated, adds a weight-based material charge)
     • courier : normal | special    (special = priority/fast & safe, adds the flat Special fee)
   rank = protection level (1 = lightest → 4 = safest). The Live Arrival Guarantee applies when
   the customer picks the admin-recommended packing (per product) OR a higher-rank one. */
const PACKING_OPTIONS = [
  { key:"carton_normal",      label:"Carton Box · Normal Courier",      box:"carton",    courier:"normal",  rank:1, blurb:"Economical — fine for nearby locations." },
  { key:"carton_special",     label:"Carton Box · Speed Courier",       box:"carton",    courier:"special", rank:2, blurb:"Faster delivery with safe handling by the courier." },
  { key:"thermacol_standard", label:"Thermacol Box · Standard Courier", box:"thermacol", courier:"normal",  rank:3, blurb:"Insulated box — for premium fish, local transport." },
  { key:"thermacol_special",  label:"Thermacol Box · Speed Courier",    box:"thermacol", courier:"special", rank:4, blurb:"Best protection — premium fish & long-distance travel." },
];
const PACKING_BY_KEY = PACKING_OPTIONS.reduce((m,o)=>{m[o.key]=o;return m;},{});
function packingOpt(key){ return PACKING_BY_KEY[key] || PACKING_BY_KEY.carton_special; }
function packingLabel(key){ return packingOpt(key).label; }
/* Recommended packing for a cart = the safest (highest-rank) per-product suggestion among its live fish. */
function suggestedPackingForCart(cart){
  let best=null;
  (cart||[]).forEach(i=>{
    if(i.category!=="Live Fish") return;
    const o=PACKING_BY_KEY[i.suggestedPacking||"carton_special"];
    if(o && (!best || o.rank>best.rank)) best=o;
  });
  return best ? best.key : "carton_special";
}
/* Thermacol material surcharge for a given parcel-weight bracket. */
function thermacolCharge(bracket, settings){
  const r=(settings&&settings.shippingRates)||DEFAULT_SHIPPING_RATES;
  return Number((r.thermacol||DEFAULT_SHIPPING_RATES.thermacol)[bracket]||0);
}
/* Thermacol (packaging) portion of a cart's shipping fee — 0 unless a thermacol packing is chosen.
   Used to keep the shipping-reward calc to courier charges only (packaging is never rewardable). */
function thermacolFeeFor(cart, packingKey, settings){
  const pk=packingOpt(packingKey);
  if(pk.box!=="thermacol") return 0;
  const fishItems=(cart||[]).filter(i=>i.category==="Live Fish");
  if(!fishItems.length) return 0;
  const r=settings.shippingRates||DEFAULT_SHIPPING_RATES;
  const fishWt=fishItems.reduce((s,i)=>s+(Number(i.variantPackagingWeight!=null?i.variantPackagingWeight:i.packagingWeight)||0.2)*i.qty,0);
  const liveBase=Number(r.liveBasePackagingKg!=null?r.liveBasePackagingKg:(r.basePackagingKg??0.5));
  return thermacolCharge(getLiveFishWeightBracket(fishWt+liveBase), settings);
}
/* Zones live fish are NOT delivered to when the admin restriction is on. */
const LIVE_FISH_BLOCKED_ZONES = ["CentralIndia","NorthIndia"];
function liveFishBlockedForZone(zone, settings){
  if(settings && settings.liveFishRestrictNCIndia===false) return false;
  return LIVE_FISH_BLOCKED_ZONES.includes(zone);
}
/* The customer's oldest un-redeemed shipping-reward code (reward stacks on top of coupons). */
function unredeemedShippingReward(orders){
  const list=orders||[];
  const redeemed=new Set(list.map(o=>(o.rewardRedeemedCode||"").toLowerCase()).filter(Boolean));
  const sorted=[...list].sort((a,b)=>(a.placedAt||"").localeCompare(b.placedAt||"")); // oldest first
  for(const o of sorted){
    const rw=o.shippingReward;
    if(rw&&rw.code&&!redeemed.has(rw.code.toLowerCase())){
      return {code:rw.code, amount:Number(rw.amount)||0, fromOrderId:o.id};
    }
  }
  return null;
}
/* Itemised shipping cost so checkout can show a breakup:
   { courier, thermacol, carton, special, total, freeShip }. All in ₹. */
function shippingBreakdown(cart, zone, opts, settings){
  if(!zone) return null;
  const r = settings.shippingRates || DEFAULT_SHIPPING_RATES;
  // opts: object {packing, special} (new) OR a bare boolean isSpecial (legacy)
  const o = (opts && typeof opts==="object") ? opts : { special: !!opts };
  const packing = packingOpt(o.packing);
  const dryItems  = cart.filter(i=>i.category!=="Live Fish");
  const fishItems = cart.filter(i=>i.category==="Live Fish");
  // Special-courier surcharge applies when the fish packing uses a special courier, or (dry-only) the special box is ticked
  const wantSpecial = fishItems.length ? (packing.courier==="special") : !!o.special;
  // Free-delivery threshold — waives courier + packaging (a special courier still bypasses free delivery)
  const threshold = Number(settings.freeDeliveryThreshold||0);
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty, 0);
  const freeShip = threshold > 0 && subtotal >= threshold && !wantSpecial;
  let courier = 0, thermacol = 0, carton = 0, special = 0;
  if(fishItems.length){
    // Weight-based live fish shipping (uses variantPackagingWeight if set, else product packagingWeight)
    const fishWt = fishItems.reduce((s,i)=>{
      const wt = Number(i.variantPackagingWeight != null ? i.variantPackagingWeight : i.packagingWeight) || 0.2;
      return s + wt * i.qty;
    },0);
    const liveBase = Number(r.liveBasePackagingKg != null ? r.liveBasePackagingKg : (r.basePackagingKg ?? 0.5));
    const bracket = getLiveFishWeightBracket(fishWt + liveBase);
    courier += (r.liveFish?.[bracket]?.[zone]||0);
    if(packing.box==="thermacol") thermacol += thermacolCharge(bracket, settings);
    else if(packing.box==="carton") carton += Number(settings.cartonPackingCharge||0);
  }
  if(dryItems.length){
    const wt = dryItems.reduce((s,i)=>s+((Number(i.packagingWeight)||0.1)*i.qty),0)+(Number(r.basePackagingKg)||0.5);
    const bracket = getWeightBracket(wt);
    courier += (r.dryGoods?.[bracket]?.[zone]||0);
  }
  if(wantSpecial) special += Number(settings.specialDeliveryPrice||0);
  if(freeShip){ courier = 0; thermacol = 0; carton = 0; }
  return { courier, thermacol, carton, special, total: courier+thermacol+carton+special, freeShip };
}
function calcShipping(cart, zone, opts, settings){
  const b = shippingBreakdown(cart, zone, opts, settings);
  return b ? b.total : null;
}
/* Open a courier's tracking page for an order. If the saved track URL contains a
   {awb}/{tracking}/{number} placeholder it's filled with the consignment number;
   otherwise the number is copied to the clipboard so the customer can paste it. */
function trackParcelUrl(o){
  let url=(o&&o.courierTrackUrl)||"";
  const num=((o&&o.trackingNumber)||"").trim();
  if(url && /\{(awb|tracking|number|id|consignment)\}/i.test(url)){
    url=url.replace(/\{(awb|tracking|number|id|consignment)\}/ig, encodeURIComponent(num));
  }
  return url;
}
function trackParcel(o){
  const url=trackParcelUrl(o);
  if(!url) return;
  const num=((o&&o.trackingNumber)||"").trim();
  if(num && !/\{(awb|tracking|number|id|consignment)\}/i.test(o.courierTrackUrl||"")){
    try{ navigator.clipboard.writeText(num); }catch(e){}
  }
  try{ window.open(url,"_blank","noopener"); }catch(e){ try{ location.href=url; }catch(_){} }
}
function validateCoupon(code, settings, userOrders, cartTotal){
  if(!code||!code.trim()) return {ok:false, msg:""};
  const coupons = settings.coupons||[];
  const c = coupons.find(x=>x.code&&x.code.toLowerCase()===code.trim().toLowerCase()&&x.active!==false);
  if(!c) return {ok:false, msg:"Invalid coupon code"};
  if(c.minOrder && Number(c.minOrder)>0 && (cartTotal||0) < Number(c.minOrder)){
    return {ok:false, msg:`Minimum cart value ₹${c.minOrder} required for this coupon (add ₹${Number(c.minOrder)-(cartTotal||0)} more)`};
  }
  const already = (userOrders||[]).some(o=>o.coupon&&o.coupon.toLowerCase()===code.trim().toLowerCase());
  if(already) return {ok:false, msg:"Coupon already used on this account"};
  return {ok:true, coupon:c};
}


/* ═══════════════════ DEFAULT PRODUCTS ═══════════════════ */
/* stockCount = number of units available. discountPct = 0–100. offerEndsAt = ISO date (or null) */
const DEFAULT_PRODUCTS = [
  { id:"p1",  name:"Betta Splendens",    category:"Live Fish",   price:350,  stockCount:10, tag:"Popular",      rating:4.8, reviews:124, desc:"Vibrant male betta with stunning flowing fins. Each fish has unique coloration — living art for your tank. Hardy and interactive, best kept solo.", discountPct:0, offerEndsAt:null },
  { id:"p2",  name:"Neon Tetra",         category:"Live Fish",   price:80,   stockCount:10, tag:"Best Seller",  rating:4.9, reviews:287, desc:"Classic schooling fish with iridescent blue-red stripes. Best kept in groups of 6+. Peaceful community fish perfect for planted tanks.", discountPct:0, offerEndsAt:null },
  { id:"p3",  name:"Clownfish",          category:"Live Fish",   price:850,  stockCount:4,  tag:"Marine",       rating:4.7, reviews:89,  desc:"Iconic orange and white striped marine fish. Thrives alongside sea anemones. Hardy, personable, full of character. Marine tank required.", discountPct:0, offerEndsAt:null },
  { id:"p4",  name:"Fancy Guppy Pair",   category:"Live Fish",   price:120,  stockCount:10, tag:"Beginner",     rating:4.6, reviews:203, desc:"Colour-morphed guppies selected for vibrant tail patterns. Easily bred. Great for beginners — active and peaceful.", discountPct:0, offerEndsAt:null },
  { id:"p5",  name:"Java Fern",          category:"Plants",      price:150,  stockCount:10, tag:"Easy Care",    rating:4.7, reviews:156, desc:"Hardy aquatic plant thriving in low light. Attach to driftwood or rocks — no substrate needed. Ideal for any freshwater setup.", discountPct:0, offerEndsAt:null },
  { id:"p6",  name:"Anubias Barteri",    category:"Plants",      price:200,  stockCount:10, tag:"Hardy",        rating:4.8, reviews:98,  desc:"Virtually indestructible broad-leaf plant. Slow-growing with deep green foliage. Attach to hardscape for best results.", discountPct:0, offerEndsAt:null },
  { id:"p7",  name:"HOB Filter 300L/h",  category:"Accessories", price:1200, stockCount:10, tag:"Essential",    rating:4.5, reviews:167, desc:"Hang-on-back power filter for tanks up to 80L. Near-silent operation with 3-stage biological and mechanical filtration.", discountPct:0, offerEndsAt:null },
  { id:"p8",  name:"Planted LED Light",  category:"Accessories", price:1800, stockCount:10, tag:"Pro Pick",     rating:4.9, reviews:201, desc:"Full-spectrum LED grow light for planted tanks. Programmable timer, smooth dimming, and sunrise/sunset simulation.", discountPct:0, offerEndsAt:null },
  { id:"p9",  name:"Starter Tank 20L",   category:"Tanks",       price:2500, stockCount:10, tag:"Complete Kit", rating:4.6, reviews:134, desc:"Complete beginner kit — glass tank, filter, LED light, thermometer. Everything to start your aquarium journey today.", discountPct:0, offerEndsAt:null },
  { id:"p10", name:"Tropical Flakes 100g",category:"Feed",       price:180,  stockCount:10, tag:"Daily Use",    rating:4.7, reviews:312, desc:"Premium tropical fish food with natural colour enhancers. Balanced nutrition with spirulina and astaxanthin.", discountPct:0, offerEndsAt:null },
];

/* Migrate legacy stock string → stockCount number */
function normalizeProduct(p){
  if(typeof p.stockCount !== "number"){
    p.stockCount = p.stock==="Out of Stock" ? 0 : p.stock==="Limited" ? 3 : DEFAULT_STOCK;
  }
  if(typeof p.discountPct !== "number") p.discountPct = 0;
  if(p.offerEndsAt === undefined) p.offerEndsAt = null;
  // Real-review rating fields (ignore legacy seeded rating/reviews)
  if(typeof p.reviewCount !== "number") p.reviewCount = 0;
  if(typeof p.ratingAvg !== "number") p.ratingAvg = 0;
  if(typeof p.comingSoon !== "boolean") p.comingSoon = false;
  return p;
}

/* ═══════════════════ STORAGE ═══════════════════ */
function withTimeout(promise, ms, fallback=null){
  return Promise.race([ Promise.resolve(promise).catch(()=>fallback), new Promise(r=>setTimeout(()=>r(fallback), ms)) ]);
}
/* Local (device) layer — used as cache + offline fallback */
async function dbGet(k)   { try { const v=localStorage.getItem(k); return v; } catch { return null; } }
/* Free space by evicting cached media (base64 images/videos). Returns bytes freed.
   Collect keys first, then remove, so live index shifts don't skip entries. */
function evictMediaCache(targetBytes){
  let freed=0; const keys=[];
  try{ for(let i=0;i<localStorage.length;i++){ const key=localStorage.key(i); if(key&&(key.indexOf("nemo-img-")===0||key.indexOf("nemo-vid-")===0||key.indexOf("nemo-m-")===0)) keys.push(key); } }catch(e){ return 0; }
  for(const key of keys){ const val=localStorage.getItem(key)||""; try{ localStorage.removeItem(key); freed+=val.length; }catch(e){} if(freed>=targetBytes) break; }
  return freed;
}
async function dbSet(k,v) {
  try { localStorage.setItem(k,v); return true; }
  catch(e){
    // Quota exceeded (localStorage fills with base64 media). Evict media and retry,
    // so small critical keys — settings, orders, user — always persist.
    try{ evictMediaCache((v?v.length:0)*2 + 500000); localStorage.setItem(k,v); return true; }
    catch(e2){
      const isMedia=(k.indexOf("nemo-img-")===0||k.indexOf("nemo-vid-")===0||k.indexOf("nemo-m-")===0);
      if(!isMedia){ try{ evictMediaCache(Infinity); localStorage.setItem(k,v); return true; }catch(e3){} }
      return false;
    }
  }
}
async function dbDel(k)   { try { localStorage.removeItem(k); } catch {} }

/* ── Firebase Realtime Database ──
   If the deployment URL/region differs, edit databaseURL below to match the
   URL shown at the top of your Realtime Database data page. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDMb2su47ac5o3JH9yE7Jv45T1kvxHfVac",
  authDomain: "nemo-aqua-store.firebaseapp.com",
  databaseURL: "https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nemo-aqua-store",
  storageBucket: "nemo-aqua-store.firebasestorage.app",
  messagingSenderId: "771650250460",
  appId: "1:771650250460:web:94a3df5aec9bd125a7b619",
};
let FB_DB=null, FB_AUTH=null, FB_OK=false;
function tryInitFirebase(){
  if(FB_OK) return true;
  if(typeof firebase==="undefined" || !firebase.database || !firebase.auth) return false;
  try{
    if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    FB_DB=firebase.database(); FB_AUTH=firebase.auth(); FB_OK=true;
    // Re-sync whenever auth state resolves. IMPORTANT: only sign in anonymously when
    // NOBODY is signed in — otherwise we'd clobber a returning customer's persisted Google
    // session (which would break their order reads/writes under the security rules).
    firebase.auth().onAuthStateChanged(u=>{
      if(u){ try{ window.dispatchEvent(new Event("nemo-fb-ready")); }catch(e){} }
      else { firebase.auth().signInAnonymously().catch(()=>{}); }
    });
    console.log("✓ Firebase connected");
    try{ window.dispatchEvent(new Event("nemo-fb-ready")); }catch(e){}
    return true;
  }catch(e){ console.warn("Firebase init failed:", e?.message||e); return false; }
}
/* The SDK is loaded async; poll briefly until it's available (no-op if it never loads). */
(function pollFB(n){ if(tryInitFirebase()||n<=0) return; setTimeout(()=>pollFB(n-1), 250); })(40);

async function fbGetColl(path){
  if(!FB_OK) return null;
  try{ const s=await withTimeout(FB_DB.ref(path).get(),6000); if(!s) return null; const v=s.val(); return v?Object.values(v):[]; }
  catch(e){ console.warn("fbGetColl "+path,e?.message); return null; }
}
async function fbSetColl(path,arr){
  if(!FB_OK) return false;
  try{ const o={}; arr.forEach(x=>{o[x.id]=x;}); await FB_DB.ref(path).set(o); return true; }
  catch(e){ console.warn("fbSetColl "+path,e?.message); return false; }
}
async function fbGetObj(path){
  if(!FB_OK) return null;
  try{ const s=await withTimeout(FB_DB.ref(path).get(),6000); return s?(s.val()||null):null; }
  catch(e){ console.warn("fbGetObj "+path,e?.message); return null; }
}
async function fbSetObj(path,obj){
  if(!FB_OK) return false;
  try{ await FB_DB.ref(path).set(obj); return true; }
  catch(e){ console.warn("fbSetObj "+path,e?.message); return false; }
}

async function loadProducts(){
  if(FB_OK){ const a=await fbGetColl("products"); if(a&&a.length) return a; }
  const r=await dbGet("nemo-products"); return r?JSON.parse(r):null;
}
async function saveProd(l)   { await dbSet("nemo-products",JSON.stringify(l)); if(FB_OK) await fbSetColl("products",l); }
async function loadOrders()  { // admin: ALL orders (flattened from orders/<uid>/<id>)
  if(FB_OK){
    const s=await withTimeout(FB_DB.ref("orders").get(),6000);
    if(s){ const v=s.val(); const all=[]; if(v) Object.values(v).forEach(byUser=>{ if(byUser&&typeof byUser==="object") Object.values(byUser).forEach(o=>{ if(o&&o.id) all.push(o); }); }); if(all.length||v!==null) return all.sort((x,y)=>(y.placedAt||"").localeCompare(x.placedAt||"")); }
  }
  const r=await dbGet("nemo-orders"); return r?JSON.parse(r):[];
}
async function loadUserOrders(uid){ // a single customer's orders
  if(FB_OK&&uid){
    const s=await withTimeout(FB_DB.ref("orders/"+uid).get(),6000);
    if(s){ const v=s.val(); return v?Object.values(v).filter(o=>o&&o.id).sort((x,y)=>(y.placedAt||"").localeCompare(x.placedAt||"")):[]; }
  }
  const r=await dbGet("nemo-orders"); const arr=r?JSON.parse(r):[]; return uid?arr.filter(o=>o.userUid===uid):arr;
}
async function saveOneOrder(o){ // write one order to local cache + cloud (per-user node)
  const r=await dbGet("nemo-orders"); let arr=r?JSON.parse(r):[]; arr=[o,...arr.filter(x=>x.id!==o.id)]; await dbSet("nemo-orders",JSON.stringify(arr));
  if(FB_OK&&o.userUid){ try{ await FB_DB.ref("orders/"+o.userUid+"/"+o.id).set(o); }catch(e){} }
}
async function saveOrders(l) { await dbSet("nemo-orders",JSON.stringify(l)); } // local cache only
/* ── Media cache: IndexedDB (large quota) with one-time migration from the old localStorage cache.
   Big base64 images/videos live here instead of localStorage, so the 5MB localStorage cap
   (which silently broke settings/orders writes) is never hit by media again. ── */
const HAS_IDB = (typeof indexedDB!=="undefined");
const IDB = (function(){
  let dbp=null;
  function open(){
    if(dbp) return dbp;
    dbp=new Promise((res)=>{
      try{
        const r=indexedDB.open("nemo-media",1);
        r.onupgradeneeded=()=>{ try{ r.result.createObjectStore("kv"); }catch(e){} };
        r.onsuccess=()=>res(r.result);
        r.onerror=()=>res(null);
      }catch(e){ res(null); }
    });
    return dbp;
  }
  function store(mode){ return open().then(db=>{ if(!db) return null; try{ return db.transaction("kv",mode).objectStore("kv"); }catch(e){ return null; } }); }
  return {
    get(k){ return store("readonly").then(s=>s&&new Promise(res=>{ const r=s.get(k); r.onsuccess=()=>res(r.result==null?null:r.result); r.onerror=()=>res(null); })).catch(()=>null); },
    set(k,v){ return store("readwrite").then(s=>s&&new Promise(res=>{ const r=s.put(v,k); r.onsuccess=()=>res(true); r.onerror=()=>res(false); })).catch(()=>false); },
    del(k){ return store("readwrite").then(s=>s&&new Promise(res=>{ const r=s.delete(k); r.onsuccess=()=>res(true); r.onerror=()=>res(true); })).catch(()=>{}); },
  };
})();
async function mediaGet(k){
  if(HAS_IDB){
    const v=await IDB.get(k); if(v!=null) return v;
    // Migrate any legacy localStorage copy into IDB, then free the localStorage slot.
    try{ const ls=localStorage.getItem(k); if(ls!=null){ IDB.set(k,ls); localStorage.removeItem(k); return ls; } }catch(e){}
    return null;
  }
  return dbGet(k);
}
async function mediaSet(k,v){
  if(HAS_IDB){ const ok=await IDB.set(k,v); if(ok){ try{ localStorage.removeItem(k); }catch(e){} return true; } }
  return dbSet(k,v);
}
async function mediaDel(k){ if(HAS_IDB){ await IDB.del(k); } try{ localStorage.removeItem(k); }catch(e){} }

async function loadImg(id)   { const l=await mediaGet("nemo-img-"+id); if(l)return l; if(FB_OK){ const v=await fbGetObj("media/img-"+id); if(v){ mediaSet("nemo-img-"+id,v); return v; } } return null; }
async function saveImg(id,b) { await mediaSet("nemo-img-"+id,b); if(FB_OK){ try{ await FB_DB.ref("media/img-"+id).set(b); }catch(e){} } return true; }
async function loadVid(id)   { return mediaGet("nemo-vid-"+id); }
async function saveVid(id,b) { return mediaSet("nemo-vid-"+id,b); }
async function delMedia(id)  { await mediaDel("nemo-img-"+id); await mediaDel("nemo-vid-"+id); if(FB_OK){ try{ await FB_DB.ref("media/img-"+id).remove(); }catch(e){} } }

/* ── Multi-media (per-product gallery): base64 stored in RTDB `media/<key>` + IndexedDB cache ── */
async function saveMediaItem(key,b64){
  await mediaSet("nemo-m-"+key,b64);
  if(FB_OK){ try{ await FB_DB.ref("media/"+key).set(b64); }catch(e){ console.warn("saveMediaItem",e?.message); } }
  return true;
}
async function loadMediaItem(key){
  // Check local (IndexedDB) cache first — avoids a 6-second Firebase timeout on every image load
  const cached=await mediaGet("nemo-m-"+key); if(cached)return cached;
  if(FB_OK){ try{ const s=await withTimeout(FB_DB.ref("media/"+key).get(),6000); const v=s&&s.val(); if(v){ mediaSet("nemo-m-"+key,v); return v; } }catch(e){} }
  return null;
}
async function delMediaItem(key){
  await mediaDel("nemo-m-"+key);
  if(FB_OK){ try{ await FB_DB.ref("media/"+key).remove(); }catch(e){} }
}
/* Compress an image file to a JPEG data-URL (keeps RTDB + sync light) */
function compressImage(file, maxDim=1100, quality=0.82){
  return new Promise((resolve,reject)=>{
    if(file.type==="image/gif"){ const r=new FileReader(); r.onload=e=>resolve(e.target.result); r.onerror=reject; r.readAsDataURL(file); return; }
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>{
      let {width:w,height:h}=img;
      if(w>maxDim||h>maxDim){ const s=maxDim/Math.max(w,h); w=Math.round(w*s); h=Math.round(h*s); }
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg",quality));
    };
    img.onerror=(err)=>{ URL.revokeObjectURL(url); reject(err); }; img.src=url;
  });
}
/* Resolve a product's gallery from the media cache (with backward-compat) */
function getProductMedia(p, cache={}){
  const images=[]; let video=null;
  if(Array.isArray(p.media)&&p.media.length){
    p.media.forEach(m=>{ const src=cache["m-"+m.key]; if(m.type==="video"){ if(src)video=src; } else if(src)images.push(src); });
  }
  if(!images.length){ // legacy single-image fields
    if(p.imageUrl) images.push(p.imageUrl);
    else if(cache["img-"+p.id]) images.push(cache["img-"+p.id]);
  }
  if(!video && cache["vid-"+p.id]) video=cache["vid-"+p.id];
  return {images, video};
}

async function loadReviews(pid){
  if(FB_OK){ const a=await fbGetColl("reviews/"+pid); if(a) return a.sort((x,y)=>(y.date||"").localeCompare(x.date||"")); }
  const r=await dbGet("nemo-rev-"+pid); return r?JSON.parse(r):[];
}
async function saveReviews(pid,list){ await dbSet("nemo-rev-"+pid,JSON.stringify(list)); if(FB_OK) await fbSetColl("reviews/"+pid,list); }
async function appendReview(pid,rev){
  // Write ONLY this review to its own node — never overwrite the whole collection (a whole-node .set wiped concurrent reviewers' entries)
  if(FB_OK){ try{ await FB_DB.ref("reviews/"+pid+"/"+rev.id).set(rev); }catch(e){} }
  const list=await loadReviews(pid);
  const next=list.some(r=>r.id===rev.id)?list:[rev,...list];
  await dbSet("nemo-rev-"+pid,JSON.stringify(next)); // local cache only
  return next;
}
async function deleteReview(pid,rid){
  if(FB_OK){ try{ await FB_DB.ref("reviews/"+pid+"/"+rid).remove(); }catch(e){} } // remove just this review, not the whole node
  const list=await loadReviews(pid);
  const next=list.filter(r=>r.id!==rid);
  await dbSet("nemo-rev-"+pid,JSON.stringify(next));
  return next;
}

/* Store settings (WhatsApp numbers, payment) — shared via Firebase */
const DEFAULT_SETTINGS = { ownerWhatsapp:BUSINESS_WA, supporterWhatsapp:"", supporterEnabled:false, storeAddress:"", storeHours:"", orderEmail:"", instagramUrl:"", facebookUrl:"", storeLogo:"", adminPassHash:"", emailjsService:"", emailjsTemplate:"", emailjsKey:"", upiId:"", upiName:STORE_NAME, razorpayLink:"",
  aboutStory:"Nemo Aqua Store is a passionate home-based aquarium business. We hand-pick healthy, vibrant fish, live plants, and quality accessories — and deliver them with care to fellow hobbyists. Every order is packed personally to make sure your aquatic friends arrive happy and healthy.",
  deliveryAreas:"We currently deliver across the city and nearby areas. Live fish are delivered on selected days to ensure safe, short transit. Please provide a complete, correct address and stay reachable on the delivery day — deliveries that fail due to a wrong address, no response, or no one available are not covered by our guarantees and may incur a re-delivery charge. Contact us on WhatsApp to confirm delivery to your location.",
  liveArrivalGuarantee:"Live Arrival Guarantee is included free with every live fish order shipped on our recommended Speed Delivery parcel — there is no separate charge. Because temperature and transit conditions vary by area and season, you may instead choose a normal parcel based on your location and weather; orders sent by normal parcel are not covered by the guarantee.\n\nTo make a claim you must send ONE clear, continuous, unedited unboxing video — starting with the sealed, unopened package and clearly showing the affected fish — to our WhatsApp within 2 hours of delivery. We review the video, and if approved we resolve it ONE time by a replacement fish, store credit equal to the fish's value, or a refund of the fish amount; the form of resolution is decided by us. The guarantee covers the price of the affected fish only — delivery/shipping charges are not refundable.\n\nReplacement shipments carry no further guarantee. The guarantee does not apply without a valid unboxing video, if our acclimatization steps were not followed, to wrong/incomplete addresses, failed or refused deliveries, or to any loss after the fish has been placed in your tank.",
  returnPolicy:"NO RETURNS & NO REPLACEMENTS once live fish or plants have been received in good condition — all livestock sales are final on safe delivery. The only cover for transit loss is the Live Arrival Guarantee (DOA) above, which is one-time and limited to the cost of the fish. Live fish & plants are non-returnable and non-refundable once delivered safely. Approved DOA refunds are processed within 5–7 working days of our approval of your unboxing video — no item needs to be returned. Unused accessories & equipment in original, undamaged packaging may be returned within 3 days of delivery; return shipping is paid by the customer unless the item arrived damaged or incorrect, and refunds for returned dry goods are issued within 5–7 working days after we receive and inspect the item. Refunds (where applicable) are issued as store credit or to the original payment method. Orders cannot be cancelled once payment is confirmed.",
  acclimatizationTips:"1. Float the sealed bag in your tank for 15–20 min to match temperature.\n2. Open the bag and add a little tank water every 5 min for 20–30 min.\n3. Gently net the fish into your tank — avoid pouring bag water in.\n4. Keep lights off for a few hours to reduce stress.\n5. Wait 24 hours before the first feeding.",
  shippingRates: null,
  specialDeliveryPrice: 200,
  cartonPackingCharge: 0,         // flat carton-packing charge for live-fish parcels (₹). 0 = no charge; raise it in Settings later
  coAdminUid: "",                 // optional co-admin Google UID (also add it to database.rules.json + the Firebase console)
  couriers: [],                  // [{id,name,trackUrl}] — courier partners + their tracking-page links
  shippingRewardMin: 10,         // min ₹ overcharge before a shipping-reward code is auto-created
  liveFishRestrictNCIndia: true, // when true, live fish can't be ordered to Central/North India
  /* Business / legal identity (shown on About page + invoice). No PAN/personal data is ever displayed. */
  legalName: "NEMO AQUA STORE",
  legalEntity: "Proprietorship · Udyam-registered Micro Enterprise",
  legalActivity: "Trading — aquarium fish, plants & accessories",
  legalCity: "Salem, Tamil Nadu, India",
  legalAddress: "",          // optional full address for the invoice; leave blank to show only the city
  gstin: "",                  // add once registered → invoice becomes a GST "Tax Invoice"
  jurisdiction: "Salem, Tamil Nadu",
  termsPolicy: "By placing an order you agree to these terms. "+STORE_NAME+" Aqua Store is a home-based proprietary micro-enterprise (Udyam-registered) trading in aquarium livestock and supplies. All orders are subject to stock availability and our acceptance of your payment. Prices are in INR and inclusive of applicable taxes. We are currently a small enterprise not registered under GST, so no GST is charged at present; this notice and your invoice will be updated once we register for GST, at which point your bill will be issued as a GST Tax Invoice. Live animals are perishable goods sold under our Live Arrival Guarantee, which is your sole and exclusive remedy for any transit loss. To the maximum extent permitted by law, our total liability for any order is limited to the amount actually paid for that order; we are not liable for indirect, incidental or consequential losses, nor for any loss arising after livestock has been introduced to your tank or system. We are not responsible for delays or failures caused by courier partners, weather, power/water conditions at your premises, or other events beyond our reasonable control. These terms are governed by the laws of India and subject to the exclusive jurisdiction of the courts at Salem, Tamil Nadu.",
  privacyPolicy: "We collect only the details needed to fulfil your order — your name, contact number, delivery address and email, plus the payment reference ID and screenshot you submit so we can verify your payment. This information is used solely to process, deliver and provide support for your orders. We do not sell your data or share it with anyone except our delivery partners and payment provider, and only as needed to complete your order. Payments are processed through your own UPI app or our secure payment gateway; we never see or store your card, UPI PIN or bank credentials. You can ask us to delete your stored account data at any time by messaging us on WhatsApp.",
  liveGuaranteePrice: 150,        // legacy flat fallback
  liveGuaranteePriceTN: 150,      // Inside Tamil Nadu
  liveGuaranteePriceSouth: 200,   // South India
  liveGuaranteePriceNorth: 250,   // North / rest of India (incl. Central)
  freeDeliveryThreshold: 0,
  coupons: [],
  showCouponField: true,   // master switch: show the coupon entry box at checkout
  /* First-order coupon */
  welcomeCouponEnabled: true,
  welcomeCoupon: "WELCOME100",
  welcomeCouponAmount: 100,
  welcomeCouponMinOrder: 999,
  /* Festival/seasonal banner */
  festivalBanner: { text:"", emoji:"🎉", bg:"#7c3aed", active:false, endsAt:"" },
  /* Loyalty points */
  loyaltyEnabled: true,
  loyaltyPointsPerHundred: 10,  // points earned per ₹100 spent
  loyaltyRedeemMin: 100,        // minimum points to redeem
  loyaltyRedeemValue: 1,        // ₹ value per point
  walletMaxCoins: 100,          // max wallet coins redeemable per order
  walletMinOrder: 500,          // min order subtotal (₹) to redeem wallet coins
  maxDiscountPct: 25,           // hard cap: coupon + referral + loyalty together can't exceed this % of cart subtotal
  /* Referral */
  referralEnabled: true,
  referralDiscount: 50,
  referralCoins: 50,      // wallet points credited to the code-giver when a friend uses it
  referralMinOrder: 0,    // min order value before a referral code is issued (0 = always)
  /* Daily promo caps — limit how many customers can redeem each offer per day (0 = unlimited) */
  couponDailyLimit: 0,
  referralDailyLimit: 0,
  /* Customer tank showcase */
  showcaseEnabled: true,
  /* Customer testimonials on the home page */
  testimonialsEnabled: true,
  /* Which customer emails to auto-send (saves EmailJS quota — rest you can do on WhatsApp) */
  emailPlaced: true,      // order received + bill
  emailConfirmed: false,  // payment confirmed (WhatsApp instead)
  emailShipped: true,     // shipped + tracking
  emailDelivered: false,  // delivered (WhatsApp instead)
};
async function loadSettings(){
  if(FB_OK){ const o=await fbGetObj("settings"); if(o) return normalizeSettings({...DEFAULT_SETTINGS,...o}); }
  const r=await dbGet("nemo-settings"); return r?normalizeSettings({...DEFAULT_SETTINGS,...JSON.parse(r)}):{...DEFAULT_SETTINGS};
}
async function saveSettings(s){ await dbSet("nemo-settings",JSON.stringify(s)); if(FB_OK) await fbSetObj("settings",s); }

/* ── Referral codes (6-digit, one-time-use, tracked in Firebase) ── */
function genRefCode(){ return String(Math.floor(100000 + Math.random()*900000)); } // 6 digits
/* Get this customer's stable referral code, creating it once if needed. */
async function getMyReferralCode(uid){
  if(!uid) return null;
  if(FB_OK){
    try{
      const ref=FB_DB.ref("userrefs/"+uid);
      const snap=await ref.get();
      if(snap&&snap.exists()) return snap.val();
      // create a fresh, unused code
      let code=genRefCode();
      await ref.set(code);
      await FB_DB.ref("referrals/"+code).set({owner:uid,used:false,createdAt:Date.now()});
      return code;
    }catch(e){ return null; }
  }
  // offline fallback — local only
  let code=localStorage.getItem("nemo-myref-"+uid);
  if(!code){ code=genRefCode(); localStorage.setItem("nemo-myref-"+uid,code); }
  return code;
}
/* Validate a referral code at checkout. Returns {ok, msg}. */
async function validateReferral(code, uid){
  const c=(code||"").trim();
  if(!/^\d{6}$/.test(c)) return {ok:false, msg:"Referral codes are 6 digits"};
  if(!FB_OK) return {ok:false, msg:"Referral check unavailable right now"};
  try{
    const snap=await FB_DB.ref("referrals/"+c).get();
    if(!snap||!snap.exists()) return {ok:false, msg:"Invalid referral code"};
    const r=snap.val();
    if(r.owner===uid) return {ok:false, msg:"You can't use your own referral code"};
    if(r.used) return {ok:false, msg:"This referral code has already been used"};
    return {ok:true};
  }catch(e){ return {ok:false, msg:"Couldn't verify code — try again"}; }
}
/* Mark a referral code as claimed at order placement so it can't be reused. The giver's
   wallet reward is NOT granted yet — it's written onto the node only when the friend's
   order is delivered (see creditReferralOnDelivery). */
async function claimReferral(code, uid, orderId){
  const c=(code||"").trim();
  if(!FB_OK || !/^\d{6}$/.test(c)) return;
  try{ await FB_DB.ref("referrals/"+c).update({used:true, claimedBy:uid||"", claimedAt:Date.now(), pendingOrderId:orderId||"", delivered:false}); }catch(e){}
}
/* Called when a friend's order (that used a referral code) is marked Delivered — grants the
   code-giver their wallet coins. Idempotent: only writes once per code. */
async function creditReferralOnDelivery(code, settings, deliveredOrderId){
  const c=(code||"").trim();
  if(!FB_OK || !/^\d{6}$/.test(c)) return;
  const coins=Number((settings&&settings.referralCoins)!=null?settings.referralCoins:50)||0;
  try{
    const snap=await FB_DB.ref("referrals/"+c).get();
    const r=snap&&snap.val();
    if(!r || r.delivered===true) return; // already credited
    await FB_DB.ref("referrals/"+c).update({delivered:true, rewardCoins:coins, deliveredOrderId:deliveredOrderId||"", deliveredAt:Date.now()});
    // Credit the referrer's wallet DIRECTLY (admin context — rules allow admin to write any loyalty node).
    if(coins>0 && r.owner) await adminCreditLoyalty(r.owner, coins, "ref:"+c+":"+(deliveredOrderId||"d"), "Referral reward");
  }catch(e){}
}
/* Cancel/return reversal: undo a referrer's credit (if it was paid out) and free the code for reuse. */
async function reverseReferralOnCancel(code){
  const c=(code||"").trim();
  if(!FB_OK || !/^\d{6}$/.test(c)) return;
  try{
    const snap=await FB_DB.ref("referrals/"+c).get();
    const r=snap&&snap.val();
    if(r && r.delivered===true && (Number(r.rewardCoins)||0)>0 && r.owner){
      await adminCreditLoyalty(r.owner, -(Number(r.rewardCoins)||0), "refrev:"+c+":"+(r.deliveredOrderId||"d"), "Referral reversed (order cancelled)");
    }
    // Free the code so a fresh referral can be used again — keep owner intact (rules require it).
    await FB_DB.ref("referrals/"+c).update({used:false, claimedBy:"", pendingOrderId:"", delivered:false, rewardCoins:0, deliveredOrderId:"", canceledAt:Date.now()});
  }catch(e){}
}
/* Admin-only: directly credit (or, with a negative value, deduct) a customer's loyalty wallet.
   Runs in the admin context where rules permit writing any user's loyalty node. Idempotent per entryId. */
async function adminCreditLoyalty(uid, pts, entryId, note){
  if(!FB_OK || !uid || !pts) return;
  try{
    await FB_DB.ref("loyalty/"+uid).transaction(cur=>{
      cur = cur || {points:0, history:[]};
      const hist = Array.isArray(cur.history)?cur.history:[];
      if(entryId && hist.some(h=>h&&h.id===entryId)) return; // already applied → abort
      const entry={id:entryId||("adm-"+Date.now()), pts, type: pts>=0?"credit":"reverse", note:note||"", date:new Date().toISOString()};
      return {points: Math.max(0,(cur.points||0)+pts), history:[entry, ...hist].slice(0,80)};
    });
  }catch(e){}
}

/* Auth — Google (Firebase) with demo fallback. User is {name,email,phone,uid,method,loginAt} */
async function loadUser(){ const r=await dbGet("nemo-user"); return r?JSON.parse(r):null; }
async function saveUser(u){ await dbSet("nemo-user",JSON.stringify(u)); }
async function clearUser(){ await dbDel("nemo-user"); if(FB_OK){ try{ await FB_AUTH.signOut(); firebase.auth().signInAnonymously().catch(()=>{}); }catch(e){} } }

/* Track which products a customer has already reviewed (per user) so we don't keep asking */
function reviewedKey(key){ return "nemo-reviewed-"+(key||"anon"); }
function loadReviewedSet(key){ try{ const r=localStorage.getItem(reviewedKey(key)); return r?JSON.parse(r):[]; }catch{ return []; } }
function addReviewedLocal(key,pid){ const s=loadReviewedSet(key); if(!s.includes(pid)){ s.push(pid); try{ localStorage.setItem(reviewedKey(key),JSON.stringify(s)); }catch{} } return s; }

/* Stable per-user key (Google uid, else phone) */
function userKey(u){ return u ? (u.uid || ("ph-"+normalizePhone(u.phone||""))) : null; }

/* Recent searches (local, max 8) + keyword-based related products */
function loadRecentSearches(){ try{ return JSON.parse(localStorage.getItem("nemo-recent-search")||"[]"); }catch{ return []; } }
function addRecentSearch(q){
  q=(q||"").trim(); if(q.length<2) return loadRecentSearches();
  let l=loadRecentSearches().filter(x=>x.toLowerCase()!==q.toLowerCase());
  l.unshift(q); l=l.slice(0,8);
  try{ localStorage.setItem("nemo-recent-search",JSON.stringify(l)); }catch{}
  return l;
}
function clearRecentSearches(){ try{ localStorage.setItem("nemo-recent-search","[]"); }catch{} }
/* Recently viewed products (local, max 12) — product ids, most-recent first. */
function loadRecentlyViewed(){ try{ return JSON.parse(localStorage.getItem("nemo-recent-viewed")||"[]"); }catch{ return []; } }
function pushRecentlyViewed(pid){
  if(!pid) return loadRecentlyViewed();
  let l=loadRecentlyViewed().filter(x=>x!==pid);
  l.unshift(pid); l=l.slice(0,12);
  try{ localStorage.setItem("nemo-recent-viewed",JSON.stringify(l)); }catch{}
  return l;
}
/* Products related to a set of search terms, by keyword match on name/category/desc. */
function relatedProducts(products, terms, excludeId, limit=8){
  const words=[]; (terms||[]).forEach(t=>String(t).toLowerCase().split(/\s+/).forEach(w=>{ if(w.length>=3) words.push(w); }));
  if(!words.length) return [];
  const scored=[];
  products.forEach(p=>{
    if(p.id===excludeId) return;
    const hay=(p.name+" "+p.category+" "+(p.desc||"")).toLowerCase();
    let score=0; words.forEach(w=>{ if(hay.includes(w)) score++; });
    if(score>0) scored.push({p,score});
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit).map(s=>s.p);
}

/* Favorites / Saved items — per user (local cache + cloud sync) */
function favKey(uid){ return "nemo-fav-"+uid; }
function loadFavLocal(uid){ try{ const r=localStorage.getItem(favKey(uid)); return r?JSON.parse(r):[]; }catch{ return []; } }
async function loadFavorites(uid){
  if(FB_OK&&uid){ try{ const s=await withTimeout(FB_DB.ref("favorites/"+uid).get(),5000); if(s){ const v=s.val()||{}; const arr=Object.keys(v).filter(k=>v[k]); localStorage.setItem(favKey(uid),JSON.stringify(arr)); return arr; } }catch(e){} }
  return loadFavLocal(uid);
}
async function setFavoriteRemote(uid,pid,on){
  const arr=loadFavLocal(uid); const next=on?[...new Set([...arr,pid])]:arr.filter(x=>x!==pid);
  try{ localStorage.setItem(favKey(uid),JSON.stringify(next)); }catch{}
  if(FB_OK&&uid){ try{ await FB_DB.ref("favorites/"+uid+"/"+pid).set(on?true:null); }catch(e){} }
  return next;
}

/* "Interested" demand for Coming Soon products — deduped by user in cloud */
function intKey(uid){ return "nemo-int-"+uid; }
function loadIntLocal(uid){ try{ const r=localStorage.getItem(intKey(uid)); return r?JSON.parse(r):[]; }catch{ return []; } }
async function markInterestedRemote(uid,pid){
  const arr=loadIntLocal(uid); if(!arr.includes(pid)){ arr.push(pid); try{ localStorage.setItem(intKey(uid),JSON.stringify(arr)); }catch{} }
  if(FB_OK&&uid){ try{ await FB_DB.ref("interest/"+pid+"/"+uid).set(true); }catch(e){} }
  return arr;
}
async function loadInterestCounts(){
  if(FB_OK){ try{ const s=await withTimeout(FB_DB.ref("interest").get(),5000); if(s){ const v=s.val()||{}; const out={}; Object.keys(v).forEach(pid=>{ out[pid]=Object.keys(v[pid]||{}).length; }); return out; } }catch(e){} }
  return {};
}

/* ── Loyalty points ── */
function loyaltyKey(uid){ return "nemo-lp-"+uid; }
function loadLoyaltyLocal(uid){ try{ const r=localStorage.getItem(loyaltyKey(uid)); return r?JSON.parse(r):{points:0,history:[]}; }catch{ return {points:0,history:[]}; } }
async function loadLoyalty(uid){
  if(FB_OK&&uid){ try{ const s=await withTimeout(FB_DB.ref("loyalty/"+uid).get(),5000); if(s){ const v=s.val(); if(v){ try{localStorage.setItem(loyaltyKey(uid),JSON.stringify(v));}catch(e){} return v; } } }catch(e){} }
  return loadLoyaltyLocal(uid);
}
async function saveLoyalty(uid,data){
  try{localStorage.setItem(loyaltyKey(uid),JSON.stringify(data));}catch(e){}
  if(FB_OK&&uid){ try{ await FB_DB.ref("loyalty/"+uid).set(data); }catch(e){} }
}
/* Daily promo caps — limit how many customers redeem a coupon / referral each day. */
function promoDateKey(){ return new Date().toISOString().slice(0,10); }
async function promoUsageCount(type){
  if(!FB_OK) return 0;
  try{ const s=await withTimeout(FB_DB.ref("promoUsage/"+promoDateKey()+"/"+type).get(),4000); return (s&&Number(s.val()))||0; }catch(e){ return 0; }
}
function bumpPromoUsage(type){
  if(!FB_OK || typeof firebase==="undefined") return;
  try{ FB_DB.ref("promoUsage/"+promoDateKey()+"/"+type).set(firebase.database.ServerValue.increment(1)); }catch(e){}
}
async function promoLimitReached(type, limit){
  const lim=Number(limit||0);
  if(lim<=0) return false;
  return (await promoUsageCount(type))>=lim;
}
function redeemPoints(uid, pts, redemptionId){
  if(!uid||pts<=0)return;
  const cur=loadLoyaltyLocal(uid);
  const next={points:Math.max(0,(cur.points||0)-pts),history:[{id:redemptionId,pts:-pts,type:"redeem",date:new Date().toISOString()},...(cur.history||[]).slice(0,49)]};
  saveLoyalty(uid,next).catch(()=>{});
}

/* ── Unified Wallet ──────────────────────────────────────────────────────────
   The wallet balance IS the loyalty-points ledger, and it lives in ONE place:
   the cloud node `loyalty/<uid>`, keyed to the customer's Firebase (Google) uid.
   • Crediting is admin-only and happens at delivery — order points, referral
     payout and shipping refunds are all written by adminCreditLoyalty().
   • The customer can only READ their balance and SPEND it (redeemPoints), which
     the security rules enforce. The UI subscribes live to this node (see the
     wallet effect in the App component), so every device stays in sync. */

/* ── Customer Tank Showcase ── */
const SHOWCASE_TTL = 24*60*60*1000; // photos auto-expire 24h AFTER admin approval (when expiresAt is set)
function showcaseApproved(x){ return x && x.approved!==false; } // legacy items (no flag) count as approved
function showcaseExpired(x, now){ const exp=Number(x&&x.expiresAt)||0; return exp>0 && now>exp; }
async function loadShowcase(){
  let arr=[];
  if(FB_OK){ try{ const s=await withTimeout(FB_DB.ref("showcase").get(),6000); if(s){ const v=s.val(); if(v) arr=Object.values(v).filter(x=>x&&x.id); } }catch(e){} }
  if(!arr.length){ const r=await dbGet("nemo-showcase"); if(r) arr=JSON.parse(r); }
  const now=Date.now();
  // Best-effort cleanup: delete expired entries from the cloud (rules permit deleting expired ones).
  if(FB_OK){ arr.filter(x=>showcaseExpired(x,now)).forEach(x=>{ try{ FB_DB.ref("showcase/"+x.id).remove(); }catch(e){} }); }
  return arr.filter(x=>!showcaseExpired(x,now)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
}
async function addShowcasePhoto(item){
  await dbSet("nemo-showcase",JSON.stringify([item])); // local
  if(FB_OK){ try{ await FB_DB.ref("showcase/"+item.id).set(item); }catch(e){} }
}
/* Admin approves a pending tank — makes it public and starts its 24h life. */
async function approveShowcasePhoto(item){
  const now=Date.now();
  const updated={...item, approved:true, approvedAt:new Date(now).toISOString(), expiresAt:now+SHOWCASE_TTL};
  if(FB_OK){ try{ await FB_DB.ref("showcase/"+item.id).update({approved:true, approvedAt:updated.approvedAt, expiresAt:updated.expiresAt}); }catch(e){} }
  return updated;
}
async function deleteShowcasePhoto(id){
  if(FB_OK){ try{ await FB_DB.ref("showcase/"+id).remove(); }catch(e){} }
  const r=await dbGet("nemo-showcase"); const arr=r?JSON.parse(r):[]; await dbSet("nemo-showcase",JSON.stringify(arr.filter(x=>x.id!==id)));
}

/* ── Testimonials — any signed-in customer can post one short note; public to all; admin can delete ── */
async function loadTestimonials(){
  let arr=[];
  if(FB_OK){ try{ const s=await withTimeout(FB_DB.ref("testimonials").get(),6000); if(s){ const v=s.val(); if(v) arr=Object.values(v).filter(x=>x&&x.id); } }catch(e){} }
  if(!arr.length){ const r=await dbGet("nemo-testimonials"); if(r) try{ arr=JSON.parse(r); }catch(e){} }
  return arr.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
}
async function addTestimonial(t){
  if(FB_OK){ try{ await FB_DB.ref("testimonials/"+t.id).set(t); }catch(e){} }
  try{ const r=await dbGet("nemo-testimonials"); const arr=r?JSON.parse(r):[]; await dbSet("nemo-testimonials",JSON.stringify([t,...arr].slice(0,60))); }catch(e){}
}
async function deleteTestimonial(id){
  if(FB_OK){ try{ await FB_DB.ref("testimonials/"+id).remove(); }catch(e){} }
  try{ const r=await dbGet("nemo-testimonials"); const arr=r?JSON.parse(r):[]; await dbSet("nemo-testimonials",JSON.stringify(arr.filter(x=>x.id!==id))); }catch(e){}
}

/* ── Visitor analytics (built-in, free — counts unique sessions in Firebase) ── */
async function trackVisit(){
  try{ if(sessionStorage.getItem("nemo-visited")) return; sessionStorage.setItem("nemo-visited","1"); }catch(e){}
  if(!FB_OK || typeof firebase==="undefined") return;
  try{
    const inc=firebase.database.ServerValue.increment(1); // no read needed — safe for anon visitors
    FB_DB.ref("analytics/total").set(inc);
    FB_DB.ref("analytics/daily/"+new Date().toISOString().slice(0,10)).set(inc);
  }catch(e){}
}
async function loadAnalytics(){
  if(!FB_OK) return null;
  try{ const s=await withTimeout(FB_DB.ref("analytics").get(),5000); return (s&&s.exists())?s.val():{total:0,daily:{}}; }catch(e){ return null; }
}
/* Optional Google Analytics 4 — only loads if the admin set a Measurement ID (G-XXXX) in Settings. */
let GA_DONE=false;
function injectGA(gaId){
  if(GA_DONE || !gaId || !/^G-/.test(gaId)) return; GA_DONE=true;
  const s=document.createElement("script"); s.async=true; s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(gaId); document.head.appendChild(s);
  window.dataLayer=window.dataLayer||[]; function gtag(){ window.dataLayer.push(arguments); } window.gtag=gtag; gtag("js",new Date()); gtag("config",gaId);
}

/* ── Restock alerts ── */
async function subscribeRestock(uid, pid){
  if(!FB_OK||!uid) return;
  try{ await FB_DB.ref("restock/"+pid+"/"+uid).set({uid,pid,at:new Date().toISOString()}); }catch(e){}
  const k="nemo-restock"; const r=await dbGet(k); const arr=r?JSON.parse(r):[]; if(!arr.some(x=>x.pid===pid)){arr.push({pid,at:new Date().toISOString()});await dbSet(k,JSON.stringify(arr));}
}
function loadRestockLocal(){ try{const r=localStorage.getItem("nemo-restock");return r?JSON.parse(r):[];}catch{return[];} }

/* ── Push notification helper ── */
function requestNotifPerm(cb){
  if(!("Notification"in window)){cb&&cb(false);return;}
  if(Notification.permission==="granted"){cb&&cb(true);return;}
  Notification.requestPermission().then(p=>cb&&cb(p==="granted"));
}
function sendLocalNotif(title, body, icon="assets/nemo-logo.png"){
  if(!("Notification"in window)||Notification.permission!=="granted")return;
  try{ new Notification(title,{body,icon}); }catch(e){}
}
async function googleSignIn(){
  if(!FB_OK) throw new Error("offline");
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt:"select_account" });
  let res;
  try{
    res=await FB_AUTH.signInWithPopup(provider);
  }catch(e){
    // Popups are often blocked on mobile / in-app browsers — fall back to redirect
    const code=String(e?.code||"");
    if(code.includes("popup-blocked")||code.includes("popup-closed")||code.includes("cancelled-popup")||code.includes("operation-not-supported")){
      await FB_AUTH.signInWithRedirect(provider);
      throw new Error("redirecting"); // page will navigate away
    }
    throw e;
  }
  const u=res.user;
  return { name:u.displayName||"Customer", email:u.email||"", phone:normalizePhone(u.phoneNumber||""), uid:u.uid, photoURL:u.photoURL||"", method:"google", loginAt:new Date().toISOString() };
}
function googleUserFromCred(u){
  return { name:u.displayName||"Customer", email:u.email||"", phone:normalizePhone(u.phoneNumber||""), uid:u.uid, photoURL:u.photoURL||"", method:"google", loginAt:new Date().toISOString() };
}

/* Product requests — customer asks for items not in store */
async function loadRequests(){
  if(FB_OK){ const a=await fbGetColl("requests"); if(a) return a.sort((x,y)=>(y.createdAt||"").localeCompare(x.createdAt||"")); }
  const r=await dbGet("nemo-requests"); return r?JSON.parse(r):[];
}
async function saveRequests(l){ await dbSet("nemo-requests",JSON.stringify(l)); } // local cache only — cloud writes are PER-ID below (a whole-collection .set wiped other customers' requests)
/* Write ONE request to its own node so concurrent customers never overwrite each other. */
async function saveOneRequest(req){
  const r=await dbGet("nemo-requests"); let arr=r?JSON.parse(r):[]; arr=[req,...arr.filter(x=>x.id!==req.id)]; await dbSet("nemo-requests",JSON.stringify(arr));
  if(FB_OK){ try{ await FB_DB.ref("requests/"+req.id).set(req); }catch(e){} }
}
async function deleteOneRequest(id){
  const r=await dbGet("nemo-requests"); const arr=r?JSON.parse(r):[]; await dbSet("nemo-requests",JSON.stringify(arr.filter(x=>x.id!==id)));
  if(FB_OK){ try{ await FB_DB.ref("requests/"+id).remove(); }catch(e){} }
}

/* Care guides / posters — admin-curated fish-care info */
async function loadGuides(){
  if(FB_OK){ const a=await fbGetColl("guides"); if(a&&a.length) return a; }
  const r=await dbGet("nemo-guides"); return r?JSON.parse(r):null;
}
async function saveGuides(l){ await dbSet("nemo-guides",JSON.stringify(l)); if(FB_OK) await fbSetColl("guides",l); }

/* Local-only readers — instant, never wait on the network (used for first paint) */
function localProducts(){ const r=localStorage.getItem("nemo-products"); return r?JSON.parse(r):null; }
function localOrders(){ const r=localStorage.getItem("nemo-orders"); return r?JSON.parse(r):[]; }
function localRequests(){ const r=localStorage.getItem("nemo-requests"); return r?JSON.parse(r):[]; }
function localGuidesData(){ const r=localStorage.getItem("nemo-guides"); return r?JSON.parse(r):null; }
function localSettingsData(){ const r=localStorage.getItem("nemo-settings"); return r?normalizeSettings({...DEFAULT_SETTINGS,...JSON.parse(r)}):{...DEFAULT_SETTINGS}; }
const GUIDE_CATEGORIES = ["Fish Care","Water & Tank","Feeding","Equipment","Plants","Health"];
const DEFAULT_GUIDES = [
  { id:"g1", title:"Betta Fish Care Basics", category:"Fish Care", hasImg:false,
    content:"• Keep one male betta per tank — they're territorial.\n• Minimum 5 litres, ideally 10L+, with a gentle filter.\n• Maintain water at 24–28°C with a heater.\n• Feed 2–3 pellets twice a day; fast one day a week.\n• Change 25% of water weekly. Avoid sudden temperature swings.", createdAt:new Date().toISOString() },
  { id:"g2", title:"Cycling a New Tank", category:"Water & Tank", hasImg:false,
    content:"Before adding fish, cycle your tank for 2–4 weeks:\n1. Set up filter, heater, substrate.\n2. Add a source of ammonia (fish food or pure ammonia).\n3. Test for ammonia, nitrite, nitrate.\n4. Wait until ammonia & nitrite read 0 and nitrate appears.\nThis grows beneficial bacteria that keep fish safe.", createdAt:new Date().toISOString() },
  { id:"g3", title:"How to Operate Your HOB Filter", category:"Equipment", hasImg:false,
    content:"• Rinse the media in old tank water (never tap — chlorine kills bacteria).\n• Fill the chamber with water before powering on to self-prime.\n• Adjust flow so bettas/fancy fish aren't pushed around.\n• Replace mechanical floss monthly; keep the biological media.", createdAt:new Date().toISOString() },
];

/* Simulated demo Google accounts (no real OAuth in a static prototype) */
const DEMO_GOOGLE_ACCOUNTS = [
  { name:"Rahul Mehta",  email:"rahul.mehta@gmail.com",  phone:"9876543210", color:"#ea4335" },
  { name:"Priya Sharma", email:"priya.sharma@gmail.com", phone:"9123456780", color:"#4285f4" },
];

function fileToBase64(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f); }); }
function uid(pfx="p"){ return pfx+Date.now()+Math.random().toString(36).slice(2,5); }
function fmtSize(b){ if(b<1024)return b+"B"; if(b<1048576)return(b/1024).toFixed(0)+"KB"; return(b/1048576).toFixed(1)+"MB"; }
function fmtDate(iso){ return new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }
function orderId(id){ return "#NA-"+id.slice(-6).toUpperCase(); }
function normalizePhone(p){ return (p||"").replace(/\D/g,"").slice(-10); }
function hasPurchased(orders, user, productId){
  if(!user) return false;
  const uk = userKey(user);
  const ph = normalizePhone(user.phone||"");
  const ok = new Set(["Delivered"]); // only a delivered order makes a verified reviewer
  return orders.some(o =>
    ( (uk && o.userUid===uk) || (user.uid && o.userUid===user.uid) || (ph && normalizePhone(o.address?.phone)===ph) )
    && ok.has(o.status)
    && o.items.some(i=>i.id===productId));
}

/* ═══════════════════ WA MESSAGE BUILDERS ═══════════════════ */
function waOrderMsg(order){
  const items = order.items.map(i=>`  • ${i.name} x${i.qty} — ₹${i.price*i.qty}`).join("\n");
  return encodeURIComponent([
    `🐠 *New Order — ${STORE_NAME}* ${orderId(order.id)}`,``,
    `📦 *Items:*`, items, ``,
    `💰 Subtotal: ₹${order.total}`,
    `🚚 Delivery: ${order.fee===0?"Free":"₹"+order.fee}`,
    order.liveGuarantee?`🛡️ Live Arrival Guarantee: ${order.liveGuaranteeFee>0?"₹"+order.liveGuaranteeFee:"Included"}`:"",
    order.couponDiscount?`🎟 Coupon (${order.coupon}): -₹${order.couponDiscount}`:"",
    `💵 *Grand Total: ₹${order.amountDue??(order.total+order.fee)}*`, ``,
    order.txnId?`✅ *Paid via UPI* — Txn: ${order.txnId}`:`⏳ Payment pending`,``,
    `📍 *Ship To:*`,
    `Name: ${order.address.name}`,
    `Phone: ${order.address.phone}`,
    `Address: ${order.address.address}`,
    `City: ${order.address.city} — ${order.address.pincode}`,
    order.address.notes?`Notes: ${order.address.notes}`:"",
    order.summary?`📝 Customer summary: ${order.summary}`:"",``,
    `🕐 Placed: ${fmtDate(order.placedAt)}`,``,
    `Thank you! 🙏`,
  ].filter(l=>l!==undefined).join("\n"));
}

function waStatusMsg(order, status, tracking=""){
  const oid = orderId(order.id);
  const msgs = {
    Confirmed:`✅ *Order Confirmed — ${STORE_NAME}*\n\nHi ${order.address.name}! 👋\nYour order ${oid} has been confirmed.\nWe're packing your goodies carefully 🐠\n\nWe'll update you when it ships!`,
    Shipped:`🚚 *Order Shipped — ${STORE_NAME}*\n\nGreat news ${order.address.name}!\nYour order ${oid} is on its way!\n${order.courierName?`🏷 Courier: ${order.courierName}\n`:""}${tracking?`📦 Consignment: ${tracking}\n`:""}${trackParcelUrl(order)?`🔗 Track here: ${trackParcelUrl(order)}\n`:""}\nExpected delivery in 1–3 days.`,
    Delivered:`🎉 *Order Delivered — ${STORE_NAME}*\n\nHi ${order.address.name}!\nYour order ${oid} has been delivered!\nWe hope your fish and plants are thriving 🌿\n\n⭐ *Please rate your order!*\nOpen the ${STORE_NAME} app → *Orders* tab → tap *Rate* on your products. Your review helps us & fellow fishkeepers. 🙏`,
  };
  return encodeURIComponent(msgs[status]||"");
}

function openWA(number, msg){ window.open(`https://wa.me/${number}?text=${msg}`,"_blank"); }

/* Build a clean, itemized invoice as plain text + the business header fields,
   so the order email effectively carries a full invoice in its body.
   Returns params you can merge into an EmailJS payload. */
function buildInvoiceFields(order, settings){
  const s=settings||{}; const o=order||{}; const addr=o.address||{};
  const gstin=(s.gstin||"").trim();
  const label=gstin?"TAX INVOICE":"INVOICE / BILL OF SUPPLY";
  const invNo=o.orderNo||orderId(o.id||"");
  const dateStr=o.placedAt?new Date(o.placedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"";
  const grand=o.amountDue??((o.total||0)+(o.fee||0));
  const lgFee=o.liveGuaranteeFee||0;
  const couponOff=o.couponDiscount||0;
  const refOff=o.referralDiscount||0;
  const loyaltyOff=o.loyaltyDiscount||0;
  const lines=(o.items||[]).map((i,n)=>`${n+1}. ${i.name}${i.variantLabel?" ("+i.variantLabel+")":""}  x${i.qty}  =  Rs.${i.price*i.qty}`);
  const body=[
    `${label}   ${invNo}`,
    dateStr?`Date: ${dateStr}`:"",
    `------------------------------------------`,
    s.legalName||(STORE_NAME+" Aqua Store"),
    (s.legalAddress||s.storeAddress||s.legalCity||""),
    gstin?`GSTIN: ${gstin}`:"",
    `------------------------------------------`,
    `Ship To: ${addr.name||"-"}, ${addr.phone||""}`,
    `${addr.address||""}, ${addr.city||""} ${addr.pincode||""}`.trim(),
    `------------------------------------------`,
    ...lines,
    `------------------------------------------`,
    `Subtotal: Rs.${o.total||0}`,
    `Shipping: Rs.${o.fee||0}`,
    o.liveGuarantee?`Live Arrival Guarantee: ${lgFee>0?"Rs."+lgFee:"Included"}`:"",
    couponOff>0?`Coupon${o.coupon?" ("+o.coupon+")":""}: -Rs.${couponOff}`:"",
    refOff>0?`Referral discount: -Rs.${refOff}`:"",
    loyaltyOff>0?`Loyalty points: -Rs.${loyaltyOff}`:"",
    `GRAND TOTAL: Rs.${grand}`,
    `------------------------------------------`,
    gstin?"Prices inclusive of GST.":"Not GST-registered — Bill of Supply.",
    `Computer-generated invoice from ${s.legalName||(STORE_NAME+" Aqua Store")}.`,
  ].filter(l=>l!=="").join("\n");
  return {
    invoice_label: label,
    invoice_no: invNo,
    invoice_date: dateStr,
    invoice_business: s.legalName||(STORE_NAME+" Aqua Store"),
    invoice_address: s.legalAddress||s.storeAddress||s.legalCity||"",
    invoice_gstin: gstin,
    order_invoice: body,
  };
}

/* Send an email to the CUSTOMER via EmailJS (needs keys set in admin Settings).
   `event` controls the message: "placed" | "confirmed" | "shipped" | "delivered". */
function sendCustomerEmail(order, settings, event){
  const s=settings||{};
  const to=order.userEmail||"";
  if(!to || !s.emailjsService || !s.emailjsTemplate || !s.emailjsKey) return;
  if(typeof emailjs==="undefined") return;
  // NOTE: status-update emails are governed ONLY by the admin's per-event switches below.
  // (The WhatsApp-updates opt-out applies to WhatsApp, not to transactional order emails.)
  const ev=event||"placed";
  // Respect the admin's per-event email switches (to conserve EmailJS quota)
  const evFlag={placed:"emailPlaced",confirmed:"emailConfirmed",shipped:"emailShipped",delivered:"emailDelivered"}[ev];
  if(evFlag && s[evFlag]===false) return;
  const items=order.items.map(i=>`${i.name}${i.variantLabel?" ("+i.variantLabel+")":""} x${i.qty} - Rs.${i.price*i.qty}`).join("\n");
  const grand=order.amountDue??(order.total+order.fee);
  const addr=order.address||{};
  const subjects={
    placed:`🐠 Order ${order.orderNo||""} received — ${STORE_NAME}`,
    confirmed:`✅ Payment confirmed — Order ${order.orderNo||""} — ${STORE_NAME}`,
    shipped:`🚚 Your order ${order.orderNo||""} has shipped — ${STORE_NAME}`,
    delivered:`🎉 Delivered — Order ${order.orderNo||""} — ${STORE_NAME}`,
  };
  const headlines={
    placed:"Thanks for your order! We've received it and will verify your payment within 1–2 days.",
    confirmed:"Your payment is confirmed and your order is now being prepared. 🐟",
    shipped:`Your order is on the way!${order.trackingNumber?" Tracking: "+order.trackingNumber:""}`,
    delivered:"Your order has been delivered. We hope your aquatic friends settle in happily!",
  };
  const cats=new Set((order.items||[]).map(i=>i.category));
  const careReminder = cats.has("Live Fish")
    ? "💡 Before adding your fish, please read our Care & Acclimatization Guide in the app (Guides tab): float the sealed bag 15–20 min, add a little tank water every 5 min for 20–30 min, then gently net the fish in. Keep lights off for a few hours and wait 24h before the first feeding."
    : cats.has("Plants")
    ? "💡 For your live plants, please read our Care Guide in the app (Guides tab): rinse gently, remove any rockwool/pot, and plant or attach as directed for healthy growth."
    : "💡 New to the hobby? Explore our Care Guides in the app (Guides tab) for easy setup and maintenance tips.";
  const params={
    to_email: to,
    to_name: addr.name || "Customer",
    email_subject: subjects[ev]||subjects.placed,
    email_headline: headlines[ev]||headlines.placed,
    order_no: order.orderNo || order.id,
    order_status: order.status||"",
    order_items: items,
    order_subtotal: "Rs."+order.total,
    order_shipping: "Rs."+(order.fee||0),
    order_total: "Rs."+grand,
    order_total_amount: grand,
    payment_status: order.paymentStatus||"",
    tracking_number: order.trackingNumber||"",
    ship_name: addr.name||"",
    ship_phone: addr.phone||"",
    ship_address: `${addr.address||""}, ${addr.city||""} ${addr.pincode||""}`.trim(),
    care_reminder: careReminder,
    store_name: STORE_NAME,
    store_whatsapp: s.ownerWhatsapp||BUSINESS_WA,
    ...buildInvoiceFields(order, s),
  };
  // Surface failures to the console so the admin can diagnose (EmailJS errors are otherwise silent)
  if(!s.emailjsService || !s.emailjsTemplate || !s.emailjsKey){
    console.warn("[Email] Skipped — EmailJS keys not set in Admin → Settings.");
    return;
  }
  try{
    emailjs.send(s.emailjsService, s.emailjsTemplate, params, {publicKey:s.emailjsKey})
      .then(()=>console.log("[Email] Sent '"+ev+"' to "+to))
      .catch(err=>console.error("[Email] FAILED:", err && (err.text||err.message||err)));
  }catch(e){ console.error("[Email] threw:", e); }
}

/* Email an order copy to the OWNER via EmailJS (reuses the customer template). Fire-and-forget. */
function sendOrderEmail(order, email, settings){
  const s=settings||{};
  if(!email || !s.emailjsService || !s.emailjsTemplate || !s.emailjsKey) return;
  if(typeof emailjs==="undefined") return;
  const items=order.items.map(i=>`${i.name}${i.variantLabel?" ("+i.variantLabel+")":""} x${i.qty} = Rs.${i.price*i.qty}`).join("\n");
  const grand=order.amountDue??(order.total+order.fee);
  const addr=order.address||{};
  const params={
    to_email: email,
    to_name: "Admin",
    email_subject: `🐠 NEW ORDER ${order.orderNo||""} — ${STORE_NAME}`,
    email_headline: `New order from ${addr.name||"a customer"} — please verify payment.`,
    order_no: order.orderNo || order.id,
    order_status: order.status||"",
    order_items: items,
    order_subtotal: "Rs."+order.total,
    order_shipping: "Rs."+(order.fee||0),
    order_total: "Rs."+grand,
    order_total_amount: grand,
    payment_status: order.paymentStatus||order.status||"",
    tracking_number: order.txnId?("Txn: "+order.txnId):"awaiting payment",
    ship_name: addr.name||"",
    ship_phone: addr.phone||"",
    ship_address: `${addr.address||""}, ${addr.city||""} ${addr.pincode||""}`.trim() + (order.shippingZoneLabel?` (${order.shippingZoneLabel})`:""),
    care_reminder: order.summary?("Customer note: "+order.summary):"",
    store_name: STORE_NAME,
    store_whatsapp: s.ownerWhatsapp||BUSINESS_WA,
    ...buildInvoiceFields(order, s),
  };
  try{ emailjs.send(s.emailjsService, s.emailjsTemplate, params, {publicKey:s.emailjsKey}).catch(()=>{}); }catch(e){}
}

/* ── Bill / Invoice generator ──────────────────────────────────────────────
   Returns an HTML string that can be opened in a new tab for printing or sharing. */
/* Email a one-time 6-digit security code to the admin email via EmailJS (reuses the customer template).
   Confirms sensitive changes (WhatsApp / email / admin password). Returns {ok, error}. */
async function sendOtpEmail(email, code, settings){
  const s=settings||{};
  if(!email) return {ok:false, error:"No admin email set in Settings"};
  if(!s.emailjsService || !s.emailjsTemplate || !s.emailjsKey) return {ok:false, error:"EmailJS Service/Template/Key missing in Settings"};
  if(typeof emailjs==="undefined") return {ok:false, error:"EmailJS library not loaded (check your connection)"};
  const params={
    to_email: email,
    to_name: "Admin",
    email_subject: `${STORE_NAME} admin security code: ${code}`,
    email_headline: `Your security code is ${code}`,
    order_no: code,
    order_status: "Security verification",
    order_items: `Your one-time code: ${code}`,
    order_subtotal: "",
    order_shipping: "",
    order_total: "",
    payment_status: "",
    tracking_number: "",
    ship_name: "",
    ship_phone: "",
    ship_address: "",
    care_reminder: "Enter this code in the app to confirm a change to your WhatsApp number, email, or admin password. It expires in 5 minutes. If you did not request this, ignore this email and change your admin password.",
    store_name: STORE_NAME,
    store_whatsapp: s.ownerWhatsapp||BUSINESS_WA,
  };
  try{
    await emailjs.send(s.emailjsService, s.emailjsTemplate, params, {publicKey:s.emailjsKey});
    return {ok:true};
  }catch(e){
    const msg=(e&&(e.text||e.message))||(e&&e.status?("HTTP "+e.status):"unknown error");
    console.error("[OTP Email] FAILED:", e);
    return {ok:false, error:msg};
  }
}
/* Mask an email for display: jo***@gmail.com */
function maskEmail(e){ const p=String(e||"").split("@"); if(p.length<2) return e; const u=p[0]; return (u.length<=2?u[0]+"*":u.slice(0,2)+"***")+"@"+p[1]; }

function generateBillHTML(order, settings){
  const s=settings||{};
  const o=order||{};
  const addr=o.address||{};
  const E=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); // HTML-escape every customer-supplied value (anti-XSS)
  const billingAddr=o.billingAddress||addr;
  const items=(o.items||[]);
  const storeName=E(s.legalName||(STORE_NAME+" Aqua Store"));
  const storeAddr=E(s.legalAddress||s.storeAddress||s.legalCity||"");
  const storeWA=E(s.ownerWhatsapp||BUSINESS_WA);
  const gstin=E((s.gstin||"").trim());
  const docLabel=gstin?"TAX INVOICE":"INVOICE / BILL";
  const dateStr=o.placedAt?new Date(o.placedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  const subtotal=o.total||0;
  const shipping=o.fee||0;
  const lgFee=o.liveGuaranteeFee||0;
  const spFee=o.specialDeliveryFee||0;
  const couponOff=o.couponDiscount||0;
  const grand=o.amountDue??(subtotal+shipping);
  const isPaid=["Verified","Paid"].includes(o.paymentStatus||"");
  const fmt=n=>Number(n||0).toLocaleString("en-IN");

  const trow=(label,val,bold,color)=>`<tr${bold?` style="font-weight:800"`:""}><td colspan="3" style="padding:5px 10px;font-size:13px;color:${color||"#5a8085"};${bold?"font-weight:700":""}">${label}</td><td style="text-align:right;padding:5px 10px;font-size:13px;font-weight:${bold?"800":"600"};color:${color||"#0a2426"}">${val}</td></tr>`;

  const itemRows=items.map((it,i)=>`<tr style="background:${i%2===0?"#fff":"#f5fdfe"}">
    <td style="padding:9px 10px;font-size:13px;color:#0a2426;font-weight:600;border-bottom:1px solid #cce8ea">${i+1}</td>
    <td style="padding:9px 10px;font-size:13px;color:#0a2426;border-bottom:1px solid #cce8ea">${E(it.name)}${it.variantLabel?`<br><span style="font-size:11px;color:#5a8085">${E(it.variantLabel)}</span>`:""}</td>
    <td style="padding:9px 10px;text-align:center;font-size:13px;color:#0a2426;border-bottom:1px solid #cce8ea">${E(it.qty)}</td>
    <td style="padding:9px 10px;text-align:right;font-size:13px;font-weight:700;color:#0b6e72;border-bottom:1px solid #cce8ea">₹${fmt(it.price*it.qty)}</td>
    </tr>`).join("");

  const addrLine=`${E(addr.address||"")}, ${E(addr.city||"")} — ${E(addr.pincode||"")}`;
  const sameAddr=!o.billingAddress||(addr.address===billingAddr.address&&addr.city===billingAddr.city);
  const billAddrLine=`${E(billingAddr.address||"")}, ${E(billingAddr.city||"")} — ${E(billingAddr.pincode||"")}`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Invoice ${E(o.orderNo||orderId(o.id||""))}</title>
<style>*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#eef9fa;margin:0;padding:16px}.page{max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(11,110,114,.15)}.hdr{background:linear-gradient(135deg,#0b6e72,#12b5bc);padding:24px;color:#fff}.hdr h1{margin:0 0 2px;font-size:22px;font-weight:800}.hdr .sub{font-size:12px;opacity:.92;margin-top:2px;color:#ffffff}.badge{display:inline-block;background:rgba(255,255,255,.2);border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;margin-top:8px}.body{padding:20px 22px 28px}.r2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}.box{background:#f5fdfe;border:1px solid #cce8ea;border-radius:12px;padding:12px 14px}.box h4{margin:0 0 6px;font-size:10px;font-weight:800;color:#0b6e72;text-transform:uppercase;letter-spacing:.8px}.box p{margin:0 0 3px;font-size:12.5px;color:#0a2426;font-weight:600;line-height:1.5}.sub{font-size:11px;color:#5a8085;font-weight:400}table{width:100%;border-collapse:collapse}th{background:#0b6e72;color:#fff;padding:9px 10px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.5px}th:last-child{text-align:right}.footer{margin-top:20px;padding-top:14px;border-top:1px dashed #cce8ea;font-size:11.5px;color:#5a8085;text-align:center;line-height:1.8}@media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0}.np{display:none!important}}</style></head>
<body><div class="page">
<div class="hdr">
  <div style="font-size:11px;opacity:.7;letter-spacing:1px">${docLabel}</div>
  <h1>${storeName}</h1>
  ${storeAddr?`<div style="font-size:12px;color:#ffffff;opacity:.95;margin-top:4px">📍 ${storeAddr}</div>`:""}
  <div style="font-size:12px;color:#ffffff;opacity:.95;margin-top:2px">📞 ${storeWA}</div>
  ${gstin?`<div style="font-size:12px;color:#ffffff;opacity:.95;margin-top:2px">GSTIN: ${gstin}</div>`:""}
  <div><span class="badge">${E(o.orderNo||orderId(o.id||""))}</span></div>
  <div style="font-size:11px;opacity:.75;margin-top:6px">📅 ${dateStr}</div>
</div>
<div class="body">
  <div class="r2">
    <div class="box"><h4>📦 Ship To</h4>
      <p>${E(addr.name)||"—"}</p>
      <p class="sub">${E(addr.phone)}</p>
      <p class="sub">${addrLine}</p>
      ${addr.notes?`<p class="sub">Note: ${E(addr.notes)}</p>`:""}
    </div>
    ${!sameAddr?`<div class="box"><h4>🏠 Bill To</h4>
      <p>${E(billingAddr.name)||E(addr.name)||"—"}</p>
      <p class="sub">${billAddrLine}</p>
    </div>`:
    `<div class="box"><h4>📋 Order Info</h4>
      <p>Zone: ${E(o.shippingZoneLabel)||"—"}</p>
      <p class="sub">Status: ${E(o.status)||"—"}</p>
      <p class="sub">Payment: ${isPaid?'<span style="color:#16a34a;font-weight:700">✓ Verified</span>':'<span style="color:#b45309;font-weight:700">⏳ Pending</span>'}</p>
      ${o.txnId?`<p class="sub">Txn: ${E(o.txnId)}</p>`:""}
    </div>`}
  </div>
  <table>
    <thead><tr><th style="width:28px">#</th><th>Item</th><th style="text-align:center;width:40px">Qty</th><th style="text-align:right;width:90px">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
    <tbody>
      ${trow("Subtotal","₹"+fmt(subtotal))}
      ${trow(`Shipping${o.shippingZoneLabel?" ("+E(o.shippingZoneLabel)+")":""}${o.specialDelivery?" + Special":""}`,`₹${fmt(shipping)}`)}
      ${o.liveGuarantee?trow("🛡️ Live Arrival Guarantee",lgFee>0?`₹${fmt(lgFee)}`:"Included"):""}
      ${couponOff>0?trow(`🎟 Coupon${o.coupon?" ("+E(o.coupon)+")":""}`,`-₹${fmt(couponOff)}`,false,"#16a34a"):""}
      <tr style="background:#eef9fa"><td colspan="3" style="padding:10px;font-size:15px;font-weight:800;color:#0b6e72;border-top:2px solid #0b6e72">Grand Total</td><td style="text-align:right;padding:10px;font-size:17px;font-weight:800;color:#0b6e72;border-top:2px solid #0b6e72">₹${fmt(grand)}</td></tr>
    </tbody>
  </table>
  <div style="text-align:right;margin-top:14px"><button class="np" onclick="window.print()" style="background:#0b6e72;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer">🖨 Print / Save PDF</button></div>
  <div class="footer">
    ${o.liveGuarantee?`<p>🛡️ <b>Live Arrival Guarantee</b> applies (included with your Speed Delivery parcel). Send a continuous unboxing video within 2 hours of delivery to WhatsApp ${storeWA} if any fish arrives Dead on Arrival. One approved claim is resolved by replacement, store credit, or refund of the fish amount.</p>`:""}
    <p>${gstin?"Prices are inclusive of GST.":"Prices are inclusive of applicable taxes. Seller is not GST-registered; this is a Bill of Supply."}</p>
    <p>Thank you for shopping at <b>${storeName}</b> 🐠</p>
    <p>Support: WhatsApp ${storeWA}</p>
    <p style="font-size:10px;color:#9bb3b4">This is a computer-generated invoice. Goods sold under our published Terms &amp; Live Arrival Guarantee. Subject to ${E(s.jurisdiction||"India")} jurisdiction.</p>
  </div>
</div></div></body></html>`;
}
/* Open a generated HTML doc in a new tab. Prefer a Blob URL — it loads as a real
   document so the <meta viewport> is honoured and the page fits the phone screen
   (writing into a blank about:blank tab makes mobile browsers use a 980px desktop
   width, so the bill looked tiny on the left). Falls back to document.write. */
function openDocHTML(html){
  try{
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,"_blank");
    if(w){ setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(e){}},120000); return; }
    const w2=window.open("","_blank");
    if(w2){ w2.document.open(); w2.document.write(html); w2.document.close(); return; }
    location.href=url;
  }catch(e){
    try{ const w3=window.open("","_blank"); if(w3){w3.document.open();w3.document.write(html);w3.document.close();} }catch(e2){}
  }
}
function openBill(order,settings){
  openDocHTML(generateBillHTML(order,settings||{}));
}

/* ── Professional invoice (corporate A4 layout, print → PDF) ─────────────────
   The teal "bill" above is a friendly summary for WhatsApp/email; THIS is the
   formal, print-ready document attached/downloaded as a PDF. */
function generateInvoiceHTML(order, settings){
  const s=settings||{}; const o=order||{}; const addr=o.address||{};
  const E=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=n=>Number(n||0).toLocaleString("en-IN");
  const billingAddr=o.billingAddress||addr;
  const items=(o.items||[]);
  const storeName=E(s.legalName||(STORE_NAME+" Aqua Store"));
  const storeEntity=E(s.legalEntity||"");
  const storeAddr=E(s.legalAddress||s.storeAddress||s.legalCity||"");
  const storeWA=E(s.ownerWhatsapp||BUSINESS_WA);
  const storeEmail=E(s.orderEmail||"");
  const gstin=E((s.gstin||"").trim());
  const docLabel=gstin?"TAX INVOICE":"INVOICE";
  const invNo=E(o.orderNo||orderId(o.id||""));
  const dateStr=o.placedAt?new Date(o.placedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";
  const custId=E((o.userPhone||addr.phone||"").toString().slice(-10));
  const subtotal=o.total||0;
  const shipping=o.fee||0;
  // Shipping breakup — new orders carry it; older ones are reconstructed from stored fees.
  const bd=o.shippingBreakup||{courier:Math.max(0,shipping-(o.thermacolFee||0)-(o.specialDeliveryFee||0)),thermacol:o.thermacolFee||0,carton:0,special:o.specialDeliveryFee||0};
  const couponOff=o.couponDiscount||0, refOff=o.referralDiscount||0, loyaltyOff=o.loyaltyDiscount||0;
  const grand=o.amountDue??(subtotal+shipping);
  const isPaid=["Verified","Paid"].includes(o.paymentStatus||"")||["Confirmed","Shipped","Delivered"].includes(o.status||"");
  const sameAddr=!o.billingAddress||(addr.address===billingAddr.address&&addr.city===billingAddr.city);

  // ── GST / tax block (activates the moment a GSTIN is saved in Settings) ──
  const gstinRaw=String(s.gstin||"").trim();
  const hasGst=!!gstinRaw;
  const payLink=String(s.razorpayLink||"").trim();
  const discountTotal=couponOff+refOff+loyaltyOff;
  const fmt2=n=>Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  const money=n=>"₹"+fmt2(n);
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const pan=E(s.pan||(gstinRaw.length>=12?gstinRaw.slice(2,12):""));
  const cin=E(String(s.cin||"").trim());
  const sellerStateCode=gstinRaw.slice(0,2);
  const buyerGstin=E(String(o.buyerGstin||billingAddr.gstin||addr.gstin||"").trim());
  const GST_STATES={"27":"MAHARASHTRA","33":"TAMIL NADU","29":"KARNATAKA","32":"KERALA","36":"TELANGANA","37":"ANDHRA PRADESH","09":"UTTAR PRADESH","07":"DELHI","24":"GUJARAT","19":"WEST BENGAL","06":"HARYANA","03":"PUNJAB","08":"RAJASTHAN","23":"MADHYA PRADESH","10":"BIHAR","21":"ODISHA","34":"PUDUCHERRY","30":"GOA","02":"HIMACHAL PRADESH","05":"UTTARAKHAND","20":"JHARKHAND","22":"CHHATTISGARH","18":"ASSAM"};
  const buyerStateName=String(o.placeOfSupplyName||addr.state||billingAddr.state||"").toUpperCase();
  const buyerStateCode=String(o.placeOfSupplyCode||billingAddr.stateCode||addr.stateCode||"")||(Object.keys(GST_STATES).find(k=>GST_STATES[k]===buyerStateName)||"");
  const interState=!!(sellerStateCode&&buyerStateCode&&sellerStateCode!==buyerStateCode);
  const placeOfSupply=buyerStateName?`${E(buyerStateName)}${buyerStateCode?` (${buyerStateCode})`:""}`:(sellerStateCode&&GST_STATES[sellerStateCode]?`${GST_STATES[sellerStateCode]} (${sellerStateCode})`:E(s.legalCity||"—"));
  const defRate=Number(s.gstRate!=null?s.gstRate:18);
  const defHsn=E(String(s.hsnCode||"").trim());
  let taxableSum=0,cgstSum=0,sgstSum=0,igstSum=0;
  const gstRows=items.map((it,i)=>{
    const gross=Number(it.price||0)*Number(it.qty||0);
    const rate=Number(it.gstRate!=null?it.gstRate:defRate);
    const taxable=round2(gross/(1+rate/100)); const tax=round2(gross-taxable);
    taxableSum+=taxable;
    if(interState){ igstSum+=tax; } else { const c=round2(tax/2); cgstSum+=c; sgstSum+=round2(tax-c); }
    const hsn=E(String(it.hsn||defHsn||""));
    return `<tr><td class="c">${i+1}</td><td>${E(it.name)}${it.variantLabel?`<div class="muted">${E(it.variantLabel)}</div>`:""}</td><td class="c">${hsn||"—"}</td><td class="c">${E(it.qty)}</td><td class="r">${money(taxable)}</td><td class="c">${rate}%</td><td class="r">${money(tax)}</td><td class="r">${money(gross)}</td></tr>`;
  }).join("");
  if(shipping>0){ const st=round2(shipping/(1+defRate/100)); const stx=round2(shipping-st); taxableSum+=st; if(interState){ igstSum+=stx; } else { const c=round2(stx/2); cgstSum+=c; sgstSum+=round2(stx-c); } }
  taxableSum=round2(taxableSum); cgstSum=round2(cgstSum); sgstSum=round2(sgstSum); igstSum=round2(igstSum);
  const taxTotal=round2(cgstSum+sgstSum+igstSum);
  const roundOff=round2(grand-round2(taxableSum+taxTotal-discountTotal));
  const taxSummaryHtml=`<table class="taxsum"><tr><td class="k">Taxable Amount</td><td class="v">${money(taxableSum)}</td></tr>${interState?`<tr><td class="k">IGST</td><td class="v">${money(igstSum)}</td></tr>`:`<tr><td class="k">CGST</td><td class="v">${money(cgstSum)}</td></tr><tr><td class="k">SGST</td><td class="v">${money(sgstSum)}</td></tr>`}${discountTotal>0?`<tr><td class="k">Discount</td><td class="v">-${money(discountTotal)}</td></tr>`:""}${Math.abs(roundOff)>=0.01?`<tr><td class="k">Round Off</td><td class="v">${roundOff<0?"-":""}${money(Math.abs(roundOff))}</td></tr>`:""}<tr class="g"><td class="k">Total Invoice Amount</td><td class="v">₹${fmt(grand)}</td></tr></table>`;

  const itemRows=items.map((it,i)=>`<tr>
    <td class="c">${i+1}</td>
    <td>${E(it.name)}${it.variantLabel?`<div class="muted">${E(it.variantLabel)}</div>`:""}</td>
    <td class="c">${E(it.qty)}</td>
    <td class="r">₹${fmt(it.price)}</td>
    <td class="r">₹${fmt(it.price*it.qty)}</td>
  </tr>`).join("");
  const totRow=(label,val,opts={})=>`<tr${opts.grand?' class="grand"':""}><td colspan="3"></td><td class="r lbl${opts.neg?' neg':''}">${label}</td><td class="r val${opts.neg?' neg':''}">${val}</td></tr>`;
  const addrBlock=(a)=>`${E(a.name)||"—"}<div class="muted">${E(a.address||"")}</div><div class="muted">${E(a.city||"")} — ${E(a.pincode||"")}</div>${a.phone?`<div class="muted">☎ ${E(a.phone)}</div>`:""}`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Invoice ${invNo}</title>
<style>
*{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;background:#e9edf3;margin:0;padding:20px;color:#1f2733}
.page{max-width:780px;margin:0 auto;background:#fff;padding:42px 44px 36px;box-shadow:0 8px 32px rgba(31,56,100,.14)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.co h2{margin:0 0 4px;font-size:18px;font-weight:800;color:#1f3864}
.co p{margin:0;font-size:11.5px;line-height:1.6;color:#566}
.title{text-align:right}
.title .big{font-size:40px;font-weight:800;color:#2f4b7c;letter-spacing:1px;line-height:1}
.meta{margin-top:12px;border-collapse:collapse;margin-left:auto}
.meta td{font-size:11.5px;padding:3px 0 3px 14px;color:#566;text-align:right}
.meta td.k{font-weight:700;color:#1f2733}
.bar{height:3px;background:#2f4b7c;margin:22px 0 0}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:22px}
.parties .h{background:#2f4b7c;color:#fff;font-size:11px;font-weight:700;letter-spacing:.6px;padding:6px 12px}
.parties .b{font-size:12.5px;font-weight:700;color:#1f2733;padding:11px 12px;line-height:1.5}
.parties .col:first-child .b{border-right:1px solid #e3e8ef}
.muted{font-size:11px;color:#7a8694;font-weight:400;margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin-top:22px}
table.items thead th{background:#2f4b7c;color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:9px 10px;text-align:left}
table.items thead th.c{text-align:center}table.items thead th.r{text-align:right}
table.items tbody td{padding:9px 10px;font-size:12.5px;border-bottom:1px solid #e3e8ef;color:#1f2733}
table.items tbody td.c{text-align:center}table.items tbody td.r{text-align:right}
table.items tbody tr:nth-child(even){background:#f6f8fb}
.tot td{padding:5px 10px;font-size:12.5px}
.tot .lbl{color:#566;font-weight:600;width:150px}
.tot .val{color:#1f2733;font-weight:700;width:110px}
.tot .neg{color:#16834a}
.tot .grand .lbl,.tot .grand .val{font-size:15px;font-weight:800;color:#1f3864;border-top:2px solid #2f4b7c;padding-top:8px}
.note{margin-top:6px}
.pay{display:inline-block;margin-top:14px;font-size:12px;font-weight:800;padding:5px 14px;border-radius:4px;border:1.5px solid ${''}}
.paid{color:#16834a;border-color:#16834a}.due{color:#b45309;border-color:#b45309}
.foot{margin-top:26px;border-top:1px solid #e3e8ef;padding-top:14px;font-size:11px;color:#7a8694;line-height:1.7}
.foot b{color:#1f2733}
.thanks{text-align:center;font-size:14px;font-weight:800;color:#2f4b7c;margin-top:18px}
.tablewrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
table.items.gst thead th{padding:7px 7px;font-size:10px}
table.items.gst tbody td{padding:7px 7px;font-size:11px}
.taxsum{margin-top:10px;margin-left:auto;border-collapse:collapse;min-width:270px}
.taxsum td{padding:4px 10px;font-size:12px}
.taxsum td.k{color:#566;font-weight:600}.taxsum td.v{text-align:right;font-weight:700;color:#1f2733;min-width:110px}
.taxsum tr.g td{font-size:14px;font-weight:800;color:#1f3864;border-top:2px solid #2f4b7c;padding-top:8px}
.payrow{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:16px}
.sign{font-size:12px;color:#1f2733;text-align:center}.sign .sgap{height:44px}
.paybox{margin-top:18px;text-align:center}
.paybox a{display:inline-block;background:#16834a;color:#fff;text-decoration:none;border-radius:6px;padding:11px 26px;font-size:13px;font-weight:800}
@media(max-width:640px){.page{padding:22px 16px 26px}.title .big{font-size:30px}.co h2{font-size:16px}.parties{grid-template-columns:1fr}.parties .col:first-child .b{border-right:none;border-bottom:1px solid #e3e8ef}.payrow{flex-direction:column;align-items:stretch;gap:16px}.sign{text-align:left}}
@media print{body{background:#fff;padding:0}.page{box-shadow:none}.np{display:none!important}}
</style></head>
<body><div class="page">
  <div class="top">
    <div class="co">
      <h2>${storeName}</h2>
      <p>${storeEntity?E(storeEntity)+"<br>":""}${storeAddr?storeAddr+"<br>":""}${storeWA?"☎ "+storeWA+"<br>":""}${storeEmail?storeEmail+"<br>":""}${gstin?"GSTIN: "+gstin+"<br>":""}${hasGst&&pan?"PAN: "+pan+"<br>":""}${hasGst&&cin?"CIN: "+cin:""}</p>
    </div>
    <div class="title">
      <div class="big">${docLabel}</div>
      <table class="meta">
        <tr><td class="k">DATE</td><td>${dateStr}</td></tr>
        <tr><td class="k">INVOICE #</td><td>${invNo}</td></tr>
        ${custId?`<tr><td class="k">CUSTOMER ID</td><td>${custId}</td></tr>`:""}
        <tr><td class="k">STATUS</td><td>${E(o.status||"—")}</td></tr>
        ${hasGst?`<tr><td class="k">PLACE OF SUPPLY</td><td>${placeOfSupply}</td></tr><tr><td class="k">REVERSE CHARGE</td><td>No</td></tr>`:""}
        ${o.txnId?`<tr><td class="k">PAYMENT REF</td><td>${E(o.txnId)}</td></tr>`:""}
      </table>
    </div>
  </div>
  <div class="bar"></div>
  <div class="parties">
    <div class="col"><div class="h">BILL TO</div><div class="b">${addrBlock(billingAddr)}${buyerGstin?`<div class="muted">GSTIN: ${buyerGstin}</div>`:""}</div></div>
    <div class="col"><div class="h">SHIP TO</div><div class="b">${addrBlock(addr)}${o.shippingZoneLabel?`<div class="muted">Zone: ${E(o.shippingZoneLabel)}</div>`:""}</div></div>
  </div>
  ${hasGst?`<div class="tablewrap"><table class="items gst">
    <thead><tr><th class="c" style="width:24px">#</th><th>Description</th><th class="c">HSN/SAC</th><th class="c">Qty</th><th class="r">Taxable</th><th class="c">GST</th><th class="r">Tax</th><th class="r">Total</th></tr></thead>
    <tbody>${gstRows}</tbody>
  </table></div>`:`<div class="tablewrap"><table class="items">
    <thead><tr><th class="c" style="width:34px">#</th><th>Description</th><th class="c" style="width:50px">Qty</th><th class="r" style="width:90px">Unit Price</th><th class="r" style="width:100px">Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table></div>`}
  <table class="tot" style="width:100%;border-collapse:collapse;margin-top:6px">
    ${totRow("Subtotal","₹"+fmt(subtotal))}
    ${bd.courier>0?totRow(`Shipping${o.shippingZoneLabel?" ("+E(o.shippingZoneLabel)+")":""}`,"₹"+fmt(bd.courier)):""}
    ${bd.special>0?totRow("Speed Courier extra","₹"+fmt(bd.special)):""}
    ${bd.thermacol>0?totRow("Thermacol packaging","₹"+fmt(bd.thermacol)):""}
    ${bd.carton>0?totRow("Carton packaging","₹"+fmt(bd.carton)):""}
    ${(bd.courier+bd.special+bd.thermacol+bd.carton)===0&&shipping===0?totRow("Shipping","Free"):""}
    ${o.liveGuarantee?totRow("Live Arrival Guarantee","Included"):""}
    ${couponOff>0?totRow(`Coupon${o.coupon?" ("+E(o.coupon)+")":""}`,"-₹"+fmt(couponOff),{neg:true}):""}
    ${refOff>0?totRow("Referral discount","-₹"+fmt(refOff),{neg:true}):""}
    ${loyaltyOff>0?totRow("Wallet / loyalty","-₹"+fmt(loyaltyOff),{neg:true}):""}
    ${totRow("TOTAL","₹"+fmt(grand),{grand:true})}
  </table>
  ${hasGst?taxSummaryHtml:""}
  ${(!isPaid&&payLink)?`<div class="np paybox"><a href="${E(payLink)}" target="_blank" rel="noopener">💳 Pay ₹${fmt(grand)} securely online →</a></div>`:""}
  <div class="payrow">
    <div class="note"><span class="pay ${isPaid?"paid":"due"}">${isPaid?"PAID":"PAYMENT DUE"}</span>${o.txnId?` <span style="font-size:11px;color:#7a8694">Txn/Ref: ${E(o.txnId)}</span>`:""}</div>
    <div class="sign">For <b>${storeName}</b><div class="sgap"></div>Authorised Signatory</div>
  </div>
  <div class="thanks">Thank you for your business! 🐠</div>
  <div class="foot">
    <p>${hasGst?"All amounts are in INR and inclusive of GST. Tax is payable on reverse charge basis: No.":"Prices are inclusive of applicable taxes. Seller is not GST-registered; this document is issued as a Bill of Supply."}</p>
    ${hasGst?`<p>We certify that our registration under the Goods and Services Tax Act, 2017 is in force and that this tax invoice reflects the goods actually supplied. ${pan?"PAN: "+pan+". ":""}GSTIN: ${gstin}.</p>`:""}
    ${o.liveGuarantee?`<p><b>Live Arrival Guarantee</b> applies to this order. Report any Dead-on-Arrival with a continuous unboxing video on WhatsApp ${storeWA} within 2 hours of delivery.</p>`:""}
    <p>For any questions about this invoice, contact <b>${storeName}</b> on WhatsApp ${storeWA}${storeEmail?` or ${storeEmail}`:""}.</p>
    <p style="font-size:10px">This is a computer-generated invoice. E. &amp; O.E. Subject to ${E(s.jurisdiction||"India")} jurisdiction.</p>
  </div>
  <div class="np" style="text-align:right;margin-top:18px"><button onclick="window.print()" style="background:#2f4b7c;color:#fff;border:none;border-radius:6px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF</button></div>
</div></body></html>`;
}
function openInvoice(order,settings){
  openDocHTML(generateInvoiceHTML(order,settings||{}));
}
async function shareProduct(p, showToast){
  const url=(typeof location!=="undefined")?(location.origin+location.pathname+"?p="+encodeURIComponent(p.id)):"";
  const price=effectivePrice(p);
  const text=`🐠 ${p.name} — ₹${price} at ${STORE_NAME} Aqua Store\n${p.desc?p.desc.slice(0,90)+"… ":""}${url}`;
  try{
    if(navigator.share){ await navigator.share({title:`${p.name} · ${STORE_NAME}`, text, url}); return; }
  }catch(e){ if(String(e).includes("AbortError"))return; }
  try{ await navigator.clipboard.writeText(text); showToast&&showToast("Link copied — paste to share!"); }
  catch(e){ window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank"); }
}

/* Month key + previous-month range — used by the monthly "download your report" reminder. */
function monthKey(d=new Date()){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function prevMonthRange(){ const now=new Date(); const first=new Date(now.getFullYear(),now.getMonth()-1,1); const last=new Date(now.getFullYear(),now.getMonth(),0); const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; return {from:iso(first),to:iso(last),label:first.toLocaleString("en-IN",{month:"long",year:"numeric"})}; }
/* Export orders to a CSV file (opens in Excel/Sheets). Optional [from,to] ISO-date range (inclusive). */
function exportOrdersCSV(orders, from="", to="", settings={}, walletBalances={}){
  const esc=v=>{ const s=String(v==null?"":v).replace(/"/g,'""'); return `"${s}"`; };
  let list=[...orders];
  if(from){ const f=new Date(from+"T00:00:00").getTime(); list=list.filter(o=>new Date(o.placedAt).getTime()>=f); }
  if(to){ const t=new Date(to+"T23:59:59").getTime(); list=list.filter(o=>new Date(o.placedAt).getTime()<=t); }
  list.sort((a,b)=>(b.placedAt||"").localeCompare(a.placedAt||""));
  const head=["Order ID","Date","Status","Payment Status","Txn / Ref ID","Paid At","Amount (Rs.)","Customer","Phone","WhatsApp","Email","Address","City","Pincode","Zone","Items","Subtotal","Shipping","Courier (Rs.)","Speed Courier Extra (Rs.)","Thermacol Packing (Rs.)","Carton Packing (Rs.)","Speed Delivery","Live Guarantee","Suggested Packing","Opted Packing","Courier Partner","Consignment","ETA (days)","Shipping Refund -> Wallet (Rs.)","Coupon","Coupon Discount","Referral Code","Referral Discount (Rs.)","Wallet Used (Rs.)","Wallet Coins Used","Wallet Coins Earned","Customer Wallet Balance (coins)","Grand Total","DOA Status","Order Closed","Customer Summary","WhatsApp Updates","Customer ID"];
  const pph=Number(settings?.loyaltyPointsPerHundred||10);
  const rupeePerPoint=Number(settings?.loyaltyRedeemValue||1);
  const rows=list.map(o=>{
    const items=o.items.map(i=>`${i.name}${i.variantLabel?" ("+i.variantLabel+")":""} x${i.qty} = Rs.${i.price*i.qty}`).join(" | ");
    const grand=o.amountDue??(o.total+o.fee);
    const loyaltyUsed=Number(o.loyaltyDiscount||0);
    const ptsRedeemed=loyaltyUsed>0?Math.round(loyaltyUsed/(rupeePerPoint||1)):0;
    const ptsEarned=settings?.loyaltyEnabled?Math.floor((grand/100)*pph):0;
    const wBal=walletBalances[o.userUid]!=null?walletBalances[o.userUid]:"";
    const bd=o.shippingBreakup||{courier:Math.max(0,(o.fee||0)-(o.thermacolFee||0)-(o.specialDeliveryFee||0)),thermacol:o.thermacolFee||0,carton:0,special:o.specialDeliveryFee||0};
    return [orderId(o.id),fmtDate(o.placedAt),o.status,o.paymentStatus||"",o.txnId||"",o.paidAt?fmtDate(o.paidAt):"",grand,o.address?.name,o.address?.phone,o.address?.whatsapp||o.address?.phone,o.userEmail||"",o.address?.address,o.address?.city,o.address?.pincode,o.shippingZoneLabel||"",items,o.total,o.fee,bd.courier||0,bd.special||0,bd.thermacol||0,bd.carton||0,o.specialDelivery?"Yes":"",o.liveGuaranteeFee||0,o.suggestedPackingLabel||"",o.packingLabel||"",o.courierName||"",o.trackingNumber||"",(o.etaDays===""||o.etaDays==null)?"":o.etaDays,o.shippingReward?.amount||"",o.coupon||"",o.couponDiscount||0,o.referralCode||"",o.referralDiscount||0,loyaltyUsed,ptsRedeemed,ptsEarned,wBal,grand,o.doa?.status||"",o.closed?"Yes":"",o.summary||"",o.waUpdates===false?"No":"Yes",o.userUid||""].map(esc).join(",");
  });
  const csv="\uFEFF"+[head.map(esc).join(","),...rows].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  const tag=(from||to)?`${from||"start"}_to_${to||"now"}`:new Date().toISOString().slice(0,10);
  a.href=url; a.download=`nemo-orders-${tag}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return list.length;
}

/* Download a COMPLETE copy of the store as one JSON file (admin only — includes orders).
   Mirrors the Firebase structure so it can be re-imported via Firebase Console → Import JSON. */
async function downloadFullBackup(){
  const out={};
  const nodes=["products","guides","settings","showcase","reviews","media","orders","requests"];
  if(FB_OK){
    for(const n of nodes){
      try{ const s=await FB_DB.ref(n).get(); if(s&&s.exists()) out[n]=s.val(); }catch(e){ /* unreadable node — skip */ }
    }
  }
  const payload={ _backup:{ store:STORE_NAME, exportedAt:new Date().toISOString(), version:1 }, ...out };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`nemo-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return Object.keys(out);
}

/* ═══════════════════ GLOBAL STYLES ═══════════════════ */
const STYLES = `
/* @import temporarily disabled for sandbox testing — re-enabled before delivery */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;}
.nemo-app{height:100vh;}@supports(height:100dvh){.nemo-app{height:100dvh;}}
::-webkit-scrollbar{display:none;}
*{-ms-overflow-style:none;scrollbar-width:none;}
input,textarea,select{font-family:'Nunito',sans-serif;color:#0a2426;}
.press{transition:transform .12s,opacity .12s;cursor:pointer;}
.press:active{transform:scale(.95);opacity:.85;}
.lift{transition:transform .2s,box-shadow .2s;}
.lift:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(11,110,114,.18);}
@keyframes slideUp{from{transform:translateY(22px);opacity:0}to{transform:none;opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}75%{transform:translateX(9px)}}
@keyframes toastIn{from{transform:translateY(-16px) translateX(-50%);opacity:0}to{transform:translateY(0) translateX(-50%);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes checkPop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}
.slide-up{animation:slideUp .3s cubic-bezier(.22,1,.36,1) both;}
.fade-in{animation:fadeIn .22s ease both;}
.shake{animation:shake .38s ease;}
.stars{color:#f59e0b;}
.stars-dim{color:#d1d5db;}
@keyframes bettaSwim{0%,100%{transform:translateX(0) rotate(-2deg)}50%{transform:translateX(4px) rotate(2deg)}}
@keyframes bettaTail{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes bettaFinTop{0%,100%{transform:rotate(-6deg) scale(1)}50%{transform:rotate(6deg) scale(1.05)}}
@keyframes bettaFinBot{0%,100%{transform:rotate(6deg) scale(1)}50%{transform:rotate(-6deg) scale(1.05)}}
@keyframes bubbleUp{0%{transform:translate(0,0);opacity:0}20%{opacity:.9}100%{transform:translate(8px,-32px);opacity:0}}
@keyframes bubbleUp2{0%{transform:translate(0,0);opacity:0}30%{opacity:.7}100%{transform:translate(-6px,-40px);opacity:0}}
.betta-fish{animation:bettaSwim 2.6s ease-in-out infinite;transform-origin:center;}
.betta-tail{animation:bettaTail 1.4s ease-in-out infinite;transform-origin:right center;transform-box:fill-box;}
.betta-fin-top{animation:bettaFinTop 1.6s ease-in-out infinite;transform-origin:center 80%;transform-box:fill-box;}
.betta-fin-bot{animation:bettaFinBot 1.6s ease-in-out infinite;transform-origin:center 20%;transform-box:fill-box;}
.bub-1{animation:bubbleUp 2.4s ease-out infinite;}
.bub-2{animation:bubbleUp2 2.8s ease-out .4s infinite;}
.bub-3{animation:bubbleUp 3.2s ease-out .8s infinite;}
@keyframes countdownPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.countdown-cell{animation:countdownPulse 1.8s ease-in-out infinite;}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
.shimmer-bar{background:linear-gradient(90deg,#e2e8f0 0px,#f8fafc 40px,#e2e8f0 80px);background-size:200px 100%;animation:shimmer 1.4s infinite linear;}
@keyframes festivalPulse{0%,100%{opacity:1}50%{opacity:.8}}
.festival-pulse{animation:festivalPulse 2.2s ease-in-out infinite;}
@keyframes pointsPop{0%{transform:scale(0.8) translateY(4px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
.points-pop{animation:pointsPop .35s cubic-bezier(.22,1,.36,1) both;}
@keyframes showcaseSlide{from{transform:translateX(18px);opacity:0}to{transform:none;opacity:1}}
.showcase-slide{animation:showcaseSlide .3s ease both;}
/* Gentle fade + rise — for promo banners and content that appears after data loads */
@keyframes fadeRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fade-rise{animation:fadeRise .4s cubic-bezier(.22,1,.36,1) both;}
/* Images fade in once decoded instead of snapping in (set data-loaded after onLoad) */
img.smooth-img{opacity:0;transition:opacity .35s ease;}
img.smooth-img[data-loaded="1"]{opacity:1;}
/* Respect users who prefer less motion — disable decorative loops & transitions */
@media(prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;}
}
/* ── Desktop layout (≥1000px) ── */
.desk-nav{display:none;}
/* Header top padding adapts to device safe-area instead of a flat notch inset */
.vh-head{padding-top:calc(env(safe-area-inset-top, 0px) + 14px) !important;}
/* Left filter drawer */
@keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}
.drawer-panel{animation:slideInLeft .22s cubic-bezier(.22,1,.36,1) both;}
@media(min-width:1000px){
  /* Surround matches the app background exactly, so the centred column blends into the page
     (no visible frame / dark band, regardless of window width) */
  #root{background:#eef9fa !important;}
  .nemo-app{max-width:min(1180px,100%) !important;min-height:100vh;box-shadow:none;}
  .desk-nav{display:flex;}
  .mobile-bottom-nav{display:none !important;}
  .prod-grid{grid-template-columns:repeat(3,1fr) !important;}
  .vh-head{padding-top:18px !important;}
  /* The brand wordmark already lives in the top title bar — don't repeat the big logo banner.
     The desktop top-nav also carries account + cart, so hide the in-hero chrome and keep a slim banner. */
  .home-hero-logo{display:none !important;}
  .home-hero-chrome{display:none !important;}
  .home-hero{padding:34px 40px 30px !important;}
  .home-search{max-width:620px;margin-left:auto !important;margin-right:auto !important;}
  .home-body{padding-left:40px !important;padding-right:40px !important;}
  .sheet-overlay{align-items:center !important;padding:24px !important;}
  .sheet-panel{border-radius:20px !important;max-width:460px !important;}
  /* Keep single-column reading/forms comfortable inside the wide shell */
  .dt-read{max-width:780px;margin-left:auto !important;margin-right:auto !important;}
}
/* Tablet / small desktop: a comfortable column instead of a tiny phone strip lost in space */
@media(min-width:560px) and (max-width:999px){
  .nemo-app{max-width:640px !important;box-shadow:0 0 0 1px rgba(11,110,114,.08);}
}
/* Large desktop: more breathing room + a denser product grid that fills the width */
@media(min-width:1340px){
  .nemo-app{max-width:min(1320px,100%) !important;}
  .prod-grid{grid-template-columns:repeat(4,1fr) !important;}
}
.home-footer{display:none;}
@media(min-width:1000px){ .home-footer{display:block;} }
.desk-link:hover{background:#eef9fa !important;}
`;

/* ═══════════════════ TINY COMPONENTS ═══════════════════ */
/* Renders children as a direct child of <body> so fixed-position overlays
   escape any ancestor with a transform (e.g. the .slide-up entrance animation,
   whose held identity matrix would otherwise trap position:fixed). */
function Portal({children}){
  const elRef = useRef(null);
  if(!elRef.current && typeof document!=="undefined"){ elRef.current=document.createElement("div"); }
  useEffect(()=>{
    const el=elRef.current; if(!el) return;
    document.body.appendChild(el);
    return ()=>{ try{document.body.removeChild(el);}catch(e){} };
  },[]);
  if(!elRef.current) return null;
  return ReactDOM.createPortal(children, elRef.current);
}
/* Image that fades in once decoded (no abrupt pop). Falls back instantly for cached/data-URI images. */
function SmoothImg({src,alt,style,className}){
  const onReady=(el)=>{ if(el){ if(el.complete && el.naturalWidth>0) el.setAttribute("data-loaded","1"); } };
  return (
    <img src={src} alt={alt||""} ref={onReady}
      className={"smooth-img"+(className?(" "+className):"")} style={style}
      onLoad={e=>e.currentTarget.setAttribute("data-loaded","1")}
      onError={e=>e.currentTarget.setAttribute("data-loaded","1")}/>
  );
}
function Toast({msg,type,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t);},[]);
  const ok=type==="success";
  return(
    <div style={{position:"fixed",top:16,left:"50%",background:ok?C.success:C.danger,color:"white",
      borderRadius:14,padding:"11px 20px",fontSize:13,fontWeight:700,zIndex:9999,
      fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",gap:8,
      boxShadow:"0 4px 20px rgba(0,0,0,.25)",whiteSpace:"nowrap",
      animation:"toastIn .3s ease both"}}>
      {ok?"✓":"✕"} {msg}
    </div>
  );
}
function Spinner(){
  return <div style={{width:20,height:20,border:`3px solid ${C.border}`,borderTopColor:C.primary,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;
}
/* ═══════════════════ ANIMATED BETTA LOGO ═══════════════════ */
function BettaLogo({size=64, glow=true}){
  return(
    <svg viewBox="0 0 100 100" width={size} height={size} style={{overflow:"visible",filter:glow?"drop-shadow(0 4px 14px rgba(255,90,64,.45))":"none"}}>
      <defs>
        <radialGradient id="bettaBody" cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffb199"/>
          <stop offset="45%" stopColor="#ff5a40"/>
          <stop offset="100%" stopColor="#a82310"/>
        </radialGradient>
        <linearGradient id="bettaFin" x1="0" x2="1">
          <stop offset="0%" stopColor="#ff5a40" stopOpacity=".95"/>
          <stop offset="100%" stopColor="#7a1a08" stopOpacity=".75"/>
        </linearGradient>
        <linearGradient id="bettaTailG" x1="0" x2="1">
          <stop offset="0%" stopColor="#ff7a40" stopOpacity=".9"/>
          <stop offset="100%" stopColor="#5a0a02" stopOpacity=".6"/>
        </linearGradient>
      </defs>
      <circle cx="78" cy="60" r="2.4" fill="#fff" className="bub-1"/>
      <circle cx="82" cy="68" r="1.6" fill="#fff" className="bub-2"/>
      <circle cx="76" cy="72" r="1.2" fill="#fff" className="bub-3"/>
      <g className="betta-fish">
        <g className="betta-tail">
          <path d="M62 50 Q86 28 92 38 Q88 50 92 62 Q86 72 62 50 Z" fill="url(#bettaTailG)"/>
          <path d="M64 50 Q82 40 88 46 M64 50 Q82 60 88 54" stroke="#fff" strokeOpacity=".25" strokeWidth=".8" fill="none"/>
        </g>
        <ellipse cx="42" cy="50" rx="24" ry="14" fill="url(#bettaBody)"/>
        <path className="betta-fin-top" d="M30 38 Q40 22 56 36 Q50 40 42 39 Q35 39 30 38 Z" fill="url(#bettaFin)"/>
        <path className="betta-fin-bot" d="M30 62 Q40 78 56 64 Q50 60 42 61 Q35 61 30 62 Z" fill="url(#bettaFin)"/>
        <circle cx="26" cy="47" r="3.2" fill="#fff"/>
        <circle cx="25" cy="47" r="1.8" fill="#0a1a2a"/>
        <circle cx="24.3" cy="46.3" r=".7" fill="#fff"/>
        <path d="M34 45 Q32 50 34 55" stroke="#a82310" strokeWidth="1.2" fill="none" opacity=".6"/>
        <ellipse cx="40" cy="44" rx="8" ry="3" fill="#fff" opacity=".25"/>
      </g>
    </svg>
  );
}

/* ═══════════════════ MINI COUNTDOWN (product cards + detail) ═══════════════════ */
function MiniCountdown({endsAt,compact=false}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    const end=new Date(endsAt).getTime();
    if(end<=Date.now())return;
    const t=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(t);
  },[endsAt]);
  const ms=Math.max(0,new Date(endsAt).getTime()-now);
  if(ms<=0)return null;
  const h=Math.floor(ms/3600000);
  const m=Math.floor((ms%3600000)/60000);
  const s=Math.floor((ms%60000)/1000);
  const fmt=n=>String(n).padStart(2,"0");
  if(compact)return(
    <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"3px 7px",marginTop:4}}>
      <span style={{fontSize:9,color:"#c2410c"}}>⏱</span>
      <span style={{fontFamily:PRICE_FONT,fontSize:10.5,fontWeight:800,color:"#c2410c",letterSpacing:.5}}>
        {h>0?`${fmt(h)}h `:""}{fmt(m)}:{fmt(s)}
      </span>
      <span style={{fontSize:9,color:"#9a3412",fontWeight:600}}>left</span>
    </div>
  );
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"9px 14px",marginBottom:10}}>
      <span style={{fontSize:18}}>⏱</span>
      <div>
        <div style={{fontSize:10,color:"#9a3412",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Flash sale ends in</div>
        <div style={{fontFamily:PRICE_FONT,fontSize:18,fontWeight:800,color:"#c2410c",letterSpacing:1}}>
          {h>0&&<span>{fmt(h)}<span style={{fontSize:10,fontWeight:600,marginRight:4}}>h</span></span>}
          {fmt(m)}<span style={{fontSize:10,fontWeight:600,marginRight:4}}>m</span>
          {fmt(s)}<span style={{fontSize:10,fontWeight:600}}>s</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ WELCOME COUPON BANNER ═══════════════════ */
function WelcomeBanner({settings,orders=[]}){
  const code=settings.welcomeCoupon||"WELCOME100";
  const amt=settings.welcomeCouponAmount||100;
  const min=settings.welcomeCouponMinOrder||999;
  const hasRealOrder=orders.some(o=>!["Cancelled"].includes(o.status));
  if(settings.welcomeCouponEnabled===false)return null;
  if(hasRealOrder||!code)return null;
  return(
    <div className="fade-rise" style={{background:"linear-gradient(135deg,#ff5a40 0%,#ff8c3b 100%)",borderRadius:18,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12,boxShadow:"0 6px 24px rgba(255,90,64,.25)"}}>
      <div style={{fontSize:30,flexShrink:0}}>🎉</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:800,color:"white",marginBottom:2}}>First order? Save ₹{amt}!</div>
        <div style={{fontSize:11.5,color:"rgba(255,255,255,.9)",marginBottom:6}}>On orders above ₹{min} — use code:</div>
        <div style={{display:"inline-block",background:"rgba(255,255,255,.2)",borderRadius:8,padding:"4px 12px",border:"1px dashed rgba(255,255,255,.6)"}}>
          <span style={{fontFamily:"monospace",fontSize:14,fontWeight:800,color:"white",letterSpacing:2}}>{code}</span>
        </div>
      </div>
      <button className="press" onClick={()=>{try{navigator.clipboard.writeText(code);}catch(e){}}}
        style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.4)",borderRadius:10,padding:"7px 11px",color:"white",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0,cursor:"pointer"}}>
        Copy
      </button>
    </div>
  );
}

/* ═══════════════════ FESTIVAL / SEASONAL BANNER ═══════════════════ */
function FestivalBanner({settings}){
  const fb=settings.festivalBanner||{};
  if(!fb.active||!fb.text)return null;
  if(fb.endsAt&&new Date(fb.endsAt).getTime()<Date.now())return null;
  const bg=fb.bg||"#7c3aed";
  return(
    <div className="festival-pulse" style={{background:`linear-gradient(135deg,${bg},${bg}cc)`,borderRadius:16,padding:"13px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10,boxShadow:`0 6px 20px ${bg}44`}}>
      {fb.emoji&&<span style={{fontSize:26,flexShrink:0}}>{fb.emoji}</span>}
      <div style={{fontSize:13,fontWeight:700,color:"white",lineHeight:1.4,flex:1}}>{fb.text}</div>
    </div>
  );
}

/* ═══════════════════ LOYALTY POINTS WIDGET ═══════════════════ */
function LoyaltyWidget({points,settings,onRedeem,redeemApplied,subtotal=0}){
  const enabled=settings.loyaltyEnabled;
  const min=Number(settings.loyaltyRedeemMin||100);
  const val=Number(settings.loyaltyRedeemValue||1);
  const maxCoins=Number(settings.walletMaxCoins||100);
  const minOrder=Number(settings.walletMinOrder||0);
  if(!enabled||points==null)return null;
  const orderOk=subtotal>=minOrder;
  const canRedeem=points>=min&&orderOk&&!redeemApplied;
  const usedCoins=Math.min(points,maxCoins);
  const worth=Math.floor(usedCoins*val);
  const totalWorth=Math.floor(points*val);
  return(
    <div className="points-pop" style={{background:"linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%)",borderRadius:16,padding:"14px 16px",marginBottom:14,boxShadow:"0 6px 20px rgba(124,58,237,.2)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:redeemApplied?0:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:22}}>👛</span>
          <div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,color:"white",lineHeight:1}}>{points} pts</div>
            <div style={{fontSize:10.5,color:"rgba(255,255,255,.8)"}}>Wallet = ₹{totalWorth}</div>
          </div>
        </div>
        {!redeemApplied&&(
          <button className="press" onClick={onRedeem} disabled={!canRedeem}
            style={{background:canRedeem?"rgba(255,255,255,.2)":"rgba(255,255,255,.08)",border:`1px solid ${canRedeem?"rgba(255,255,255,.5)":"rgba(255,255,255,.2)"}`,borderRadius:10,padding:"8px 14px",color:canRedeem?"white":"rgba(255,255,255,.45)",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif",cursor:canRedeem?"pointer":"not-allowed"}}>
            {points<min?`Need ${min-points} more pts`:!orderOk?`Min order ₹${minOrder}`:`Redeem ₹${worth}`}
          </button>
        )}
      </div>
      {redeemApplied&&(
        <div style={{fontSize:12,color:"rgba(255,255,255,.9)",fontWeight:600}}>✓ ₹{worth} wallet credit applied{points>maxCoins?` (max ${maxCoins} coins/order)`:""}!</div>
      )}
      {!redeemApplied&&canRedeem&&points>maxCoins&&(
        <div style={{fontSize:10.5,color:"rgba(255,255,255,.8)",marginTop:4}}>You can use up to {maxCoins} coins (₹{Math.floor(maxCoins*val)}) on this order.</div>
      )}
      {!redeemApplied&&!canRedeem&&(
        <div style={{background:"rgba(0,0,0,.15)",borderRadius:8,height:5,overflow:"hidden",marginTop:4}}>
          <div style={{height:"100%",background:"rgba(255,255,255,.6)",borderRadius:8,width:`${Math.min(100,(points/min)*100)}%`,transition:"width .4s ease"}}/>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ CUSTOMER TANK SHOWCASE ═══════════════════ */
function TankShowcaseSection({showcase,user,settings,onSubmit}){
  const [preview,setPreview]=useState(null);
  const [ownerName,setOwnerName]=useState(user?.name||"");
  const [caption,setCaption]=useState("");
  const [imgData,setImgData]=useState(null);
  const [note,setNote]=useState("");
  const [fullImg,setFullImg]=useState(null);
  const [uploading,setUploading]=useState(false);
  // ── Sync name field with the signed-in Google account.
  // Functional updater preserves any name the user has already typed manually.
  useEffect(()=>{
    if(user?.name) setOwnerName(n=>n||user.name);
  },[user?.name]);
  if(!settings.showcaseEnabled)return null;
  if(!(showcase||[]).some(s=>showcaseApproved(s))&&!user)return null;
  const now=Date.now();
  const liveShowcase=(showcase||[]).filter(s=>showcaseApproved(s)&&!showcaseExpired(s,now));
  const mine=user&&(showcase||[]).find(s=>s.userUid===user.uid&&!showcaseExpired(s,now));
  const minePending=mine&&!showcaseApproved(mine);
  const handleFile=async file=>{
    if(!file)return;
    setNote("Processing…");
    const b64=await compressImage(file,1200,0.84);
    setImgData(b64);setPreview(b64);setNote("✓ Photo ready");
  };
  const submit=async()=>{
    if(!imgData){setNote("⚠ Please select a photo");return;}
    const finalName=(user?.name||ownerName||"Aquarist").trim();
    setUploading(true);
    await onSubmit({id:user?.uid||uid("sc"),imgData,ownerName:finalName,caption:caption.trim(),createdAt:new Date().toISOString(),approved:false,userUid:user?.uid||(user?userKey(user):"")});
    setImgData(null);setPreview(null);setCaption("");setOwnerName(user?.name||"");setNote("📩 Submitted! We'll review it soon.");setUploading(false);
    setTimeout(()=>setNote(""),4000);
  };
  return(
    <div style={{marginBottom:26}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text}}>🪸 Customer Tanks</span>
        {liveShowcase.length>0&&<span style={{fontSize:11,color:C.textSub,fontWeight:600}}>{liveShowcase.length} shared · 24h</span>}
      </div>
      {minePending&&(
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"10px 13px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <img src={mine.imgData} alt="" style={{width:38,height:38,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
          <div style={{fontSize:11.5,color:"#9a3412",fontWeight:600,lineHeight:1.45}}>⏳ Your tank photo is awaiting approval. Once approved it goes live for everyone for 24 hours.</div>
        </div>
      )}
      {liveShowcase.length>0&&(
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6,marginBottom:12}}>
          {liveShowcase.map(s=>(
            <div key={s.id} className="showcase-slide" style={{flexShrink:0,width:130,borderRadius:14,overflow:"hidden",background:C.card,border:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>setFullImg(s)}>
              <div style={{height:100,overflow:"hidden"}}>
                <img src={s.imgData} alt={s.ownerName} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
              <div style={{padding:"7px 8px"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>🐠 {s.ownerName}</div>
                {s.caption&&<div style={{fontSize:10,color:C.textSub,lineHeight:1.3,marginTop:2,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{s.caption}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {user&&(
        <div style={{background:C.card,borderRadius:16,padding:"14px",border:`1.5px dashed ${C.accent}`}}>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:13,fontWeight:800,color:C.text,marginBottom:2}}>📸 {minePending?"Replace Your Pending Photo":mine?"Update Your Tank":"Share Your Tank!"}</div>
          <div style={{fontSize:10.5,color:C.textSub,marginBottom:10}}>One photo per customer · admin-approved · shown 24 hours after approval</div>
          {preview?(
            <div style={{position:"relative",borderRadius:12,overflow:"hidden",marginBottom:8}}>
              <img src={preview} alt="preview" style={{width:"100%",height:110,objectFit:"cover"}}/>
              <button onClick={()=>{setPreview(null);setImgData(null);setNote("");}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",color:"white",border:"none",borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700}}>Replace</button>
            </div>
          ):(
            <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,border:`1.5px dashed ${C.border}`,borderRadius:12,padding:"14px",cursor:"pointer",marginBottom:8,background:C.bg}}>
              <span style={{fontSize:24}}>🐡</span>
              <span style={{fontSize:12,fontWeight:700,color:C.primary}}>Tap to upload your tank photo</span>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
            </label>
          )}
          <div style={{display:"flex",alignItems:"center",gap:8,width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,background:C.bg,marginBottom:6,color:C.text}}>
            <span style={{fontSize:14}}>🐠</span>
            <span style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name||"Aquarist"}</span>
            <span style={{marginLeft:"auto",fontSize:10,color:C.textSub,fontWeight:600,flexShrink:0}}>from your Google account</span>
          </div>
          <input value={caption} onChange={e=>setCaption(e.target.value.slice(0,100))} placeholder="Describe your tank… (optional)"
            style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white",marginBottom:6}}/>
          {note&&<div style={{fontSize:11.5,color:note[0]==="⚠"?C.danger:note[0]==="🎉"?C.success:C.primary,fontWeight:600,marginBottom:6}}>{note}</div>}
          <button className="press" onClick={submit} disabled={uploading}
            style={{width:"100%",background:uploading?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:12,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
            {uploading?"Uploading…":(mine?"Update My Tank 🐠":"Share My Tank 🐠")}
          </button>
        </div>
      )}
      {fullImg&&(
        <Portal>
        <div onClick={()=>setFullImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
          <img src={fullImg.imgData} alt={fullImg.ownerName} style={{maxWidth:"100%",maxHeight:"70vh",borderRadius:16,objectFit:"contain"}}/>
          <div style={{marginTop:14,textAlign:"center"}}>
            <div style={{color:"white",fontWeight:700,fontSize:14}}>🐠 {fullImg.ownerName}</div>
            {fullImg.caption&&<div style={{color:"rgba(255,255,255,.8)",fontSize:12,marginTop:4}}>{fullImg.caption}</div>}
          </div>
          <button onClick={()=>setFullImg(null)} style={{marginTop:16,background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.3)",borderRadius:12,padding:"10px 24px",color:"white",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Close</button>
        </div>
        </Portal>
      )}
    </div>
  );
}

/* ═══════════════════ TESTIMONIALS ═══════════════════ */
function TestimonialsSection({testimonials=[],user,onSubmit,onSignIn}){
  const [text,setText]=useState("");
  const [rating,setRating]=useState(5);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState("");
  const mine=user&&(testimonials||[]).find(t=>t.uid&&t.uid===userKey(user));
  const submit=async()=>{
    const body=text.trim();
    if(body.length<4){ setNote("⚠ Please write a few words."); return; }
    setBusy(true); setNote("");
    const t={ id:"ts-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
      uid:userKey(user)||"", name:(user.name||"Customer").slice(0,40), text:body.slice(0,280),
      rating:Number(rating)||5, createdAt:new Date().toISOString() };
    try{ await onSubmit(t); setText(""); setNote("🎉 Thanks for sharing!"); }
    catch(e){ setNote("⚠ Couldn't post — try again."); }
    setBusy(false);
  };
  const list=(testimonials||[]).slice(0,12);
  if(!list.length && !user) return null;
  return(
    <div style={{marginBottom:26}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text}}>💬 Testimonials</span>
        {list.length>0&&<span style={{fontSize:11,color:C.textSub,fontWeight:600}}>{list.length} from our customers</span>}
      </div>
      {list.length>0&&(
        <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:6,marginBottom:12,WebkitOverflowScrolling:"touch"}}>
          {list.map(t=>(
            <div key={t.id} style={{flexShrink:0,width:240,background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 15px",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:2}}>
                {[1,2,3,4,5].map(s=><span key={s} className={s<=(t.rating||5)?"stars":"stars-dim"} style={{fontSize:13}}>★</span>)}
              </div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontStyle:"italic"}}>“{t.text}”</div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:"auto"}}>
                <span style={{width:24,height:24,borderRadius:"50%",background:C.primary,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{(t.name||"C").charAt(0).toUpperCase()}</span>
                <span style={{fontSize:12,fontWeight:700,color:C.text}}>{t.name||"Customer"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {user?(
        mine?(
          <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:14,padding:"12px 14px",fontSize:12.5,color:"#15803d",fontWeight:700}}>✓ Thanks for your testimonial, {(user.name||"").split(" ")[0]||"friend"}!</div>
        ):(
          <div style={{background:C.card,borderRadius:16,padding:"14px",border:`1.5px dashed ${C.accent}`}}>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:13,fontWeight:800,color:C.text,marginBottom:8}}>Share your experience</div>
            <div style={{display:"flex",gap:4,marginBottom:8}}>
              {[1,2,3,4,5].map(s=>(
                <button key={s} onClick={()=>setRating(s)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,padding:0,lineHeight:1,color:s<=rating?"#f59e0b":"#d1d5db"}}>★</button>
              ))}
            </div>
            <textarea value={text} onChange={e=>setText(e.target.value.slice(0,280))} placeholder="How was your experience with Nemo Aqua Store?"
              rows={3} style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:13,outline:"none",background:"white",marginBottom:6,resize:"vertical",fontFamily:"'Nunito',sans-serif"}}/>
            {note&&<div style={{fontSize:11.5,color:note[0]==="⚠"?C.danger:C.success,fontWeight:600,marginBottom:6}}>{note}</div>}
            <button className="press" onClick={submit} disabled={busy}
              style={{width:"100%",background:busy?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:12,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              {busy?"Posting…":"Post Testimonial 💬"}
            </button>
          </div>
        )
      ):(
        <button className="press" onClick={onSignIn}
          style={{width:"100%",background:C.card,color:C.primary,border:`1.5px dashed ${C.accent}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
          Sign in to write a testimonial
        </button>
      )}
    </div>
  );
}

/* ═══════════════════ RESTOCK ALERT BUTTON ═══════════════════ */
function RestockBtn({product,user,restockSet,onSubscribe}){
  const already=restockSet.includes(product.id);
  if((product.stockCount??DEFAULT_STOCK)>0||product.comingSoon)return null;
  return(
    <button className="press" onClick={()=>{if(!already&&onSubscribe)onSubscribe(product);}} disabled={already}
      style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",background:already?"#dcfce7":"#fff7ed",color:already?"#15803d":"#c2410c",border:`1.5px solid ${already?"#86efac":"#fed7aa"}`,borderRadius:12,padding:"10px 14px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginTop:8}}>
      {already?"🔔 You'll be alerted when it's back!":"🔔 Notify me when back in stock"}
    </button>
  );
}

/* ═══════════════════ CARE GUIDE NOTIFICATION BUTTON ═══════════════════ */
function GuideNotifBtn(){
  const [perm,setPerm]=useState(()=>typeof Notification!=="undefined"?Notification.permission:"default");
  if(perm==="granted")return(
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.success,fontWeight:600}}>
      <span>🔔</span> Notifications on
    </div>
  );
  if(perm==="denied")return null;
  return(
    <button className="press" onClick={()=>requestNotifPerm(ok=>setPerm(ok?"granted":"denied"))}
      style={{display:"flex",alignItems:"center",gap:6,background:C.accentLight,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 12px",fontSize:11,fontWeight:700,color:C.primary,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
      🔔 Notify me of new guides
    </button>
  );
}

function StockBadge({stockCount}){
  const m = stockCount<=0 ? {c:"#dc2626",bg:"#fee2e2",l:"✕ Out of Stock"}
          : stockCount<=3 ? {c:"#c2410c",bg:"#fff7ed",l:`⚠ Only ${stockCount} left`}
          : {c:"#15803d",bg:"#dcfce7",l:`● ${stockCount} in stock`};
  return <span style={{fontSize:10,fontWeight:700,color:m.c,background:m.bg,padding:"3px 9px",borderRadius:20}}>{m.l}</span>;
}
function StatusBadge({status}){
  const m={"Awaiting Payment":{c:"#b45309",bg:"#fef3c7",icon:"⏳"},"Payment Review":{c:"#7c3aed",bg:"#ede9fe",icon:"🔎"},Placed:{c:"#1d4ed8",bg:"#dbeafe",icon:"📋"},Confirmed:{c:"#15803d",bg:"#dcfce7",icon:"✅"},Shipped:{c:"#c2410c",bg:"#fff7ed",icon:"🚚"},Delivered:{c:"#15803d",bg:"#dcfce7",icon:"🎉"},Cancelled:{c:"#b91c1c",bg:"#fee2e2",icon:"✕"}};
  const s=m[status]||m.Placed;
  return <span style={{fontSize:10,fontWeight:700,color:s.c,background:s.bg,padding:"3px 10px",borderRadius:20}}>{s.icon} {status}</span>;
}
function CategoryPills({selected,onSelect,all}){
  const list=all?["All",...CATEGORIES]:CATEGORIES;
  const icons={All:"🌊",...Object.fromEntries(CATEGORIES.map(c=>[c,CAT_META[c].emoji]))};
  return(
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
      {list.map(c=>(
        <button key={c} className="press" onClick={()=>onSelect(c)} style={{
          flexShrink:0,background:selected===c?C.primary:C.card,color:selected===c?"white":C.textSub,
          border:`1.5px solid ${selected===c?C.primary:C.border}`,borderRadius:20,padding:"7px 14px",
          fontSize:12,fontWeight:600,fontFamily:"'Nunito',sans-serif",transition:"all .2s",
          display:"flex",alignItems:"center",gap:5}}>
          <span>{icons[c]}</span>{c}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════ REVIEW COMPONENTS ═══════════════════ */
function ReviewStars({value,onChange,size=18}){
  const [hov,setHov]=useState(0);
  const interactive=!!onChange;
  return(
    <div style={{display:"flex",gap:3}}>
      {[1,2,3,4,5].map(s=>(
        <span key={s}
          onClick={()=>onChange&&onChange(s)}
          onMouseEnter={()=>interactive&&setHov(s)}
          onMouseLeave={()=>interactive&&setHov(0)}
          style={{fontSize:size,cursor:interactive?"pointer":"default",transition:"color .12s",
            color:s<=(hov||value)?"#f59e0b":"#d1d5db",lineHeight:1,display:"block"}}>★</span>
      ))}
    </div>
  );
}

function RatingSummary({reviews,avgRating}){
  const counts=[5,4,3,2,1].map(s=>({star:s,count:reviews.filter(r=>r.rating===s).length}));
  const total=reviews.length;
  return(
    <div style={{display:"flex",gap:16,alignItems:"center",background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.border}`,marginBottom:16}}>
      {/* Big score */}
      <div style={{textAlign:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:42,fontWeight:800,color:C.text,lineHeight:1}}>{avgRating.toFixed(1)}</div>
        <ReviewStars value={Math.round(avgRating)} size={14}/>
        <div style={{fontSize:11,color:C.textSub,marginTop:4}}>{total} review{total!==1?"s":""}</div>
      </div>
      {/* Bar breakdown */}
      <div style={{flex:1}}>
        {counts.map(({star,count})=>{
          const pct=total>0?(count/total)*100:0;
          return(
            <div key={star} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <span style={{fontSize:10,color:C.textSub,minWidth:10,textAlign:"right"}}>{star}</span>
              <span style={{fontSize:10,color:"#f59e0b"}}>★</span>
              <div style={{flex:1,height:6,borderRadius:3,background:C.border,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,background:"#f59e0b",width:pct+"%",transition:"width .4s ease"}}/>
              </div>
              <span style={{fontSize:10,color:C.textSub,minWidth:16,textAlign:"right"}}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewForm({onSubmit,onCancel,user,orderId:oid}){
  const [rating,setRating]   = useState(0);
  const [comment,setComment] = useState("");
  const [errs,setErrs]       = useState({});
  const [saving,setSaving]   = useState(false);
  const name = user?.name || "";

  const validate=()=>{
    const e={};
    if(!rating)e.rating="Please select a star rating";
    if(comment.trim().length<10)e.comment="Please write at least 10 characters";
    setErrs(e);
    return !Object.keys(e).length;
  };

  const submit=async()=>{
    if(!validate())return;
    setSaving(true);
    await onSubmit({id:uid("rev"),name:name||"Customer",rating,comment:comment.trim(),date:new Date().toISOString(),orderId:oid,verified:true});
    setSaving(false);
  };

  return(
    <div className="slide-up" style={{background:C.card,borderRadius:18,padding:"18px",border:`1.5px solid ${C.border}`,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:800,color:C.success,background:"#dcfce7",padding:"3px 9px",borderRadius:20}}>✓ VERIFIED PURCHASE</span>
      </div>
      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,color:C.text,marginBottom:14}}>Write a Review</div>

      {/* Star picker */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Your Rating</div>
        <ReviewStars value={rating} onChange={setRating} size={34}/>
        <div style={{fontSize:11,color:"#f59e0b",fontWeight:600,marginTop:6,minHeight:16}}>
          {rating===1?"😐 Poor":rating===2?"🙁 Fair":rating===3?"😊 Good":rating===4?"😄 Great":rating===5?"🤩 Excellent":""}
        </div>
        {errs.rating&&<div style={{fontSize:11,color:C.danger,fontWeight:600}}>{errs.rating}</div>}
      </div>

      {/* Comment */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Your Review</div>
        <textarea value={comment} onChange={e=>setComment(e.target.value.slice(0,500))} rows={4}
          placeholder="How was the quality? Condition on arrival? Would you recommend it?"
          style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.comment?C.danger:C.border}`,padding:"11px 14px",fontSize:13,outline:"none",resize:"none",lineHeight:1.6,background:C.bg}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
          {errs.comment?<span style={{fontSize:11,color:C.danger,fontWeight:600}}>{errs.comment}</span>:<span/>}
          <span style={{fontSize:11,color:C.textSub}}>{comment.length}/500</span>
        </div>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button className="press" onClick={onCancel}
          style={{flex:1,padding:"12px",borderRadius:12,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
          Cancel
        </button>
        <button className="press" onClick={submit} disabled={saving}
          style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:C.primary,color:"white",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:saving?.7:1}}>
          {saving?<><Spinner/>Submitting…</>:"⭐ Submit Review"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ COUNTDOWN BANNER ═══════════════════ */
function CountdownBanner({endsAt, title="Limited Time Offer", subtitle="Don't miss out on this exclusive deal!", stockNote, onShop}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const i=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(i);},[]);
  const end = new Date(endsAt).getTime();
  const diff = Math.max(0, end-now);
  const d = Math.floor(diff/(1000*60*60*24));
  const h = Math.floor((diff/(1000*60*60))%24);
  const m = Math.floor((diff/(1000*60))%60);
  const s = Math.floor((diff/1000)%60);
  const pad = n => String(n).padStart(2,"0");
  const cells = [{v:pad(d),l:"Days"},{v:pad(h),l:"Hours"},{v:pad(m),l:"Mins"},{v:pad(s),l:"Secs"}];
  if(diff<=0) return null;
  return(
    <div style={{background:`linear-gradient(135deg,${C.coral} 0%,#ff8a40 100%)`,borderRadius:20,padding:"18px 16px",color:"white",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,.1)"}}/>
      <div style={{position:"absolute",bottom:-40,left:-30,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
      <div style={{position:"relative"}}>
        <div style={{display:"inline-block",background:"rgba(0,0,0,.18)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:800,letterSpacing:1.5,marginBottom:8}}>⚡ OFFER</div>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,marginBottom:2}}>{title}</div>
        <div style={{fontSize:12,opacity:.88,marginBottom:14}}>{subtitle}</div>
        <div style={{fontSize:11,fontWeight:700,opacity:.85,marginBottom:6,letterSpacing:.8}}>Ends in:</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:stockNote?12:14}}>
          {cells.map((c,i)=>(
            <div key={i} className={c.l==="Secs"?"countdown-cell":""} style={{background:"rgba(255,255,255,.95)",color:C.coral,borderRadius:10,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,lineHeight:1}}>{c.v}</div>
              <div style={{fontSize:9,fontWeight:700,color:"#7a1a08",marginTop:3,textTransform:"uppercase",letterSpacing:.8}}>{c.l}</div>
            </div>
          ))}
        </div>
        {stockNote&&<div style={{fontSize:12,fontWeight:700,marginBottom:12,opacity:.95}}>🔥 {stockNote}</div>}
        <button className="press" onClick={onShop}
          style={{background:"white",color:C.coral,border:"none",borderRadius:12,padding:"11px 22px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif",boxShadow:"0 4px 14px rgba(0,0,0,.18)"}}>
          Shop Now →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ VARIANT PICKER (Live Fish) ═══════════════════ */
function VariantPicker({product, variants, selectedId, onSelect}){
  const onSale=(product.discountPct||0)>0;
  return(
    <div style={{marginBottom:18}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Choose Type</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {variants.map(v=>{
          const sel = v.id===selectedId;
          const price = variantEffPrice(product, v);
          const orig  = variantBasePrice(product, v);
          return(
            <button key={v.id} className="press" onClick={()=>!v.soldOut&&onSelect(v)} disabled={v.soldOut}
              style={{
                width:"100%",textAlign:"left",
                background: v.soldOut?"#f3f4f6":sel?C.accentLight:C.card,
                border:`1.5px solid ${sel?C.primary:C.border}`,
                borderRadius:14, padding:"12px 14px",
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
                opacity:v.soldOut?.55:1,cursor:v.soldOut?"not-allowed":"pointer",
                fontFamily:"'Nunito',sans-serif",
              }}>
              <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${sel?C.primary:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {sel&&<div style={{width:10,height:10,borderRadius:"50%",background:C.primary}}/>}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:C.text,lineHeight:1.3}}>{v.label}</div>
              </div>
              {v.soldOut
                ? <span style={{fontSize:11,fontWeight:700,color:C.danger}}>Sold out</span>
                : <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    {onSale&&<span style={{fontSize:11,color:C.textSub,textDecoration:"line-through"}}>₹{orig}</span>}
                    <span style={{fontFamily:PRICE_FONT,fontSize:14,fontWeight:800,color:C.primary}}>₹{price}</span>
                  </span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ GOOGLE AUTH ═══════════════════ */
function PhoneAuth({onSuccess, onBack, mode="signin", settings}){
  const [busy,setBusy]   = useState(false);
  const [err,setErr]     = useState("");
  const [showDemo,setShowDemo] = useState(false);

  const doGoogle = async () => {
    setErr(""); setBusy(true);
    try{
      const u = await googleSignIn();
      onSuccess({...u, keep:true});
    }catch(e){
      const code = e?.code||e?.message||"";
      if(String(code).includes("redirecting")) return; // page is navigating to Google
      if(code==="offline" || !FB_OK){
        // Preview / offline — offer demo accounts so the flow is testable
        setShowDemo(true);
        setErr("Google sign-in needs the live (deployed) site. Use a demo account below to preview.");
      } else if(String(code).includes("popup-closed") || String(code).includes("cancelled")){
        setErr("Sign-in cancelled. Please try again.");
      } else if(String(code).includes("unauthorized-domain")){
        setErr("This domain isn't authorized yet. Add it in Firebase → Authentication → Settings → Authorized domains.");
      } else {
        setErr("Couldn't sign in. Please try again.");
      }
    }finally{ setBusy(false); }
  };

  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",minHeight:"100%",background:C.bg,padding:"56px 22px 32px",position:"relative"}}>
      <button className="press" onClick={onBack} style={{position:"absolute",top:20,left:14,background:"none",border:"none",fontSize:24,color:C.textSub,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>

      <div style={{textAlign:"center",marginBottom:30,marginTop:20}}>
        <img src={STORE_LOGO} alt="Nemo" onError={e=>{if(!e.target.dataset.fb){e.target.dataset.fb='1';e.target.src=NEMO_FALLBACK;}}} style={{width:130,height:130,objectFit:"contain",margin:"0 auto",display:"block",filter:"drop-shadow(0 10px 24px rgba(8,54,64,.35))"}}/>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:26,fontWeight:800,color:C.text,marginTop:16,marginBottom:6}}>
          {mode==="checkout"?"Sign in to checkout":"Welcome to Nemo"}
        </div>
        <div style={{fontSize:13.5,color:C.textSub,lineHeight:1.55,maxWidth:300,margin:"0 auto"}}>
          Sign in with Google to place orders, track delivery, and review your purchases.
        </div>
      </div>

      <div style={{maxWidth:360,width:"100%",margin:"0 auto"}}>
        <button className="press" onClick={doGoogle} disabled={busy}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:12,background:"white",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"15px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:700,color:C.text,boxShadow:"0 2px 10px rgba(0,0,0,.05)",opacity:busy?.7:1}}>
          {busy?<Spinner/>:<svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}
          Continue with Google
        </button>

        {err&&<div style={{fontSize:12.5,color:showDemo?C.textSub:C.danger,fontWeight:500,marginTop:14,textAlign:"center",lineHeight:1.5,background:showDemo?C.accentLight:"transparent",borderRadius:12,padding:showDemo?"10px 14px":0}}>{err}</div>}

        {showDemo&&(
          <div style={{marginTop:16}}>
            {DEMO_GOOGLE_ACCOUNTS.map(acc=>(
              <button key={acc.email} className="press" onClick={()=>onSuccess({name:acc.name,phone:acc.phone,email:acc.email,method:"demo",loginAt:new Date().toISOString(),keep:true})}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,background:"white",border:`1.5px solid ${C.border}`,borderRadius:14,padding:"12px 14px",marginBottom:10,cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left"}}>
                <span style={{width:34,height:34,borderRadius:"50%",background:acc.color,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,flexShrink:0}}>{acc.name.charAt(0)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:C.text}}>{acc.name}</div>
                  <div style={{fontSize:11.5,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{acc.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{fontSize:11,color:C.textSub,textAlign:"center",marginTop:18,lineHeight:1.55}}>
          By continuing you agree to our terms.<br/>We'll use your details only for orders &amp; delivery updates.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ SORT · FILTER SHEET ═══════════════════ */
function SortFilterSheet({open, onClose, sort, setSort, priceMax, priceCap, setPriceMax, availability, setAvailability, onClear, count}){
  if(!open) return null;
  return(
    <Portal>
    <div onClick={onClose} className="drawer-overlay" style={{position:"fixed",inset:0,background:"rgba(10,36,38,.42)",zIndex:9000,display:"flex",alignItems:"stretch",justifyContent:"flex-start",animation:"fadeIn .18s ease"}}>
      <div onClick={e=>e.stopPropagation()} className="drawer-panel"
        style={{background:C.card,width:"86%",maxWidth:340,height:"100%",padding:"22px 20px 28px",overflowY:"auto",boxShadow:"4px 0 30px rgba(10,36,38,.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,color:C.text}}>Filter &amp; Sort</div>
          <button className="press" onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,width:34,height:34,fontSize:17,color:C.textSub,cursor:"pointer"}}>✕</button>
        </div>
        <button className="press" onClick={onClear} style={{background:"none",border:"none",fontSize:12,fontWeight:700,color:C.accent,fontFamily:"'Nunito',sans-serif",padding:0,marginBottom:18,cursor:"pointer"}}>↺ Clear all filters</button>

        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Sort by</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:22}}>
          {SORT_OPTS.map(o=>(
            <button key={o.id} className="press" onClick={()=>setSort(o.id)}
              style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${sort===o.id?C.primary:C.border}`,background:sort===o.id?C.primary:"transparent",color:sort===o.id?"white":C.textSub,fontSize:12,fontWeight:600,fontFamily:"'Nunito',sans-serif"}}>
              {o.label}
            </button>
          ))}
        </div>

        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Availability</div>
        <div style={{display:"flex",gap:8,marginBottom:22}}>
          {[{id:"all",l:"All"},{id:"instock",l:"In stock"},{id:"limited",l:"Limited"}].map(o=>(
            <button key={o.id} className="press" onClick={()=>setAvailability(o.id)}
              style={{flex:1,padding:"9px 12px",borderRadius:14,border:`1.5px solid ${availability===o.id?C.primary:C.border}`,background:availability===o.id?C.primary:"transparent",color:availability===o.id?"white":C.textSub,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              {o.l}
            </button>
          ))}
        </div>

        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Max Price</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:12,color:C.textSub}}>₹0</span>
          <span style={{fontFamily:PRICE_FONT,fontSize:16,fontWeight:800,color:C.primary}}>₹{priceMax}</span>
          <span style={{fontSize:12,color:C.textSub}}>₹{priceCap}</span>
        </div>
        <input type="range" min={0} max={priceCap} step={50} value={priceMax} onChange={e=>setPriceMax(Number(e.target.value))}
          style={{width:"100%",accentColor:C.primary,marginBottom:24}}/>

        <button className="press" onClick={onClose}
          style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:14,padding:"15px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
          Show {count} result{count!==1?"s":""}
        </button>
      </div>
    </div>
    </Portal>
  );
}

/* ═══════════════════ ORDER HISTORY PAGE ═══════════════════ */
function OrderHistoryPage({user, orders, products, mediaCache, nav, onLogout, onWriteReview, reviewedSet=[], onSubmitPayment, onCancelled, onReportDoa, settings={}, favorites=[]}){
  const uk = userKey(user);
  const [payOpen,setPayOpen]=useState(null);
  const myOrders = orders.filter(o =>
    (o.userUid && uk && o.userUid===uk) ||
    (user.uid && o.userUid===user.uid) ||
    (user.phone && normalizePhone(o.address?.phone)===normalizePhone(user.phone))
  );
  // Delivered products awaiting a review (deduped)
  const toReview=[];
  const seen={};
  myOrders.filter(o=>o.status==="Delivered").forEach(o=>o.items.forEach(it=>{
    if(seen[it.id]||reviewedSet.includes(it.id))return;
    const prod=products.find(p=>p.id===it.id);
    if(prod){ seen[it.id]=1; toReview.push({prod,name:it.name,category:it.category}); }
  }));
  const hasDelivered = myOrders.some(o=>o.status==="Delivered");
  const ownerWA=(settings.ownerWhatsapp||BUSINESS_WA).replace(/\D/g,"");
  const [doaOpen,setDoaOpen]=useState(null);
  const [doaOrderNo,setDoaOrderNo]=useState("");
  const [doaLookupMsg,setDoaLookupMsg]=useState("");
  const submitDoaByNumber=()=>{
    const q=doaOrderNo.trim().toUpperCase().replace(/\s/g,"");
    if(!q){ setDoaLookupMsg("Enter your order number"); return; }
    const match=myOrders.find(o=>{
      const id=(orderId(o.id)||"").toUpperCase(), no=(o.orderNo||"").toUpperCase();
      return id===q||no===q||id.endsWith(q)||no.endsWith(q)||id.includes(q);
    });
    if(!match){ setDoaLookupMsg("No order found with that number"); return; }
    if(match.status!=="Delivered"){ setDoaLookupMsg("DOA can only be reported on a delivered order"); return; }
    if(!match.items.some(it=>it.category==="Live Fish")){ setDoaLookupMsg("That order has no live fish"); return; }
    if(match.doa){ setDoaLookupMsg("A DOA request already exists for that order"); return; }
    openWA(ownerWA,encodeURIComponent(`Hi, I received a Dead on Arrival (DOA) fish in order ${orderId(match.id)}. I'm sharing my unboxing video for review — please help with a replacement/refund.`));
    onReportDoa&&onReportDoa(match);
    setDoaOrderNo(""); setDoaLookupMsg("");
  };
  const [refCode,setRefCode]=useState(null);
  const [refCopied,setRefCopied]=useState(false);
  const refAmt=settings.referralDiscount||50;
  // Reveal the customer's own referral code once they have a delivered order (post-delivery reward)
  useEffect(()=>{
    if(settings.referralEnabled===false||!hasDelivered||!user?.uid){ setRefCode(null); return; }
    let alive=true;
    getMyReferralCode(user.uid).then(c=>{ if(alive) setRefCode(c); });
    return ()=>{alive=false;};
  },[hasDelivered,user,settings.referralEnabled]);
  const doaStatusText={
    "Requested":"Received — please send your unboxing video on WhatsApp so we can review it.",
    "Under Review":"Your DOA video is under review by our team.",
    "Approved - Replacement":"Approved ✓ — a replacement is being arranged.",
    "Approved - Store Credit":"Approved ✓ — store credit equal to the fish value is being issued.",
    "Approved - Refund":"Approved ✓ — a refund of the fish amount is being processed.",
    "Declined":"Reviewed — this DOA request was not approved.",
  };
  return(
    <div className="slide-up">
      <div style={{background:C.card,padding:"52px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontSize:11,color:C.textSub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Signed in</div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800,color:C.text}}>{user.name||"My Orders"}</div>
            {(user.phone||user.email)&&(
              <div style={{fontSize:12,color:C.textSub,marginTop:2}}>
                {user.phone?`+91 ${user.phone}`:user.email}
              </div>
            )}
          </div>
          <button className="press" onClick={onLogout}
            style={{background:C.bg,color:C.danger,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"8px 14px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
            Logout
          </button>
        </div>
      </div>

      <div className="dt-read" style={{padding:"16px 16px 100px"}}>
        {/* Saved / Favorites — lives here under the signed-in account */}
        <button className="press" onClick={()=>nav("saved")}
          style={{width:"100%",display:"flex",alignItems:"center",gap:12,background:C.card,border:`1.5px solid ${C.border}`,borderRadius:16,padding:"14px 16px",marginBottom:16,cursor:"pointer",textAlign:"left"}}>
          <span style={{fontSize:22,color:C.coral}}>♥</span>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:C.text,fontFamily:"'Baloo 2',sans-serif"}}>Saved Items</div>
            <div style={{fontSize:11.5,color:C.textSub}}>{favorites.length>0?`${favorites.length} item${favorites.length!==1?"s":""} saved`:"Your wishlist is empty"}</div>
          </div>
          <span style={{fontSize:18,color:C.textSub}}>›</span>
        </button>
        {toReview.length>0&&(
          <div style={{background:`linear-gradient(140deg,${C.primary},${C.accent})`,borderRadius:20,padding:"18px",marginBottom:16,color:"white",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-24,right:-16,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.12)"}}/>
            <div style={{position:"relative"}}>
              <div style={{fontSize:26,marginBottom:6}}>🌟</div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:18,fontWeight:800,marginBottom:4}}>How was your order?</div>
              <div style={{fontSize:12.5,opacity:.9,lineHeight:1.5,marginBottom:14}}>Your delivery is complete — please take a moment to rate your {toReview.length===1?"purchase":"purchases"}. It really helps us & other fishkeepers!</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {toReview.slice(0,4).map(({prod,name,category})=>{
                  const m=CAT_META[category]||CAT_META["Live Fish"];
                  const img=prod.media?.images?.[0]?.src||mediaCache["img-"+prod.id];
                  return(
                    <button key={prod.id} className="press" onClick={()=>onWriteReview(prod)}
                      style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,.95)",borderRadius:14,padding:"10px 12px",border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left"}}>
                      <div style={{width:40,height:40,borderRadius:10,flexShrink:0,overflow:"hidden",background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                        {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:m.emoji}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                        <div style={{fontSize:13,color:"#f59e0b",letterSpacing:1}}>★★★★★</div>
                      </div>
                      <span style={{fontSize:12,fontWeight:800,color:C.primary,flexShrink:0}}>Rate →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {refCode&&(
          <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",borderRadius:18,padding:"16px",marginBottom:16,color:"white",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-14,width:84,height:84,borderRadius:"50%",background:"rgba(255,255,255,.12)"}}/>
            <div style={{position:"relative"}}>
              <div style={{fontSize:24,marginBottom:4}}>💜</div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,marginBottom:4}}>Refer a friend — they save ₹{refAmt}</div>
              <div style={{fontSize:12,opacity:.92,lineHeight:1.5,marginBottom:12}}>Thanks for shopping with us! Share your personal code — your friend gets ₹{refAmt} off, and you earn {settings.referralCoins??50} 👛 wallet points once their order is delivered.</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,background:"rgba(255,255,255,.18)",border:"1px dashed rgba(255,255,255,.5)",borderRadius:10,padding:"10px 14px",fontFamily:"monospace",fontSize:20,fontWeight:800,letterSpacing:3,textAlign:"center"}}>{refCode}</div>
                <button className="press" onClick={()=>{
                    try{navigator.clipboard.writeText(refCode);}catch(e){}
                    try{navigator.share&&navigator.share({text:`Use my code ${refCode} at ${STORE_NAME} Aqua Store for ₹${refAmt} off! 🐠`});}catch(e){}
                    setRefCopied(true);setTimeout(()=>setRefCopied(false),2000);
                  }}
                  style={{background:refCopied?"rgba(255,255,255,.95)":"rgba(255,255,255,.25)",border:"1px solid rgba(255,255,255,.4)",borderRadius:10,padding:"11px 16px",color:refCopied?"#7c3aed":"white",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                  {refCopied?"✓ Copied!":"Share"}
                </button>
              </div>
            </div>
          </div>
        )}

        {myOrders.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.textSub}}>
            <div style={{fontSize:64,marginBottom:14}}>📦</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>No orders yet</div>
            <div style={{fontSize:13,marginBottom:20}}>Your orders will appear here.</div>
            <button className="press" onClick={()=>nav("shop")} style={{background:C.primary,color:"white",border:"none",borderRadius:14,padding:"13px 28px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Start Shopping</button>
          </div>
        ):(
          <>
          {myOrders.some(o=>o.status==="Delivered"&&o.items.some(it=>it.category==="Live Fish"))&&(
            <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:16,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:800,color:"#9a3412",marginBottom:4}}>🐟 Report a Dead-on-Arrival (DOA)</div>
              <div style={{fontSize:11.5,color:"#9a3412",lineHeight:1.55,marginBottom:10}}>Enter your order number to start a claim. Have your unboxing video ready — share it on WhatsApp within 2 hours of delivery.</div>
              <div style={{display:"flex",gap:8}}>
                <input value={doaOrderNo} onChange={e=>{setDoaOrderNo(e.target.value);setDoaLookupMsg("");}} placeholder="Your order number"
                  style={{flex:1,borderRadius:12,border:`1.5px solid ${doaLookupMsg?C.danger:C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white",fontFamily:"monospace"}}/>
                <button className="press" onClick={submitDoaByNumber}
                  style={{background:"#25D366",color:"white",border:"none",borderRadius:12,padding:"0 16px",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>Report DOA</button>
              </div>
              {doaLookupMsg&&<div style={{fontSize:11.5,color:C.danger,fontWeight:600,marginTop:4}}>{doaLookupMsg}</div>}
            </div>
          )}
          <div style={{fontSize:12,color:C.textSub,fontWeight:600,marginBottom:12}}>{myOrders.length} order{myOrders.length!==1?"s":""}</div>
          {myOrders.map(o=>(
            <div key={o.id} style={{background:C.card,borderRadius:18,padding:"16px",marginBottom:12,border:`1px solid ${C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontFamily:PRICE_FONT,fontSize:14,fontWeight:800,color:C.primary,marginBottom:3}}>{orderId(o.id)}</div>
                  <div style={{fontSize:11.5,color:C.textSub}}>{fmtDate(o.placedAt)}</div>
                </div>
                <StatusBadge status={o.status}/>
              </div>
              {o.items.map((item,i)=>{
                const m=CAT_META[item.category]||CAT_META["Live Fish"];
                const prod=products.find(p=>p.id===item.id);
                const delivered = ["Confirmed","Shipped","Delivered"].includes(o.status);
                const already = reviewedSet.includes(item.id);
                return(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderTop:i===0?"none":`1px solid ${C.border}`}}>
                    <div style={{width:44,height:44,borderRadius:10,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,overflow:"hidden"}}>
                      {mediaCache["img-"+item.id]?<img src={mediaCache["img-"+item.id]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:m.emoji}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text}}>{item.name}</div>
                      <div style={{fontSize:11,color:C.textSub}}>
                        {item.variantLabel?<>{item.variantLabel} · </>:null}Qty {item.qty} · ₹{item.price*item.qty}
                      </div>
                    </div>
                    {delivered && prod && (
                      already
                        ? <span style={{fontSize:11,fontWeight:700,color:C.success,flexShrink:0}}>✓ Reviewed</span>
                        : <button className="press" onClick={()=>onWriteReview(prod, o.id)}
                            style={{background:C.accentLight,border:`1px solid ${C.accent}`,color:C.primary,borderRadius:10,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                            ★ Review
                          </button>
                    )}
                  </div>
                );
              })}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:8}}>
                <span style={{fontSize:12,color:C.textSub}}>Grand Total</span>
                <span style={{fontFamily:PRICE_FONT,fontSize:16,fontWeight:800,color:C.primary}}>₹{o.amountDue??(o.total+o.fee)}</span>
              </div>
              {o.etaDays!==""&&o.etaDays!=null&&["Confirmed","Shipped"].includes(o.status)&&!o.closed&&<div style={{fontSize:11.5,color:C.primary,fontWeight:700,marginTop:6}}>📦 Estimated delivery: in {o.etaDays} day{Number(o.etaDays)===1?"":"s"}</div>}
              {o.trackingNumber&&<div style={{fontSize:11,color:C.textSub,marginTop:6}}>Consignment: <b style={{color:C.text}}>{o.trackingNumber}</b>{o.courierName?<> · {o.courierName}</>:null}</div>}
              {(o.status==="Shipped"||o.status==="Delivered")&&o.courierTrackUrl&&(
                <button className="press" onClick={()=>trackParcel(o)}
                  style={{width:"100%",marginTop:8,background:"#0c2b30",color:"white",border:"none",borderRadius:10,padding:"10px",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                  🚚 Track Parcel{o.courierName?` · ${o.courierName}`:""}
                </button>
              )}
              {o.shippingReward&&(
                <div style={{marginTop:10,background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:12,padding:"11px 13px"}}>
                  <div style={{fontSize:12.5,fontWeight:800,color:"#15803d",marginBottom:3}}>🎁 Shipping refund — ₹{o.shippingReward.amount} added to your wallet!</div>
                  <div style={{fontSize:11.5,color:"#166534",lineHeight:1.55}}>Your parcel cost us less than you paid for shipping, so we've credited the difference to your 👛 wallet. Redeem it at checkout on any future order.</div>
                </div>
              )}
              {/* Bill button */}
              <div style={{display:"flex",gap:8,marginTop:10}}>
              <button className="press" onClick={()=>openBill(o,settings)}
                style={{flex:1,background:C.bg,color:C.primary,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                🧾 Quick Bill
              </button>
              <button className="press" onClick={()=>openInvoice(o,settings)}
                style={{flex:1,background:C.bg,color:C.primary,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                📄 Invoice (PDF)
              </button>
              </div>

              {/* Payment state */}
              {o.status==="Awaiting Payment"&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                  {payOpen===o.id?(
                    <PaymentPanel order={o} settings={settings} compact onSubmitPayment={onSubmitPayment} onCancelled={onCancelled}/>
                  ):(
                    <>
                      <div style={{background:"#fef3c7",border:`1px solid #fde68a`,borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.5}}>⏳ Payment pending — complete it to confirm this order (auto-cancels if unpaid).</div>
                      <button className="press" onClick={()=>setPayOpen(o.id)}
                        style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>💳 Complete Payment · ₹{o.amountDue??(o.total+o.fee)}</button>
                    </>
                  )}
                </div>
              )}
              {o.status==="Payment Review"&&(
                <div style={{marginTop:10,background:"#ede9fe",border:`1px solid #ddd6fe`,borderRadius:10,padding:"10px 12px",fontSize:12,color:"#6d28d9",fontWeight:600,lineHeight:1.5}}>🔎 Payment submitted{o.txnId?` (Ref: ${o.txnId})`:""} — under verification. We'll confirm within 1–2 days.</div>
              )}
              {o.status==="Cancelled"&&(
                <div style={{marginTop:10}}>
                  <div style={{background:"#fee2e2",border:`1px solid #fecaca`,borderRadius:10,padding:"10px 12px",fontSize:12.5,color:"#b91c1c",fontWeight:600,lineHeight:1.55}}>
                    ✕ Your order has been cancelled.{o.cancelReason?` Reason: ${o.cancelReason}.`:o.paymentStatus&&/unpaid/i.test(o.paymentStatus)?" Payment wasn't completed in time.":""}
                  </div>
                  {o.refund&&o.refund.due&&(
                    <div style={{marginTop:8,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"11px 12px",fontSize:12.5,color:"#1e3a8a",lineHeight:1.6}}>
                      <div style={{fontWeight:800,marginBottom:3}}>💸 Refund {o.refund.status==="refunded"?"completed":o.refund.status==="processing"?"in progress":"being arranged"}</div>
                      {o.refund.method==="gateway"?(
                        <div>A refund of <b>₹{o.refund.amount}</b> {o.refund.status==="refunded"?"has been":"is being"} returned automatically to your original payment method. Please allow 3–7 working days for it to reflect.</div>
                      ):(
                        <div>A refund of <b>₹{o.refund.amount}</b> {o.refund.status==="refunded"?"has been sent":"will be sent"} to your UPI / payment account.{o.refund.refundTxnId?<> Refund Reference: <b style={{fontFamily:"monospace"}}>{o.refund.refundTxnId}</b></>:o.refund.status!=="refunded"?<> We'll share the refund reference here once it's processed.</>:null}</div>
                      )}
                    </div>
                  )}
                  {o.refund&&o.refund.due===false&&(
                    <div style={{marginTop:8,fontSize:11.5,color:C.textSub,lineHeight:1.5}}>No payment was collected for this order, so there's nothing to refund.</div>
                  )}
                </div>
              )}
              {o.status==="Confirmed"&&(
                <div style={{marginTop:10,background:"#dcfce7",border:`1px solid #bbf7d0`,borderRadius:10,padding:"10px 12px",fontSize:12,color:"#15803d",fontWeight:600,lineHeight:1.5}}>✅ Payment verified — your order is confirmed &amp; being prepared!</div>
              )}
              {/* Dead-on-Arrival reporting — only for delivered orders that contained live fish */}
              {o.status==="Delivered" && o.items.some(it=>it.category==="Live Fish") && (
                <div style={{marginTop:10,borderTop:`1px dashed ${C.border}`,paddingTop:10}}>
                  {o.doa?(
                    <div style={{background:o.doa.status==="Declined"?"#fef2f2":(o.doa.status||"").startsWith("Approved")?"#ecfdf5":"#fff7ed",border:`1px solid ${o.doa.status==="Declined"?"#fecaca":(o.doa.status||"").startsWith("Approved")?"#a7f3d0":"#fed7aa"}`,borderRadius:10,padding:"11px 12px"}}>
                      <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:3}}>🐟 Dead-on-Arrival request</div>
                      <div style={{fontSize:11.5,color:C.textSub,lineHeight:1.55}}>{doaStatusText[o.doa.status]||"Submitted."}</div>
                      {o.doa.note&&<div style={{fontSize:11.5,color:C.text,marginTop:6,lineHeight:1.5}}><b>Note from store:</b> {o.doa.note}</div>}
                      {(o.doa.status==="Requested"||o.doa.status==="Under Review")&&(
                        <button className="press" onClick={()=>openWA(ownerWA,encodeURIComponent(`Hi, regarding my DOA request for order ${orderId(o.id)} — here is my unboxing video.`))}
                          style={{marginTop:8,background:"#25D366",color:"white",border:"none",borderRadius:9,padding:"8px 12px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>💬 Send video on WhatsApp</button>
                      )}
                    </div>
                  ):doaOpen===o.id?(
                    <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"13px"}}>
                      <div style={{fontSize:12.5,fontWeight:800,color:"#9a3412",marginBottom:6}}>Report Dead on Arrival (DOA)</div>
                      <div style={{fontSize:11.5,color:"#9a3412",lineHeight:1.6,marginBottom:10}}>If a fish arrived dead, send us ONE clear, unedited unboxing video (starting from the sealed package) on WhatsApp within 2 hours of delivery. We'll review it and, if approved, make it right <b>one time</b> — a replacement, store credit, or a refund of the fish amount.</div>
                      <div style={{display:"flex",gap:8}}>
                        <button className="press" onClick={()=>{ openWA(ownerWA,encodeURIComponent(`Hi, I received a Dead on Arrival (DOA) fish in order ${orderId(o.id)}. I'm sharing my unboxing video for review — please help with a replacement/refund.`)); onReportDoa&&onReportDoa(o); setDoaOpen(null); }}
                          style={{flex:1,background:"#25D366",color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>💬 Share video on WhatsApp</button>
                        <button className="press" onClick={()=>setDoaOpen(null)}
                          style={{background:"white",color:C.textSub,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <button className="press" onClick={()=>setDoaOpen(o.id)}
                      style={{background:"none",border:"none",padding:0,color:C.textSub,fontSize:11,fontWeight:600,fontFamily:"'Nunito',sans-serif",textDecoration:"underline",cursor:"pointer"}}>
                      Received a fish Dead on Arrival? Report DOA →
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          </>
        )}
      </div>
    </div>
  );
}

/* True when a product is expected to have a photo (so we can show a shimmer placeholder
   while its image is still hydrating from IndexedDB, instead of flashing the emoji then popping). */
function productExpectsImage(p){
  if(!p) return false;
  if(Array.isArray(p.media) && p.media.some(m=>m && m.type!=="video")) return true;
  return !!p.imageUrl;
}

/* ═══════════════════ PRODUCT CARD ═══════════════════ */
function ProductCard({product:p,imgSrc,onPress,onAdd,inCart=0,isFav=false,onFav,isInterested=false,onInterest}){
  const m   = CAT_META[p.category]||CAT_META["Live Fish"];
  const stk = typeof p.stockCount==="number" ? p.stockCount : DEFAULT_STOCK;
  const oos = stk<=0;
  const soon = !!p.comingSoon;
  const onSale = (p.discountPct||0) > 0;
  const eff = effectivePrice(p);
  const remaining = Math.max(0, stk - inCart);
  const Heart = onFav ? (
    <button className="press" onClick={e=>{e.stopPropagation();onFav(p);}} aria-label="Save"
      style={{position:"absolute",top:8,right:8,width:30,height:30,borderRadius:"50%",border:"none",background:"rgba(255,255,255,.9)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.18)"}}>
      <span style={{fontSize:16,lineHeight:1,color:isFav?C.coral:"#9ca3af"}}>{isFav?"♥":"♡"}</span>
    </button>
  ) : null;
  const ShareBtn = (
    <button className="press" onClick={e=>{e.stopPropagation();shareProduct(p);}} aria-label="Share"
      style={{position:"absolute",top:8,right:onFav?44:8,width:30,height:30,borderRadius:"50%",border:"none",background:"rgba(255,255,255,.9)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.18)"}}>
      <span style={{fontSize:14,lineHeight:1}}>🔗</span>
    </button>
  );
  return(
    <div className="lift" onClick={()=>onPress(p)}
      style={{background:C.card,borderRadius:18,overflow:"hidden",border:`1px solid ${C.border}`,cursor:"pointer"}}>
      <div style={{height:120,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",
        background:imgSrc?undefined:`linear-gradient(140deg,${m.c1},${m.c2})`}}>
        {imgSrc
          ? <SmoothImg src={imgSrc} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : productExpectsImage(p)
            ? <div className="shimmer-bar" style={{position:"absolute",inset:0}}/>
            : <span style={{fontSize:54}}>{m.emoji}</span>}
        {p.tag&&<span style={{position:"absolute",top:8,left:8,background:"rgba(0,0,0,.32)",color:"white",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,backdropFilter:"blur(4px)"}}>{p.tag}</span>}
        {onSale&&!soon&&<span style={{position:"absolute",bottom:8,left:8,background:C.coral,color:"white",fontSize:10,fontWeight:800,padding:"3px 8px",borderRadius:20}}>-{p.discountPct}%</span>}
        {Heart}
        {ShareBtn}
        {soon&&<div style={{position:"absolute",inset:0,background:"rgba(8,54,64,.55)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"white",fontSize:12,fontWeight:800,letterSpacing:1,background:"rgba(0,0,0,.3)",padding:"4px 12px",borderRadius:20}}>COMING SOON</span></div>}
        {!soon&&oos&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"white",fontSize:12,fontWeight:700}}>Sold Out</span></div>}
      </div>
      <div style={{padding:"14px 12px 12px"}}>
        <div style={{fontSize:9,color:C.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{p.category}</div>
        <div style={{fontSize:13,fontWeight:700,color:C.text,lineHeight:1.35,marginBottom:6,minHeight:34}}>{p.name}</div>
        {soon ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <div style={{fontSize:10.5,color:C.accent,fontWeight:700}}>Launching soon</div>
            <button className="press" onClick={e=>{e.stopPropagation();if(!isInterested&&onInterest)onInterest(p);}} disabled={isInterested}
              style={{background:isInterested?"#dcfce7":C.accent,color:isInterested?"#15803d":"white",border:"none",borderRadius:10,padding:"6px 12px",fontSize:11,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:isInterested?"default":"pointer"}}>
              {isInterested?"✓ Interested":"🔔 Interested"}
            </button>
          </div>
        ) : (<>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <div style={{fontFamily:PRICE_FONT,fontSize:16,fontWeight:800,color:C.primary}}>₹{eff}</div>
          {onSale&&<div style={{fontSize:11,color:C.textSub,textDecoration:"line-through"}}>₹{p.price}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:10,color:stk<=3?C.coral:C.textSub,fontWeight:700}}>
            {oos?"Out of stock":stk<=3?`Only ${stk} left`:`${stk} in stock`}
          </div>
          {inCart>0 ? (
            <div style={{display:"flex",alignItems:"center",background:C.primary,borderRadius:10,padding:"3px 4px",gap:4}}>
              <button onClick={e=>{e.stopPropagation();onAdd(p,-1);}}
                style={{background:"transparent",border:"none",color:"white",fontSize:16,fontWeight:700,width:22,height:22,lineHeight:1,cursor:"pointer"}}>−</button>
              <span style={{fontSize:12,fontWeight:800,color:"white",minWidth:14,textAlign:"center"}}>{inCart}</span>
              <button onClick={e=>{e.stopPropagation();if(remaining>0)onAdd(p,1);}} disabled={remaining<=0}
                style={{background:"transparent",border:"none",color:"white",fontSize:16,fontWeight:700,width:22,height:22,lineHeight:1,cursor:remaining>0?"pointer":"not-allowed",opacity:remaining>0?1:.45}}>+</button>
            </div>
          ) : (
            <button className="press" onClick={e=>{e.stopPropagation();if(!oos)onAdd(p,1);}} disabled={oos}
              style={{background:oos?"#e5e7eb":C.primary,color:"white",border:"none",borderRadius:10,padding:"6px 14px",fontSize:11.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:oos?"not-allowed":"pointer"}}>
              + Add
            </button>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8}}>
          {(p.reviewCount||0)>0 ? (
            <>
              {[1,2,3,4,5].map(s=><span key={s} className={s<=Math.round(p.ratingAvg||0)?"stars":"stars-dim"} style={{fontSize:11}}>★</span>)}
              <span style={{fontSize:11,color:C.textSub,marginLeft:2}}>{(p.ratingAvg||0).toFixed(1)} ({p.reviewCount})</span>
            </>
          ) : (
            <span style={{fontSize:11,color:C.textSub}}>No ratings yet</span>
          )}
        </div>
        {/* Flash sale countdown — shown when product has offerEndsAt in the future */}
        {!soon&&(p.discountPct||0)>0&&p.offerEndsAt&&new Date(p.offerEndsAt).getTime()>Date.now()&&(
          <MiniCountdown endsAt={p.offerEndsAt} compact/>
        )}
        </>)}
      </div>
    </div>
  );
}

/* ═══════════════════ CATEGORY DRAWER (left slide-in) ═══════════════════ */
function CategoryDrawer({open,onClose,onSelect,recent=[],onRecent,nav}){
  const go=(to)=>{ onClose&&onClose(); nav&&nav(to); };
  const COMPANY=[{label:"About Us",to:"about"},{label:"Care Guides",to:"guides"},{label:"Request a Product",to:"request"},{label:"Track My Orders",to:"orders"}];
  const POLICIES=[{label:"Live Guarantee",to:"policy-guarantee"},{label:"Returns & Refunds",to:"policy-returns"},{label:"Terms & Conditions",to:"policy-terms"},{label:"Privacy Policy",to:"policy-privacy"},{label:"Contact Us",to:"about"}];
  return(
    <div aria-hidden={!open} style={{position:"fixed",inset:0,zIndex:300,pointerEvents:open?"auto":"none"}}>
      {/* Scrim */}
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(7,32,35,.45)",opacity:open?1:0,transition:"opacity .28s ease",backdropFilter:open?"blur(2px)":"none"}}/>
      {/* Panel */}
      <div style={{position:"absolute",top:0,bottom:0,left:0,width:"78%",maxWidth:300,background:C.card,boxShadow:"6px 0 30px rgba(0,0,0,.25)",transform:open?"translateX(0)":"translateX(-104%)",transition:"transform .3s cubic-bezier(.4,0,.2,1)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
        <div style={{background:`linear-gradient(150deg,${C.primaryDark},${C.primary})`,padding:"46px 20px 18px",color:"white",position:"relative"}}>
          <button className="press" onClick={onClose} aria-label="Close menu"
            style={{position:"absolute",top:42,right:14,width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.18)",border:"none",color:"white",fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800}}>Browse</div>
          <div style={{fontSize:11.5,color:"rgba(255,255,255,.8)",marginTop:2}}>Shop by category</div>
        </div>
        <div style={{padding:"12px 12px 18px"}}>
          <button className="press" onClick={()=>onSelect("All")}
            style={{display:"flex",alignItems:"center",gap:13,width:"100%",background:"transparent",border:"none",borderRadius:13,padding:"13px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left"}}>
            <span style={{fontSize:22,width:28,textAlign:"center"}}>🌊</span>
            <span style={{fontSize:14.5,fontWeight:800,color:C.text}}>All Products</span>
          </button>
          {CATEGORIES.map(cat=>(
            <button key={cat} className="press" onClick={()=>onSelect(cat)}
              style={{display:"flex",alignItems:"center",gap:13,width:"100%",background:"transparent",border:"none",borderTop:`1px solid ${C.border}`,padding:"13px 12px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left"}}>
              <span style={{fontSize:22,width:28,textAlign:"center"}}>{CAT_META[cat].emoji}</span>
              <span style={{fontSize:14.5,fontWeight:700,color:C.text}}>{cat}</span>
              <span style={{marginLeft:"auto",color:C.textSub,fontSize:16}}>›</span>
            </button>
          ))}
          {recent.length>0&&(
            <div style={{marginTop:18,paddingTop:6}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px",marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.6}}>Recent searches</span>
                <button className="press" onClick={()=>onRecent&&onRecent(null)} style={{background:"none",border:"none",color:C.textSub,fontSize:10.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>Clear</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,padding:"0 12px"}}>
                {recent.map(r=>(
                  <button key={r} className="press" onClick={()=>onRecent&&onRecent(r)}
                    style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:600,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
                    🔍 {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {nav&&(
            <div style={{marginTop:18,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              <div style={{fontSize:11,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.6,padding:"0 12px",marginBottom:4}}>Company</div>
              {COMPANY.map(l=>(
                <button key={l.label} className="press" onClick={()=>go(l.to)}
                  style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:"9px 12px",fontSize:13.5,fontWeight:700,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>{l.label}</button>
              ))}
              <div style={{fontSize:11,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.6,padding:"0 12px",margin:"10px 0 4px"}}>Policies</div>
              {POLICIES.map(l=>(
                <button key={l.label} className="press" onClick={()=>go(l.to)}
                  style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:"9px 12px",fontSize:13.5,fontWeight:700,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>{l.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ HOME PAGE ═══════════════════ */
function HomePage({nav,products,mediaCache,addToCart,cartMap,setCategory,onSecretTap,setQuery,query,user,settings={},settingsReady=true,favorites=[],onFav,interestedSet=[],onInterest,orders=[],showcase=[],onShowcaseSubmit,restockSet=[],onRestock,walletPts=0,testimonials=[],onTestimonialSubmit}){
  const featured=products.slice(0,6);
  const [menuOpen,setMenuOpen]=useState(false);
  const [recent,setRecent]=useState(()=>loadRecentSearches());
  const related=useMemo(()=>relatedProducts(products,recent,null,6),[products,recent]);
  const recentlyViewed=useMemo(()=>loadRecentlyViewed().map(id=>products.find(p=>p.id===id)).filter(Boolean).slice(0,10),[products]);
  const handleRecent=(r)=>{
    if(r===null){ clearRecentSearches(); setRecent([]); return; }
    setMenuOpen(false); setQuery(r); nav("shop");
  };
  const offer = products.find(p=>(p.discountPct||0)>0 && p.offerEndsAt && new Date(p.offerEndsAt).getTime()>Date.now());
  const offerStock = offer ? (offer.stockCount ?? DEFAULT_STOCK) : 0;
  return(
    <div className="slide-up">
      <CategoryDrawer open={menuOpen} onClose={()=>setMenuOpen(false)} recent={recent} nav={nav}
        onSelect={(cat)=>{ setMenuOpen(false); setCategory(cat); nav("shop"); }}
        onRecent={handleRecent}/>
      {/* Hero */}
      <div className="home-hero" style={{background:`linear-gradient(165deg,${C.primaryDark} 0%,${C.primary} 55%,${C.accent} 100%)`,
        padding:"42px 22px 30px",borderRadius:"0 0 32px 32px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-50,right:-40,width:180,height:180,borderRadius:"50%",border:"2px solid rgba(255,255,255,.08)"}}/>
        <div style={{position:"absolute",top:40,right:50,width:70,height:70,borderRadius:"50%",border:"2px solid rgba(255,255,255,.1)"}}/>
        <div style={{position:"absolute",bottom:-50,left:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,.05)"}}/>

        {/* Hamburger — opens category drawer */}
        <button className="press home-hero-chrome" onClick={()=>setMenuOpen(true)} aria-label="Browse categories"
          style={{position:"absolute",top:46,left:16,width:38,height:38,borderRadius:12,background:"rgba(255,255,255,.16)",border:"1px solid rgba(255,255,255,.28)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",zIndex:3}}>
          <span style={{width:17,height:2,background:"white",borderRadius:2}}/>
          <span style={{width:17,height:2,background:"white",borderRadius:2}}/>
          <span style={{width:17,height:2,background:"white",borderRadius:2}}/>
        </button>
        {/* Account chip */}
        <div className="home-hero-chrome" style={{position:"absolute",top:46,right:16,display:"flex",alignItems:"center",gap:8}}>
          {user&&settings.loyaltyEnabled!==false&&(
            <button className="press" onClick={()=>nav("orders")} title="Your wallet"
              style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.16)",border:"1px solid rgba(255,255,255,.28)",borderRadius:30,padding:"7px 12px",color:"white",fontFamily:"'Nunito',sans-serif",backdropFilter:"blur(8px)",cursor:"pointer"}}>
              <span style={{fontSize:14,lineHeight:1}}>👛</span>
              <span style={{fontSize:12.5,fontWeight:800,fontFamily:"'Baloo 2',sans-serif"}}>{walletPts}</span>
            </button>
          )}
          <button className="press" onClick={()=>nav("orders")}
            style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,.16)",border:"1px solid rgba(255,255,255,.28)",borderRadius:30,padding:"6px 12px 6px 6px",color:"white",fontFamily:"'Nunito',sans-serif",backdropFilter:"blur(8px)",cursor:"pointer"}}>
            <span style={{width:26,height:26,borderRadius:"50%",background:"rgba(255,255,255,.9)",color:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800}}>
              {user?(user.name||"U").charAt(0).toUpperCase():"👤"}
            </span>
            <span style={{fontSize:12,fontWeight:700}}>{user?(user.name||"").split(" ")[0]||"Account":"Sign in"}</span>
          </button>
        </div>

        {/* Real Nemo logo — secret tap target */}
        <div onClick={onSecretTap} className="home-hero-logo"
          style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"default",userSelect:"none",WebkitTapHighlightColor:"transparent",marginBottom:16,marginTop:8}}>
          <div style={{width:"min(264px,74%)",aspectRatio:"600 / 311",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <img src={STORE_LOGO} alt="Nemo Aqua Store" onError={e=>{if(!e.target.dataset.fb){e.target.dataset.fb='1';e.target.src=NEMO_FALLBACK;}}} style={{width:"100%",height:"100%",objectFit:"contain",filter:"drop-shadow(0 6px 14px rgba(0,0,0,.28))"}}/>
          </div>
        </div>

        {/* Tagline */}
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:27,fontWeight:700,color:"white",lineHeight:1.15,marginBottom:6,textWrap:"balance",textAlign:"center"}}>
          Bring Colour to Your Life
        </div>
        <div style={{fontSize:13,color:"rgba(255,255,255,.78)",marginBottom:0,textAlign:"center"}}>
          Quality Fishes · Plants · Accessories
        </div>
      </div>

      {/* Search bar — right below logo banner, overlapping hero edge */}
      <div className="home-search" style={{padding:"0 16px",marginTop:-22,marginBottom:18,position:"relative",zIndex:2}}>
        <div onClick={()=>nav("shop")}
          style={{display:"flex",alignItems:"center",gap:10,background:C.card,borderRadius:16,padding:"14px 16px",border:`1.5px solid ${C.border}`,boxShadow:"0 8px 24px rgba(11,110,114,.12)",cursor:"pointer"}}>
          <span style={{fontSize:18}}>🔍</span>
          <input type="text" placeholder="Search fish, plants, accessories…"
            value={query} onChange={e=>setQuery(e.target.value)}
            onFocus={()=>nav("shop")}
            style={{border:"none",background:"transparent",outline:"none",flex:1,fontSize:14}}/>
        </div>
        {recent.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:7,overflowX:"auto",marginTop:10,paddingBottom:2,WebkitOverflowScrolling:"touch"}}>
            <span style={{fontSize:11,color:C.textSub,fontWeight:700,flexShrink:0}}>Recent:</span>
            {recent.slice(0,6).map(r=>(
              <button key={r} className="press" onClick={()=>{setQuery(r);nav("shop");}}
                style={{flexShrink:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer",whiteSpace:"nowrap"}}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="home-body" style={{padding:"0 16px 100px"}}>
        {/* Seasonal / festival banner */}
        <FestivalBanner settings={settings}/>

        {/* First-order welcome coupon */}
        {settingsReady&&<WelcomeBanner settings={settings} orders={orders}/>}

        {/* Categories */}
        {/* Recently viewed — replaces the old category grid */}
        {recentlyViewed.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}>
            <span style={{fontSize:18}}>🕒</span>
            <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text}}>Recently Viewed</span>
          </div>
          <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:6,margin:"0 -16px",padding:"0 16px 6px",WebkitOverflowScrolling:"touch"}}>
            {recentlyViewed.map(p=>(
              <div key={p.id} style={{flexShrink:0,width:150}}>
                <ProductCard product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                  onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                  isFav={favorites.includes(p.id)} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Limited time offer */}
        {offer&&(
          <div style={{marginBottom:26}}>
            <CountdownBanner
              endsAt={offer.offerEndsAt}
              title="Limited Time Offer"
              subtitle={`${offer.discountPct}% off ${offer.name} — don't miss out!`}
              stockNote={offerStock<=10?`Only ${offerStock} items left in stock!`:null}
              onShop={()=>nav("detail",offer)}/>
          </div>
        )}

        {/* Related to your recent searches */}
        {related.length>0&&(
          <div style={{marginBottom:26}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}>
              <span style={{fontSize:18}}>✨</span>
              <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text}}>Based on Your Searches</span>
            </div>
            <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:6,margin:"0 -16px",padding:"0 16px 6px",WebkitOverflowScrolling:"touch"}}>
              {related.map(p=>(
                <div key={p.id} style={{flexShrink:0,width:150}}>
                  <ProductCard product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                    onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                    isFav={favorites.includes(p.id)} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Featured */}
        <div style={{marginBottom:26}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text}}>Featured</span>
            <button className="press" onClick={()=>nav("shop")} style={{fontSize:12,color:C.accent,fontWeight:700,background:"none",border:"none",fontFamily:"'Nunito',sans-serif"}}>View All →</button>
          </div>
          <div className="prod-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {featured.map(p=>(
              <ProductCard key={p.id} product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                isFav={favorites.includes(p.id)} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
            ))}
          </div>
        </div>

        {/* Customer Tank Showcase */}
        <TankShowcaseSection showcase={showcase} user={user} settings={settings} onSubmit={onShowcaseSubmit}/>

        {/* Testimonials — any signed-in customer can post */}
        {settings.testimonialsEnabled!==false&&<TestimonialsSection testimonials={testimonials} user={user} onSubmit={onTestimonialSubmit} onSignIn={()=>nav("orders")}/>}

        {/* Free delivery banner — only shown when admin has set a threshold */}
        {Number(settings.freeDeliveryThreshold) > 0 && (
        <div style={{background:`linear-gradient(135deg,${C.accent},${C.primary})`,borderRadius:20,padding:"18px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"white",marginBottom:14}}>
          <div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,marginBottom:4}}>Free Delivery</div>
            <div style={{fontSize:12,opacity:.88,marginBottom:12}}>On orders above ₹{settings.freeDeliveryThreshold}</div>
            <button className="press" onClick={()=>nav("shop")} style={{background:"white",color:C.primary,border:"none",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Shop Now</button>
          </div>
          <div style={{fontSize:60,userSelect:"none"}}>🚚</div>
        </div>
        )}

        {/* Care Guides + Request */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
          <button className="press" onClick={()=>nav("guides")}
            style={{background:`linear-gradient(150deg,${C.primaryDark},${C.primary})`,border:"none",borderRadius:18,padding:"16px 14px",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left",color:"white"}}>
            <span style={{fontSize:28}}>📖</span>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,lineHeight:1.2}}>Care Guides</div>
            <div style={{fontSize:11,opacity:.85,lineHeight:1.4}}>Tips &amp; guides for a healthy tank</div>
          </button>
          <button className="press" onClick={()=>nav("request")}
            style={{background:C.card,border:`1.5px dashed ${C.accent}`,borderRadius:18,padding:"16px 14px",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,cursor:"pointer",fontFamily:"'Nunito',sans-serif",textAlign:"left"}}>
            <span style={{fontSize:28}}>🔎</span>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:C.text,lineHeight:1.2}}>Request a Product</div>
            <div style={{fontSize:11,color:C.textSub,lineHeight:1.4}}>Can't find it? We'll source it</div>
          </button>
        </div>

        {/* ── Site footer (desktop only — on mobile these links live in the side menu) ── */}
        <div className="home-footer" style={{margin:"28px -16px 0",background:C.card,borderTop:`3px solid ${C.primary}`,padding:"26px 18px 22px"}}>
          {/* Brand + tagline */}
          <div style={{marginBottom:22}}>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:18,fontWeight:800,color:C.text}}>{STORE_NAME} Aqua Store</div>
            <div style={{fontSize:12,color:C.textSub,marginTop:3,lineHeight:1.5,maxWidth:300}}>Hand-picked healthy fish, live plants &amp; quality accessories — delivered with care across India.</div>
          </div>

          {/* Link columns */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"22px 16px",marginBottom:22}}>
            <div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,marginBottom:8}}>Shop</div>
              {CATEGORIES.map(cat=>(
                <button key={cat} className="press" onClick={()=>{setCategory(cat);nav("shop");}}
                  style={{display:"flex",alignItems:"center",gap:7,background:"none",border:"none",padding:"5px 0",fontSize:13,fontWeight:600,color:C.textSub,fontFamily:"'Nunito',sans-serif",textAlign:"left",cursor:"pointer",width:"100%"}}>
                  <span style={{fontSize:14}}>{CAT_META[cat].emoji}</span>{cat}
                </button>
              ))}
            </div>
            <div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,marginBottom:8}}>Company</div>
              {[
                {label:"About Us",to:"about"},
                {label:"Care Guides",to:"guides"},
                {label:"Request a Product",to:"request"},
                {label:"Track My Orders",to:"orders"},
              ].map(l=>(
                <button key={l.label} className="press" onClick={()=>nav(l.to)}
                  style={{display:"block",background:"none",border:"none",padding:"5px 0",fontSize:13,fontWeight:600,color:C.textSub,fontFamily:"'Nunito',sans-serif",textAlign:"left",cursor:"pointer",width:"100%"}}>
                  {l.label}
                </button>
              ))}
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,margin:"14px 0 8px"}}>Policies</div>
              {[
                {label:"Live Guarantee",to:"policy-guarantee"},
                {label:"Returns & Refunds",to:"policy-returns"},
                {label:"Terms & Conditions",to:"policy-terms"},
                {label:"Privacy Policy",to:"policy-privacy"},
              ].map(l=>(
                <button key={l.label} className="press" onClick={()=>nav(l.to)}
                  style={{display:"block",background:"none",border:"none",padding:"5px 0",fontSize:13,fontWeight:600,color:C.textSub,fontFamily:"'Nunito',sans-serif",textAlign:"left",cursor:"pointer",width:"100%"}}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18,marginBottom:18}}>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,marginBottom:10}}>Contact Us</div>
            {settings.storeAddress&&(
              <div style={{fontSize:12.5,color:C.textSub,lineHeight:1.6,marginBottom:8,display:"flex",gap:7}}>
                <span>📍</span><span>{settings.storeAddress}</span>
              </div>
            )}
            {settings.storeHours&&(
              <div style={{fontSize:12.5,color:C.textSub,marginBottom:8,display:"flex",gap:7}}><span>🕒</span><span>{settings.storeHours}</span></div>
            )}
            {settings.ownerWhatsapp&&(
              <a href={`https://wa.me/${settings.ownerWhatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener"
                style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:"#25965a",textDecoration:"none",marginBottom:8}}>
                <span style={{fontSize:14}}>💬</span> +{settings.ownerWhatsapp.replace(/\D/g,"")}
              </a>
            )}
            <a href={`mailto:${settings.orderEmail||BUSINESS_EMAIL}`}
              style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:C.accent,textDecoration:"none"}}>
              <span style={{fontSize:14}}>✉️</span> {settings.orderEmail||BUSINESS_EMAIL}
            </a>
          </div>

          {/* Follow us */}
          {(settings.instagramUrl||settings.facebookUrl||settings.ownerWhatsapp)&&(
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18,marginBottom:18}}>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,marginBottom:10}}>Follow Us</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                {settings.instagramUrl&&(
                  <a href={settings.instagramUrl} target="_blank" rel="noopener" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,color:"#c13584",textDecoration:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 12px"}}>📷 Instagram</a>
                )}
                {settings.facebookUrl&&(
                  <a href={settings.facebookUrl} target="_blank" rel="noopener" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,color:"#1877f2",textDecoration:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 12px"}}>👍 Facebook</a>
                )}
                {settings.ownerWhatsapp&&(
                  <a href={`https://wa.me/${settings.ownerWhatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,color:"#25965a",textDecoration:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 12px"}}>💬 WhatsApp</a>
                )}
              </div>
            </div>
          )}

          {/* Secure payment */}
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18,marginBottom:18}}>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:C.text,marginBottom:10}}>Secure Payment</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {["UPI","VISA","Mastercard","RuPay"].map(b=>(
                <span key={b} style={{fontSize:11,fontWeight:800,letterSpacing:.3,color:C.textSub,background:C.bg||"#f1f7f7",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 11px"}}>{b}</span>
              ))}
            </div>
          </div>

          <div style={{fontSize:10.5,color:C.textSub,opacity:.75,lineHeight:1.5}}>© {new Date().getFullYear()} {STORE_NAME} Aqua Store. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ SHOP PAGE ═══════════════════ */
function ShopPage({nav,products,mediaCache,query,setQuery,category,setCategory,addToCart,cartMap,favorites=[],onFav,interestedSet=[],onInterest,restockSet=[],onRestock}){
  const [sort,setSort]=useState("relevance");
  const [availability,setAvailability]=useState("all");
  const [recent,setRecent]=useState(()=>loadRecentSearches());
  // Record the search term once the user stops typing
  useEffect(()=>{ const q=(query||"").trim(); if(q.length<2) return; const t=setTimeout(()=>setRecent(addRecentSearch(q)),900); return ()=>clearTimeout(t); },[query]);
  const priceCap = useRef(Math.max(2500, ...products.map(p=>p.price))).current;
  const [priceMax,setPriceMax]=useState(priceCap);
  const [sheet,setSheet]=useState(false);

  let list = products.filter(p=>{
    if(category!=="All" && p.category!==category) return false;
    if(query){
      const q=query.toLowerCase();
      if(!p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q) && !(p.desc||"").toLowerCase().includes(q)) return false;
    }
    const stk = p.stockCount ?? DEFAULT_STOCK;
    if(availability==="instock" && stk<=0) return false;
    if(availability==="limited" && (stk<=0 || stk>3)) return false;
    if(effectivePrice(p) > priceMax) return false;
    return true;
  });
  list = [...list].sort((a,b)=>{
    if(sort==="price-asc")  return effectivePrice(a)-effectivePrice(b);
    if(sort==="price-desc") return effectivePrice(b)-effectivePrice(a);
    if(sort==="name")       return a.name.localeCompare(b.name);
    if(sort==="rating")     return (b.rating||0)-(a.rating||0);
    if(sort==="new")        return (b.createdAt||"").localeCompare(a.createdAt||"");
    return 0;
  });

  const activeFilters = (availability!=="all"?1:0) + (priceMax<priceCap?1:0) + (sort!=="relevance"?1:0);

  return(
    <div className="slide-up">
      <div className="vh-head shop-bar" style={{background:C.card,padding:"52px 14px 10px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,color:C.text,flexShrink:0}}>Shop</div>
          <div style={{display:"flex",alignItems:"center",background:C.bg,borderRadius:12,padding:"8px 12px",gap:8,flex:1,minWidth:0,border:`1.5px solid ${C.border}`}}>
            <span style={{fontSize:15}}>🔍</span>
            <input type="text" placeholder="Search…" value={query} onChange={e=>setQuery(e.target.value)}
              style={{border:"none",background:"transparent",outline:"none",flex:1,fontSize:13,minWidth:0}}/>
            {query&&<button className="press" onClick={()=>setQuery("")} style={{background:"none",border:"none",fontSize:15,color:C.textSub}}>✕</button>}
          </div>
          <button className="press" onClick={()=>setSheet(true)}
            style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,background:activeFilters>0?C.primary:C.card,border:`1.5px solid ${activeFilters>0?C.primary:C.border}`,borderRadius:12,padding:"9px 13px",fontSize:12.5,fontWeight:700,color:activeFilters>0?"white":C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            Filter &amp; Sort{activeFilters>0&&<span style={{background:"rgba(255,255,255,.25)",borderRadius:10,padding:"1px 6px",fontSize:10}}>{activeFilters}</span>}
          </button>
        </div>
        <CategoryPills selected={category} onSelect={setCategory} all/>
      </div>
      <div style={{padding:"14px 16px 100px"}}>
        {!query&&recent.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.5}}>Recent searches</span>
              <button className="press" onClick={()=>{clearRecentSearches();setRecent([]);}} style={{background:"none",border:"none",color:C.textSub,fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>Clear</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {recent.map(r=>(
                <button key={r} className="press" onClick={()=>setQuery(r)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"7px 13px",fontSize:12.5,fontWeight:600,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
                  🔍 {r}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{fontSize:12,color:C.textSub,fontWeight:500,marginBottom:14}}>
          {list.length} product{list.length!==1?"s":""}{category!=="All"?` in ${category}`:""}{query?` for "${query}"`:""}
        </div>
        {list.length===0?(
          <div style={{textAlign:"center",padding:"50px 20px",color:C.textSub}}>
            <div style={{fontSize:52,marginBottom:14}}>🌊</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No products found</div>
            <div style={{fontSize:12}}>Try adjusting your filters</div>
          </div>
        ):(
          <div className="prod-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {list.map(p=>(
              <div key={p.id}>
                <ProductCard product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                  onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                  isFav={favorites.includes(p.id)} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
                <RestockBtn product={p} user={null} restockSet={restockSet} onSubscribe={onRestock}/>
              </div>
            ))}
          </div>
        )}
        {/* Related products — keyword matches outside the current result set */}
        {query.trim()&&(()=>{
          const inList=new Set(list.map(p=>p.id));
          const rel=relatedProducts(products,[query],null,8).filter(p=>!inList.has(p.id));
          if(!rel.length) return null;
          return(
            <div style={{marginTop:28}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}>
                <span style={{fontSize:18}}>✨</span>
                <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,color:C.text}}>You might also like</span>
              </div>
              <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:6,margin:"0 -16px",padding:"0 16px 6px",WebkitOverflowScrolling:"touch"}}>
                {rel.map(p=>(
                  <div key={p.id} style={{flexShrink:0,width:150}}>
                    <ProductCard product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                      onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                      isFav={favorites.includes(p.id)} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
      <SortFilterSheet open={sheet} onClose={()=>setSheet(false)}
        sort={sort} setSort={setSort}
        priceMax={priceMax} priceCap={priceCap} setPriceMax={setPriceMax}
        availability={availability} setAvailability={setAvailability}
        onClear={()=>{setSort("relevance");setPriceMax(priceCap);setAvailability("all");}}
        count={list.length}/>
    </div>
  );
}

/* ═══════════════════ DETAIL PAGE ═══════════════════ */
function DetailPage({product:p,media={images:[],video:null},addToCart,cart=[],nav,prevPage="shop",user,orders,goAuth,onReviewsChanged,onReviewed,autoReview,isFav=false,onFav,isInterested=false,onInterest,restockSet=[],onRestock}){
  const [qty,setQty]           = useState(1);
  const [selVarId,setSelVarId] = useState(null);
  const [tab,setTab]           = useState("desc");
  const [reviews,setReviews]   = useState([]);
  const [loadingRev,setLoadingRev] = useState(true);
  const [showForm,setShowForm] = useState(false);
  const [submitted,setSubmitted]= useState(false);
  const [slide,setSlide]       = useState(0); // active gallery slide
  const [justAdded,setJustAdded] = useState(false);

  useEffect(()=>{
    setLoadingRev(true);
    setReviews([]);
    setShowForm(false);
    setSubmitted(false);
    pushRecentlyViewed(p.id);
    loadReviews(p.id).then(r=>{ setReviews(r); setLoadingRev(false); if((r.length||0)!==(p.reviewCount||0)) onReviewsChanged && onReviewsChanged(p.id, r); });
    setSlide(0);
    // Auto-open the review form when the customer tapped "Rate" from their orders
    if(autoReview && user && hasPurchased(orders, user, p.id)){ setTab("reviews"); setShowForm(true); }
  },[p.id]);

  // Build ordered slides: images first, then video
  const slides = [
    ...media.images.map(src=>({type:"image",src})),
    ...(media.video?[{type:"video",src:media.video}]:[]),
  ];

  if(!p)return null;
  const m   = CAT_META[p.category]||CAT_META["Live Fish"];
  const stk = p.stockCount ?? DEFAULT_STOCK;
  const oos = stk<=0;
  const variants = productVariants(p);
  const selVar = variants ? (variants.find(v=>v.id===selVarId && !v.soldOut) || variants.find(v=>!v.soldOut) || variants[0]) : null;
  const onSale = (p.discountPct||0)>0;
  const baseEff = effectivePrice(p);
  const unitPrice = selVar ? variantEffPrice(p, selVar) : baseEff;
  const maxQty = Math.max(1, Math.min(stk, MAX_PER_ORDER));
  // How many of THIS product + selected variant are already in the cart (same key format as addToCart)
  const cartKey = p.id + (selVar?("|"+selVar.id):"");
  const inCart = (cart.find(i=>i.key===cartKey)?.qty) || 0;
  const canReview = user && hasPurchased(orders, user, p.id);

  // Live rating from real reviews only
  const avgRating = reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0;
  const revCount  = reviews.length;

  const handleNewReview=async(rev)=>{
    const next=await appendReview(p.id,{...rev,uid:userKey(user)||""});
    setReviews(next);
    onReviewsChanged && onReviewsChanged(p.id, next);
    onReviewed && onReviewed(p.id);
    setShowForm(false);
    setSubmitted(true);
    setTimeout(()=>setSubmitted(false),3000);
  };

  return(
    <div className="slide-up">
      {/* Hero media gallery */}
      <div style={{position:"relative",background:slides.length?"#000":`linear-gradient(155deg,${m.c1},${m.c2})`}}>
        <div style={{height:300,display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch"}}
          onScroll={e=>{ const i=Math.round(e.target.scrollLeft/e.target.clientWidth); if(i!==slide)setSlide(i); }}>
          {slides.length===0 && (
            <div style={{minWidth:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:110,userSelect:"none"}}>{m.emoji}</span>
            </div>
          )}
          {slides.map((s,i)=>(
            <div key={i} style={{minWidth:"100%",height:"100%",scrollSnapAlign:"start",display:"flex",alignItems:"center",justifyContent:"center",background:"#000"}}>
              {s.type==="video"
                ? <video src={s.src} controls playsInline loop style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                : <SmoothImg src={s.src} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
            </div>
          ))}
        </div>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.3) 0%,transparent 35%)",pointerEvents:"none"}}/>
        <button className="press" onClick={()=>nav(prevPage)}
          style={{position:"absolute",top:50,left:16,background:"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.35)",borderRadius:12,width:40,height:40,color:"white",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>←</button>
        {slides.length>1&&(
          <div style={{position:"absolute",bottom:36,left:0,right:0,display:"flex",justifyContent:"center",gap:6,pointerEvents:"none"}}>
            {slides.map((s,i)=>(
              <div key={i} style={{width:i===slide?20:7,height:7,borderRadius:20,background:i===slide?"white":"rgba(255,255,255,.5)",transition:"width .2s"}}/>
            ))}
          </div>
        )}
        {slides[slide]&&<span style={{position:"absolute",top:50,right:16,background:"rgba(0,0,0,.4)",color:"white",fontSize:11,fontWeight:700,padding:"5px 12px",borderRadius:20,backdropFilter:"blur(6px)"}}>
          {slides[slide].type==="video"?"▶ Video":`📷 ${slide+1}/${slides.length}`}
        </span>}
      </div>

      {/* Content */}
      <div style={{background:C.bg,borderRadius:"26px 26px 0 0",marginTop:-24,padding:"24px 20px 180px",minHeight:400}}>
        {/* Title row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{flex:1,paddingRight:12}}>
            <div style={{fontSize:10,color:C.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>{p.category}</div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:23,fontWeight:800,color:C.text,lineHeight:1.2}}>{p.name}</div>
            <button className="press" onClick={()=>shareProduct(p)}
              style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,background:C.accentLight,border:`1px solid ${C.border}`,color:C.primary,borderRadius:20,padding:"5px 12px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Share
            </button>
            <button className="press" onClick={()=>onFav&&onFav(p)}
              style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,marginLeft:8,background:isFav?"#fff1ee":C.accentLight,border:`1px solid ${isFav?C.coral:C.border}`,color:isFav?C.coral:C.primary,borderRadius:20,padding:"5px 12px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              <span style={{fontSize:13,lineHeight:1}}>{isFav?"♥":"♡"}</span>{isFav?"Saved":"Save"}
            </button>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:PRICE_FONT,fontSize:24,fontWeight:800,color:C.primary}}>₹{unitPrice}</div>
            {onSale&&<div style={{fontSize:13,color:C.textSub,textDecoration:"line-through"}}>₹{selVar?variantBasePrice(p,selVar):p.price}</div>}
            <div style={{marginTop:5}}><StockBadge stockCount={stk}/></div>
          </div>
        </div>

        {/* Live rating row */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:onSale&&p.offerEndsAt&&new Date(p.offerEndsAt).getTime()>Date.now()?10:20}}>
          {revCount>0 ? (
            <>
              <ReviewStars value={Math.round(avgRating)} size={16}/>
              <span style={{fontSize:14,fontWeight:700,color:C.text}}>{avgRating.toFixed(1)}</span>
              <button className="press" onClick={()=>setTab("reviews")}
                style={{fontSize:12,color:C.textSub,background:"none",border:"none",fontFamily:"'Nunito',sans-serif",textDecoration:"underline"}}>
                ({revCount} review{revCount!==1?"s":""})
              </button>
            </>
          ) : (
            <>
              <ReviewStars value={0} size={16}/>
              <span style={{fontSize:13,color:C.textSub}}>No ratings yet — be the first to review</span>
            </>
          )}
        </div>

        {/* Flash sale countdown on detail page */}
        {onSale&&p.offerEndsAt&&new Date(p.offerEndsAt).getTime()>Date.now()&&(
          <MiniCountdown endsAt={p.offerEndsAt} compact={false}/>
        )}

        {/* Variant picker for Live Fish */}
        {variants && <VariantPicker product={p} variants={variants} selectedId={selVar?.id} onSelect={v=>setSelVarId(v.id)}/>}

        {/* Restock alert for out-of-stock products */}
        <RestockBtn product={p} user={user} restockSet={restockSet} onSubscribe={onRestock}/>

        <div style={{display:"flex",gap:4,marginBottom:18,background:C.card,borderRadius:14,padding:4,border:`1px solid ${C.border}`}}>
          {["desc","reviews"].map(t=>(
            <button key={t} className="press" onClick={()=>setTab(t)}
              style={{flex:1,padding:"9px 8px",borderRadius:11,border:"none",background:tab===t?C.primary:"transparent",color:tab===t?"white":C.textSub,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",transition:"all .2s",position:"relative"}}>
              {t==="desc"?"Description":`Reviews`}
              {t==="reviews"&&reviews.length>0&&<span style={{marginLeft:5,background:tab==="reviews"?"rgba(255,255,255,.25)":C.primary,color:"white",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>
                {reviews.length}
              </span>}
            </button>
          ))}
        </div>

        {/* Description tab */}
        {tab==="desc"&&(
          <div className="fade-in" style={{fontSize:13.5,color:C.textSub,lineHeight:1.75}}>{p.desc}</div>
        )}

        {/* Reviews tab */}
        {tab==="reviews"&&(
          <div className="fade-in">
            {/* Success banner */}
            {submitted&&(
              <div style={{background:"#dcfce7",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,border:"1px solid #86efac"}}>
                <span style={{fontSize:20}}>🎉</span>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#15803d"}}>Review submitted!</div>
                  <div style={{fontSize:11,color:"#166534"}}>Thank you for sharing your feedback.</div>
                </div>
              </div>
            )}

            {/* Rating summary — only when there are real reviews */}
            {reviews.length>0&&<RatingSummary reviews={reviews} avgRating={avgRating}/>}

            {/* Write a review CTA — only verified purchasers */}
            {!showForm&&!submitted&&(
              canReview ? (
                <button className="press" onClick={()=>setShowForm(true)}
                  style={{width:"100%",background:C.card,border:`1.5px dashed ${C.accent}`,borderRadius:16,padding:"14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
                  <span style={{fontSize:20}}>✏️</span>
                  <span style={{fontSize:14,fontWeight:700,color:C.accent}}>Write a Review</span>
                </button>
              ) : (
                <div style={{background:C.accentLight,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:22}}>🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12.5,fontWeight:700,color:C.text,marginBottom:2}}>Only verified buyers can review</div>
                    <div style={{fontSize:11.5,color:C.textSub,lineHeight:1.5}}>
                      {user ? "Review unlocks once you've ordered & received this product." : "Sign in and purchase this product to leave a review."}
                    </div>
                    {!user&&<button className="press" onClick={goAuth} style={{marginTop:8,background:C.primary,color:"white",border:"none",borderRadius:10,padding:"7px 14px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Sign in</button>}
                  </div>
                </div>
              )
            )}

            {/* Review form */}
            {showForm&&<ReviewForm onSubmit={handleNewReview} onCancel={()=>setShowForm(false)} user={user} orderId={null}/>}

            {/* Reviews list */}
            {loadingRev?(
              <div style={{display:"flex",justifyContent:"center",padding:"24px"}}><Spinner/></div>
            ):reviews.length===0?(
              <div style={{textAlign:"center",padding:"32px 16px",color:C.textSub}}>
                <div style={{fontSize:44,marginBottom:12}}>⭐</div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No reviews yet</div>
                <div style={{fontSize:13}}>Be the first to share your experience!</div>
              </div>
            ):(
              reviews.map((r,i)=>(
                <div key={r.id||i} className="fade-in" style={{background:C.card,borderRadius:16,padding:"14px 16px",marginBottom:10,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {/* Avatar circle */}
                      <div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"white",flexShrink:0}}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.name}</div>
                        <div style={{fontSize:10,color:C.textSub}}>{new Date(r.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                      </div>
                    </div>
                    <ReviewStars value={r.rating} size={13}/>
                  </div>
                  <div style={{fontSize:13,color:C.textSub,lineHeight:1.65,paddingLeft:44}}>{r.comment}</div>
                  {/* Helpful label */}
                  {r.rating>=4&&<div style={{fontSize:10,color:C.success,fontWeight:600,marginTop:6,paddingLeft:44}}>✓ Verified Purchase</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div style={{position:"fixed",bottom:64,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
        background:"rgba(255,255,255,.97)",backdropFilter:"blur(16px)",padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"center",zIndex:50}}>
        {p.comingSoon ? (
          <button className="press" onClick={()=>{if(!isInterested&&onInterest)onInterest(p);}} disabled={isInterested}
            style={{flex:1,background:isInterested?"#dcfce7":C.accent,color:isInterested?"#15803d":"white",border:"none",borderRadius:14,padding:"15px 12px",fontSize:14,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>
            {isInterested?"✓ We'll notify you when it's in!":"🔔 Coming Soon — I'm Interested"}
          </button>
        ) : inCart>0 ? (<>
          {/* Already in cart — the stepper edits the cart quantity directly; no duplicate adds */}
          <div style={{display:"flex",alignItems:"center",gap:14,background:C.bg,borderRadius:12,padding:"8px 14px",border:`1.5px solid ${C.border}`}}>
            <button className="press" onClick={()=>addToCart(p,-1,selVar)} style={{background:"none",border:"none",fontSize:20,color:C.primary,fontWeight:700,lineHeight:1}}>−</button>
            <span style={{fontSize:16,fontWeight:700,color:C.text,minWidth:18,textAlign:"center"}}>{inCart}</span>
            <button className="press" onClick={()=>{if(inCart<maxQty)addToCart(p,1,selVar);}} disabled={inCart>=maxQty} style={{background:"none",border:"none",fontSize:20,color:inCart>=maxQty?C.textSub:C.primary,fontWeight:700,lineHeight:1,opacity:inCart>=maxQty?.5:1}}>+</button>
          </div>
          <button className="press" onClick={()=>nav("cart")}
            style={{flex:1,background:C.success,color:"white",border:"none",borderRadius:14,padding:"14px 12px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
            ✓ In Cart · View Cart →
          </button>
        </>) : (<>
        <div style={{display:"flex",alignItems:"center",gap:14,background:C.bg,borderRadius:12,padding:"8px 14px",border:`1.5px solid ${C.border}`}}>
          <button className="press" onClick={()=>setQty(q=>Math.max(1,q-1))} style={{background:"none",border:"none",fontSize:20,color:C.primary,fontWeight:700,lineHeight:1}}>−</button>
          <span style={{fontSize:16,fontWeight:700,color:C.text,minWidth:18,textAlign:"center"}}>{qty}</span>
          <button className="press" onClick={()=>setQty(q=>Math.min(maxQty,q+1))} disabled={qty>=maxQty} style={{background:"none",border:"none",fontSize:20,color:qty>=maxQty?C.textSub:C.primary,fontWeight:700,lineHeight:1,opacity:qty>=maxQty?.5:1}}>+</button>
        </div>
        <button className="press" onClick={()=>{if(!oos){addToCart(p,qty,selVar);}}} disabled={oos}
          style={{flex:1,background:oos?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:14,padding:"14px 12px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif",transition:"background .25s"}}>
          {oos?"Out of Stock":`Add to Cart · ₹${unitPrice*qty}`}
        </button>
        </>)}
      </div>
    </div>
  );
}

/* ═══════════════════ CART PAGE ═══════════════════ */
function CartPage({cart,updateQty,total,nav,settings={}}){
  const hasLiveFish=cart.some(i=>i.category==="Live Fish");
  if(!cart.length)return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70vh",padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:80,marginBottom:20}}>🛒</div>
      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:23,fontWeight:800,color:C.text,marginBottom:8}}>Cart is empty</div>
      <div style={{fontSize:13,color:C.textSub,marginBottom:28}}>Browse our fish and accessories!</div>
      <button className="press" onClick={()=>nav("shop")} style={{background:C.primary,color:"white",border:"none",borderRadius:14,padding:"14px 32px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Start Shopping</button>
    </div>
  );
  return(
    <div className="slide-up">
      <div className="vh-head dt-read" style={{padding:"52px 16px 100px"}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800,color:C.text,marginBottom:20}}>My Cart ({cart.reduce((s,i)=>s+i.qty,0)})</div>
        {cart.map(item=>{
          const m=CAT_META[item.category]||CAT_META["Live Fish"];
          const maxAllowed=Math.min(item.stockCount??DEFAULT_STOCK,MAX_PER_ORDER);
          return(
            <div key={item.key} style={{background:C.card,borderRadius:18,padding:"14px",marginBottom:10,display:"flex",gap:14,alignItems:"center",border:`1px solid ${C.border}`}}>
              <div style={{width:58,height:58,borderRadius:14,flexShrink:0,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>{m.emoji}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:700,color:C.text,marginBottom:2}}>{item.name}</div>
                <div style={{fontSize:11,color:C.textSub,lineHeight:1.4}}>{item.variantLabel||item.category}</div>
                <div style={{fontFamily:PRICE_FONT,fontSize:15,fontWeight:800,color:C.primary,marginTop:5}}>₹{item.price*item.qty}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,background:C.bg,borderRadius:12,padding:"7px 12px",border:`1.5px solid ${C.border}`}}>
                <button className="press" onClick={()=>updateQty(item.key,-1)} style={{background:"none",border:"none",fontSize:18,color:C.primary,fontWeight:700,lineHeight:1}}>−</button>
                <span style={{fontSize:14,fontWeight:700,color:C.text,minWidth:16,textAlign:"center"}}>{item.qty}</span>
                <button className="press" onClick={()=>updateQty(item.key,1)} disabled={item.qty>=maxAllowed} style={{background:"none",border:"none",fontSize:18,color:item.qty>=maxAllowed?C.textSub:C.primary,fontWeight:700,lineHeight:1,opacity:item.qty>=maxAllowed?.5:1}}>+</button>
              </div>
            </div>
          );
        })}
        <div style={{background:C.card,borderRadius:18,padding:"18px",marginTop:18,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,color:C.textSub}}>Subtotal</span>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>₹{total}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,color:C.textSub}}>Shipping</span>
            <span style={{fontSize:13,fontWeight:600,color:C.accent}}>Calculated at checkout</span>
          </div>
          <div style={{height:1,background:C.border,margin:"12px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:15,fontWeight:700,color:C.text}}>Subtotal (excl. shipping)</span>
            <span style={{fontFamily:PRICE_FONT,fontSize:20,fontWeight:800,color:C.primary}}>₹{total}</span>
          </div>
        </div>
        {settings.loyaltyEnabled!==false && (()=>{
          const pph=Number(settings.loyaltyPointsPerHundred||10);
          const val=Number(settings.loyaltyRedeemValue||1);
          const pts=Math.floor((Number(total)||0)/100*pph);
          const worth=Math.floor(pts*val);
          if(worth<=0) return null;
          return (
            <div style={{background:"#ecfdf5",borderRadius:12,padding:"11px 14px",marginTop:10,fontSize:12.5,color:"#15803d",fontWeight:700,border:"1px solid #a7f3d0",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>👛</span>
              <span>Earn ₹{worth} back in wallet points — credited when your order is delivered.</span>
            </div>
          );
        })()}
        <div style={{background:C.accentLight,borderRadius:12,padding:"10px 14px",marginTop:10,fontSize:12.5,color:C.primaryDark,fontWeight:600,border:`1px solid ${C.border}`}}>
          🚚 Shipping is calculated at checkout based on your location &amp; order weight
          {hasLiveFish&&<span style={{display:"block",fontSize:11,fontWeight:500,marginTop:3,color:C.primary}}>🐠 Live fish shipping rates apply — see chart at checkout</span>}
        </div>
        <button className="press" onClick={()=>nav("checkout")}
          style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:16,padding:"17px 16px",fontSize:15,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginTop:18,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          Proceed to Checkout →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ PAYMENT PANEL (prepayment + proof upload) ═══════════════════ */
function PaymentPanel({order, settings={}, onSubmitPayment, onCancelled, compact=false}){
  const grand = order.amountDue ?? (order.total+order.fee);
  const [txn,setTxn]=useState(order.txnId||"");
  const [proof,setProof]=useState(order.paymentProof||"");
  const [proofNote,setProofNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [sentWA,setSentWA]=useState(false);
  const [now,setNow]=useState(Date.now());
  const ownerWA=(settings.ownerWhatsapp||BUSINESS_WA).replace(/\D/g,"");
  const deadline=order.paymentDeadline||0;
  const msLeft=Math.max(0,deadline-now);
  const expired=deadline&&msLeft<=0;
  const mm=String(Math.floor(msLeft/60000)).padStart(2,"0");
  const ss=String(Math.floor((msLeft%60000)/1000)).padStart(2,"0");

  useEffect(()=>{
    if(!deadline)return;
    const t=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(t);
  },[deadline]);
  useEffect(()=>{ if(expired&&order.status==="Awaiting Payment"&&onCancelled){ onCancelled(order); } },[expired]);

  const handleProof=async(file)=>{
    if(!file)return;
    setProofNote("Processing…");
    const b64=await compressImage(file, 1100, 0.82);
    setProof(b64);
    setProofNote("✓ Screenshot attached");
  };
  const submit=async()=>{
    if(!txn.trim()){ setProofNote("⚠ Enter the transaction / UPI reference ID"); return; }
    if(!proof){ setProofNote("⚠ Attach your payment screenshot"); return; }
    setBusy(true);
    await onSubmitPayment(order,{txnId:txn.trim(),paymentProof:proof});
    setBusy(false);
  };

  if(expired&&order.status!=="Awaiting Payment"){
    // already handled / cancelled — show nothing special here
  }

  return(
    <div style={{width:"100%",maxWidth:compact?"100%":360,margin:"0 auto"}}>
      {/* Countdown */}
      {deadline>0&&(
        <div style={{background:expired?"#fee2e2":"#fff7ed",border:`1px solid ${expired?"#fca5a5":"#fed7aa"}`,borderRadius:14,padding:"12px 14px",marginBottom:14,textAlign:"center"}}>
          {expired?(
            <div style={{fontSize:12.5,color:"#b91c1c",fontWeight:700,lineHeight:1.5}}>⌛ Payment window closed. This order will be cancelled. Please place a new order.</div>
          ):(
            <>
              <div style={{fontSize:11,color:"#9a3412",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>⚠ Pay within {PAY_WINDOW_MIN} minutes</div>
              <div style={{fontFamily:PRICE_FONT,fontSize:26,fontWeight:800,color:"#c2410c",letterSpacing:1}}>{mm}:{ss}</div>
              <div style={{fontSize:11,color:"#9a3412",marginTop:2,lineHeight:1.4}}>Orders not paid within {PAY_WINDOW_MIN} min are auto-cancelled.</div>
            </>
          )}
        </div>
      )}

      <div style={{background:C.card,border:`1.5px solid ${C.primary}`,borderRadius:18,padding:"18px"}}>
        <div style={{textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>Amount to Pay (full)</div>
          <div style={{fontFamily:PRICE_FONT,fontSize:30,fontWeight:800,color:C.primary,lineHeight:1.1}}>₹{grand}</div>
          <div style={{fontSize:11.5,color:C.textSub,marginTop:2}}>Order {order.orderNo}</div>
        </div>

        {settings.upiId?(
          <>
            <a className="press" href={`upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiName||STORE_NAME)}&am=${grand}&cu=INR&tn=${encodeURIComponent(order.orderNo||"")}`}
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:C.primary,color:"white",borderRadius:14,padding:"14px",fontSize:14.5,fontWeight:700,textDecoration:"none",marginBottom:10}}>
              <span style={{fontSize:18}}>📲</span> Pay ₹{grand} via UPI App
            </a>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.bg,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              <div><div style={{fontSize:10,color:C.textSub,fontWeight:700}}>UPI ID</div><div style={{fontSize:13,fontWeight:700,color:C.text}}>{settings.upiId}</div></div>
              <button className="press" onClick={()=>{navigator.clipboard?.writeText(settings.upiId);}} style={{background:C.accentLight,border:"none",color:C.primary,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Copy</button>
            </div>
          </>
        ):(
          <div style={{background:"#fff7ed",border:`1px solid #fed7aa`,borderRadius:10,padding:"11px 13px",marginBottom:14,fontSize:12,color:"#9a3412",lineHeight:1.5}}>⚠ Store UPI not set yet. Please contact us on WhatsApp to pay.</div>
        )}
        {settings.razorpayLink&&(
          <a className="press" href={settings.razorpayLink} target="_blank" rel="noopener"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#072654",color:"white",borderRadius:14,padding:"13px",fontSize:13.5,fontWeight:700,textDecoration:"none",marginBottom:14}}>
            💳 Pay via Card / Netbanking
          </a>
        )}

        {/* After paying — proof */}
        <div style={{height:1,background:C.border,margin:"4px 0 14px"}}/>
        <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:4}}>After paying, confirm here 👇</div>
        <div style={{fontSize:11.5,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Enter your payment reference and attach a screenshot. We verify &amp; confirm your order within 1–2 days.</div>

        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.6,marginBottom:5}}>Transaction / UPI Ref ID</div>
        <input value={txn} onChange={e=>{setTxn(e.target.value);setProofNote("");}} placeholder="e.g. 4198XXXXXX27"
          style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white",marginBottom:12}}/>

        <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.6,marginBottom:5}}>Payment Screenshot</div>
        {proof?(
          <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:`1.5px solid ${C.border}`,marginBottom:6}}>
            <img src={proof} alt="payment proof" style={{width:"100%",maxHeight:220,objectFit:"contain",background:"#0c2b30",display:"block"}}/>
            <button className="press" onClick={()=>{setProof("");setProofNote("");}} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",color:"white",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700}}>Replace</button>
          </div>
        ):(
          <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,border:`1.5px dashed ${C.border}`,borderRadius:12,padding:"18px",cursor:"pointer",marginBottom:6,background:C.bg}}>
            <span style={{fontSize:26}}>📤</span>
            <span style={{fontSize:12.5,fontWeight:700,color:C.primary}}>Tap to upload screenshot</span>
            <input type="file" accept="image/*" onChange={e=>handleProof(e.target.files?.[0])} style={{display:"none"}}/>
          </label>
        )}
        {proofNote&&<div style={{fontSize:11.5,color:proofNote[0]==="⚠"?C.danger:C.success,fontWeight:600,marginBottom:8}}>{proofNote}</div>}

        <button className="press" onClick={submit} disabled={busy||expired}
          style={{width:"100%",background:(busy||expired)?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:800,fontFamily:"'Nunito',sans-serif",marginTop:6}}>
          {busy?"Submitting…":expired?"Payment window closed":"✓ Submit Payment & Confirm Order"}
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════ SHIPPING RATES CHART ═══════════════════ */
function ShippingRatesChart({settings={}}){
  const r = settings.shippingRates || DEFAULT_SHIPPING_RATES;
  const zones = ZONE_KEYS;
  const tbl = (label, rows)=>(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:6}}>{label}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"6px 8px",color:"white",fontWeight:700,textAlign:"left",borderRadius:"8px 0 0 0"}}>Weight / Size</th>
              {zones.map(z=><th key={z} style={{padding:"6px 8px",color:"white",fontWeight:700,textAlign:"right"}}>{ZONE_LABELS[z]}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(rows).map(([bracket,prices],i)=>(
              <tr key={bracket} style={{background:i%2===0?"white":C.bg}}>
                <td style={{padding:"5px 8px",color:C.text,fontWeight:600}}>{bracket}</td>
                {zones.map(z=><td key={z} style={{padding:"5px 8px",color:C.text,textAlign:"right"}}>₹{prices[z]||0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return(
    <div style={{marginTop:12,padding:"0 2px"}}>
      <div style={{fontSize:11,color:C.textSub,marginBottom:10,lineHeight:1.5}}>
        Rates shown are approximate. Packaging weight ~{r.basePackagingKg||0.5}kg added per dry-goods order; ~{r.liveBasePackagingKg??r.basePackagingKg??0.5}kg base added per live-fish order. Actual charges confirmed at dispatch.
      </div>
      {tbl("🐟 Dry Goods (Food, Accessories, Plants, Tanks)", r.dryGoods||{})}
      {tbl("🐠 Live Fish Shipping (by total parcel weight)", r.liveFish||{})}
    </div>
  );
}

/* ═══════════════════ CHECKOUT PAGE (Phase 3+4) ═══════════════════ */
const BLANK_ADDR={name:"",phone:"",whatsapp:"",address:"",city:"",pincode:"",notes:"",summary:"",waUpdates:true};

function CheckoutPage({cart,total,nav,onOrderPlaced,onSubmitPayment,onCancelled,user,settings={},orders=[]}){
  const [step,setStep]=useState(1);
  const [addr,setAddr]=useState({...BLANK_ADDR,name:user?.name||"",phone:user?.phone||""});
  const ownerWA=(settings.ownerWhatsapp||BUSINESS_WA).replace(/\D/g,"");
  const supWA=(settings.supporterWhatsapp||"").replace(/\D/g,"");
  const onlineAvail=!!(settings.upiId||settings.razorpayLink);
  const hasLiveFish=cart.some(i=>i.category==="Live Fish");
  const [errs,setErrs]=useState({});
  const [placed,setPlaced]=useState(null);
  const [submitted,setSubmitted]=useState(false);
  const [sentWA,setSentWA]=useState(false);
  const [referralCopied,setReferralCopied]=useState(false);
  const [myRefCode,setMyRefCode]=useState(null);
  // Fetch this customer's real 6-digit referral code once an order is placed & meets the min-order threshold
  useEffect(()=>{
    if(!placed||!user) return;
    if(settings.referralEnabled===false){ setMyRefCode(null); return; }
    const orderVal=placed.amountDue??(placed.total+placed.fee);
    const minOrder=Number(settings.referralMinOrder||0);
    if(orderVal < minOrder){ setMyRefCode(null); return; }
    let alive=true;
    getMyReferralCode(user.uid).then(code=>{ if(alive) setMyRefCode(code); });
    return ()=>{alive=false;};
  },[placed,user,settings.referralMinOrder]);
  const [specialDelivery,setSpecialDelivery]=useState(false);
  const suggestedPacking=suggestedPackingForCart(cart);
  const [packing,setPacking]=useState(()=>suggestedPackingForCart(cart));
  const selPack=packingOpt(packing);
  const [placing,setPlacing]=useState(false);
  const [placeErr,setPlaceErr]=useState("");
  const [couponCode,setCouponCode]=useState("");
  const [couponApplied,setCouponApplied]=useState(null);
  const [couponMsg,setCouponMsg]=useState({text:"",ok:false});
  const [refInput,setRefInput]=useState("");
  const [refApplied,setRefApplied]=useState(false);
  const [refMsg,setRefMsg]=useState({text:"",ok:false});
  const [useSameBilling,setUseSameBilling]=useState(true);
  const [billing,setBilling]=useState({...BLANK_ADDR});
  const [showRates,setShowRates]=useState(false);
  const [loyaltyPts,setLoyaltyPts]=useState(null);
  const [loyaltyRedeemed,setLoyaltyRedeemed]=useState(false);
  // Load loyalty points on mount
  useEffect(()=>{
    if(!user||!settings.loyaltyEnabled)return;
    const uid=userKey(user);
    if(!uid)return;
    loadLoyalty(uid).then(d=>setLoyaltyPts(d.points||0));
  },[]);
  const loyaltyVal=Number(settings.loyaltyRedeemValue||1);
  const loyaltyMin=Number(settings.loyaltyRedeemMin||100);
  const walletMaxCoins=Number(settings.walletMaxCoins||100);
  const walletMinOrder=Number(settings.walletMinOrder||0);
  let loyaltyDiscount=(loyaltyRedeemed&&loyaltyPts>=loyaltyMin&&total>=walletMinOrder)?Math.floor(Math.min(loyaltyPts,walletMaxCoins)*loyaltyVal):0;
  let loyaltyCoinsUsed=loyaltyDiscount>0?Math.min(loyaltyPts,walletMaxCoins):0;
  // Dynamic shipping
  const zone=pincodeToZone(addr.pincode);
  const shipOpts = hasLiveFish ? {packing} : {special:specialDelivery};
  const shippingFee=calcShipping(cart,zone,shipOpts,settings);
  const shipBreak=shippingBreakdown(cart,zone,shipOpts,settings)||{courier:0,thermacol:0,carton:0,special:0,total:0,freeShip:false};
  // Live Arrival Guarantee is FREE when the customer picks the recommended packing (or a safer/higher-rank one).
  const guaranteeActive=hasLiveFish && selPack.rank >= packingOpt(suggestedPacking).rank;
  const lgPrice=0;
  let couponDiscount=couponApplied?Math.min(couponApplied.type==="percent"?Math.round(total*couponApplied.discount/100):Number(couponApplied.discount||0),total+lgPrice):0;
  let refDiscount=refApplied?Math.min(Number(settings.referralDiscount||50),Math.max(0,total+lgPrice-couponDiscount)):0;
  // ── Anti-stacking cap: coupon + referral + loyalty together can't exceed maxDiscountPct% of subtotal.
  //    Trim loyalty first (customer keeps their points), then referral, then coupon. ──
  const maxDiscPct=Number(settings.maxDiscountPct||0);
  const discountCap=maxDiscPct>0?Math.floor(total*maxDiscPct/100):Infinity;
  let discountCapped=false;
  if(couponDiscount+refDiscount+loyaltyDiscount>discountCap){
    discountCapped=true;
    let over=(couponDiscount+refDiscount+loyaltyDiscount)-discountCap;
    const dLoy=Math.min(loyaltyDiscount,over); loyaltyDiscount-=dLoy; over-=dLoy;
    const dRef=Math.min(refDiscount,over); refDiscount-=dRef; over-=dRef;
    const dCoup=Math.min(couponDiscount,over); couponDiscount-=dCoup; over-=dCoup;
    loyaltyCoinsUsed=loyaltyDiscount>0?Math.ceil(loyaltyDiscount/loyaltyVal):0;
  }
  // Live fish geo-restriction (admin-toggleable)
  const liveBlocked = hasLiveFish && liveFishBlockedForZone(zone, settings);
  const fee=shippingFee??0;
  const grand=Math.max(0,total+fee+lgPrice-couponDiscount-refDiscount-loyaltyDiscount);
  const f=(k,v)=>setAddr(a=>({...a,[k]:v}));
  const fb=(k,v)=>setBilling(a=>({...a,[k]:v}));
  const anySuggestSpecial=cart.some(i=>i.suggestSpecialDelivery);
  const applyCoupon=async()=>{
    if(refApplied){ setCouponMsg({text:"You can use a coupon or a referral code — not both. Remove the referral code first.",ok:false}); return; }
    const r=validateCoupon(couponCode,settings,orders,total);
    if(!r.ok){ setCouponMsg({text:r.msg,ok:false}); setCouponApplied(null); return; }
    if(await promoLimitReached("coupon", settings.couponDailyLimit)){
      setCouponMsg({text:"Today's coupon quota is full — please try tomorrow.",ok:false}); setCouponApplied(null); return;
    }
    setCouponApplied(r.coupon);
    const saved=r.coupon.type==="percent"?Math.round(total*r.coupon.discount/100):Number(r.coupon.discount||0);
    setCouponMsg({text:`✓ Coupon applied — saves ₹${saved}!`,ok:true});
  };

  const applyReferral=async()=>{
    if(couponApplied){ setRefMsg({text:"You can use a coupon or a referral code — not both. Remove the coupon first.",ok:false}); return; }
    if(settings.referralEnabled===false){ setRefMsg({text:"Referral program is currently off",ok:false}); return; }
    if(await promoLimitReached("referral", settings.referralDailyLimit)){
      setRefMsg({text:"Today's referral quota is full — please try tomorrow.",ok:false}); setRefApplied(false); return;
    }
    const r=await validateReferral(refInput,user?.uid);
    if(!r.ok){ setRefMsg({text:r.msg,ok:false}); setRefApplied(false); return; }
    setRefApplied(true);
    setRefMsg({text:`✓ Referral applied — ₹${Number(settings.referralDiscount||50)} off!`,ok:true});
  };

  const submitPaymentHere=async(order,pay)=>{
    await onSubmitPayment(order,pay);
    setSubmitted(true);
  };

  const validate=()=>{
    const e={};
    if(!addr.name.trim())e.name="Required";
    if(!/^[6-9]\d{9}$/.test(addr.phone))e.phone="Valid 10-digit number required";
    if(addr.whatsapp&&!/^[6-9]\d{9}$/.test(addr.whatsapp))e.whatsapp="Valid 10-digit number required";
    if(!addr.address.trim())e.address="Required";
    if(!addr.city.trim())e.city="Required";
    if(!/^\d{6}$/.test(addr.pincode))e.pincode="Valid 6-digit pincode required";
    setErrs(e);
    return Object.keys(e).length===0;
  };

  const handlePlaceOrder=async()=>{
    if(placing) return;
    if(liveBlocked){ setPlaceErr("Sorry — we currently don't ship live fish to this region. Please remove live-fish items or use a Tamil Nadu / South India delivery address."); return; }
    setPlaceErr(""); setPlacing(true);
    // Live stock re-check — stops the last unit being oversold when two people check out at once
    if(FB_OK && FB_DB){
      try{
        const need={}; cart.forEach(it=>{ need[it.id]=(need[it.id]||0)+it.qty; });
        const ids=Object.keys(need);
        const snaps=await Promise.all(ids.map(id=>withTimeout(FB_DB.ref("products/"+id+"/stockCount").get(),5000)));
        const short=[];
        ids.forEach((id,i)=>{
          const snap=snaps[i];
          const v=(snap&&typeof snap.val==="function")?snap.val():null;
          const live=(typeof v==="number")?v:null;
          if(live!==null && live<need[id]){ const nm=(cart.find(c=>c.id===id)||{}).name||"An item"; short.push(live<=0?`${nm} just sold out`:`${nm}: only ${live} left`); }
        });
        if(short.length){ setPlaceErr("Stock just changed — "+short.join(" · ")+". Please adjust your cart."); setPlacing(false); return; }
      }catch(e){ /* network hiccup — the atomic stock transaction still prevents going negative */ }
    }
    const id=uid("ord");
    const now=Date.now();
    const order={
      id,orderNo:orderId(id),items:[...cart],address:addr,
      billingAddress:useSameBilling?addr:billing,
      summary:addr.summary||"",
      total,fee,shippingZone:zone||"",shippingZoneLabel:zone?ZONE_LABELS[zone]:"Unknown",
      specialDelivery: hasLiveFish ? (selPack.courier==="special") : specialDelivery,
      specialDeliveryFee: (hasLiveFish?(selPack.courier==="special"):specialDelivery) ? Number(settings.specialDeliveryPrice||0):0,
      packing: hasLiveFish?packing:"", packingLabel: hasLiveFish?packingLabel(packing):"",
      suggestedPacking: hasLiveFish?suggestedPacking:"", suggestedPackingLabel: hasLiveFish?packingLabel(suggestedPacking):"",
      liveGuarantee:guaranteeActive,liveGuaranteeFee:0,
      coupon:couponApplied?couponCode.trim():"",couponDiscount,
      referralCode:refApplied?refInput.trim():"", referralDiscount:refDiscount,
      loyaltyDiscount:loyaltyRedeemed?loyaltyDiscount:0,
      thermacolFee: hasLiveFish?thermacolFeeFor(cart,packing,settings):0,
      shippingBreakup:{courier:shipBreak.courier,thermacol:shipBreak.thermacol,carton:shipBreak.carton,special:shipBreak.special},
      status:"Awaiting Payment",trackingNumber:"",
      paymentMethod:"online",
      paymentStatus:"Awaiting Payment",
      amountDue: grand,
      paymentDeadline: now + PAY_WINDOW_MIN*60*1000,
      txnId:"", paymentProof:"", paidAt:"",
      waUpdates: !!addr.waUpdates,
      userUid: userKey(user),
      userPhone:normalizePhone(user?.phone||addr.phone),
      userEmail:user?.email||"",
      placedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),
    };
    // Redeem loyalty points if applied
    const uid2=userKey(user);
    if(loyaltyRedeemed&&loyaltyDiscount>0&&uid2){
      const ptsUsed=Math.ceil(loyaltyDiscount/loyaltyVal);
      redeemPoints(uid2, ptsUsed, id);
    }
    // Email a copy to the owner (via EmailJS) if configured
    sendOrderEmail(order, settings.orderEmail||BUSINESS_EMAIL, settings);
    sendCustomerEmail(order, settings);
    // Claim the friend's referral code so it can never be reused
    if(refApplied&&refInput.trim()) claimReferral(refInput.trim(), userKey(user), id);
    // Count today's promo usage toward the admin's daily caps
    if(couponApplied) bumpPromoUsage("coupon");
    if(refApplied&&refInput.trim()) bumpPromoUsage("referral");
    // Root app handles state + storage + stock decrement
    onOrderPlaced(order);
    setPlaced(order);
    setStep(3);
    setPlacing(false);
  };

  const inp=(label,key,type="text",ph="",half=false,opt=false)=>(
    <div style={{flex:half?"1":"auto",minWidth:half?"0":"auto",marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>{label}{opt&&<span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}> (optional)</span>}</div>
      <input type={type} value={addr[key]} onChange={e=>f(key,e.target.value)} placeholder={ph}
        style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs[key]?C.danger:C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
      {errs[key]&&<div style={{fontSize:11,color:C.danger,marginTop:4,fontWeight:600}}>{errs[key]}</div>}
    </div>
  );

  if(step===3)return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",minHeight:"90vh",padding:"40px 18px 100px",textAlign:"center"}}>
      {submitted?(
        <>
          <div style={{width:80,height:80,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,marginBottom:20,animation:"checkPop .4s ease both"}}>✓</div>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:23,fontWeight:800,color:C.text,marginBottom:8}}>Payment Submitted! 🎉</div>
          {placed&&<div style={{background:C.accentLight,border:`1px solid ${C.border}`,borderRadius:14,padding:"10px 18px",marginBottom:16,fontFamily:PRICE_FONT,fontSize:18,fontWeight:800,color:C.primary}}>{placed.orderNo}</div>}
          <div style={{fontSize:13.5,color:C.textSub,lineHeight:1.7,marginBottom:20,maxWidth:320}}>Thank you! We'll <b style={{color:C.text}}>verify your payment</b> and confirm your order within <b style={{color:C.text}}>1–2 days</b>. You can track status anytime under <b style={{color:C.text}}>Orders</b>.</div>
          {/* Care-guide reminder — tailored to what was purchased */}
          {placed&&(()=>{
            const cats=new Set((placed.items||[]).map(i=>i.category));
            const hasFish=cats.has("Live Fish"), hasPlants=cats.has("Plants");
            if(!hasFish&&!hasPlants) return null; // dry goods only — no acclimatization needed
            if(hasFish){
              // Show the acclimatization steps inline right after payment so the customer is ready when the fish arrive.
              const steps=String(settings.acclimatizationTips||DEFAULT_SETTINGS.acclimatizationTips).split("\n").map(s=>s.replace(/^\s*\d+[.)]\s*/,"").trim()).filter(Boolean);
              return(
                <div style={{width:"100%",maxWidth:340,background:"#ecfdf5",border:`1.5px solid #a7f3d0`,borderRadius:16,padding:"15px 16px",marginBottom:16,textAlign:"left"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:22}}>🐠</span>
                    <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14.5,fontWeight:800,color:"#065f46"}}>How to acclimatize your fish</span>
                  </div>
                  <div style={{fontSize:11.5,color:"#047857",lineHeight:1.5,marginBottom:10}}>Save these steps for when your parcel arrives — they keep your new fish safe and stress-free.</div>
                  <ol style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    {steps.map((st,i)=>(<li key={i} style={{fontSize:12.5,color:"#065f46",lineHeight:1.5}}>{st}</li>))}
                  </ol>
                  <button className="press" onClick={()=>nav("guides")}
                    style={{marginTop:12,background:"none",border:"none",padding:0,color:"#15803d",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",textDecoration:"underline",cursor:"pointer"}}>
                    📖 See full care guides →
                  </button>
                </div>
              );
            }
            return(
              <button className="press" onClick={()=>nav("guides")}
                style={{width:"100%",maxWidth:340,background:"#ecfdf5",border:`1.5px solid #a7f3d0`,borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12,textAlign:"left",cursor:"pointer"}}>
                <span style={{fontSize:30,flexShrink:0}}>📖</span>
                <div>
                  <div style={{fontSize:13.5,fontWeight:800,color:"#065f46",marginBottom:2}}>Please read the Care Guide</div>
                  <div style={{fontSize:11.5,color:"#047857",lineHeight:1.5}}>Settle your new plants in correctly for healthy growth. Tap to read →</div>
                </div>
              </button>
            );
          })()}
          {/* Loyalty points earned */}
          {settings.loyaltyEnabled&&placed&&(()=>{
            const pph=Number(settings.loyaltyPointsPerHundred||10);
            const pts=Math.floor(((placed.amountDue??(placed.total+placed.fee))/100)*pph);
            return pts>0?(
              <div className="points-pop" style={{background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",borderRadius:16,padding:"12px 20px",marginBottom:14,display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:340}}>
                <span style={{fontSize:26}}>👛</span>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:14,fontWeight:800,color:"white"}}>{pts} wallet points pending</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.85)"}}>≈ ₹{Math.floor(pts*Number(settings.loyaltyRedeemValue||1))} — credited to your 👛 wallet once your order is delivered</div>
                </div>
              </div>
            ):null;
          })()}
          {/* Referral hint — uses the customer's real 6-digit one-time code; hidden if order is below the admin's min */}
          {placed&&myRefCode&&(()=>{
            const refCode=myRefCode;
            const refAmt=settings.referralDiscount||50;
            return(
              <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",borderRadius:16,padding:"14px 16px",marginBottom:14,width:"100%",maxWidth:340,textAlign:"left",boxShadow:"0 6px 20px rgba(124,58,237,.25)"}}>
                <div style={{fontSize:13,fontWeight:800,color:"white",marginBottom:4}}>💜 Loved it? Share with friends!</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.88)",marginBottom:8}}>Share your code — your friend gets <b>₹{refAmt} off</b> their next order, and you earn <b>wallet rewards</b> once it's delivered!</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,background:"rgba(255,255,255,.18)",border:"1px dashed rgba(255,255,255,.5)",borderRadius:8,padding:"6px 12px",fontFamily:"monospace",fontSize:14,fontWeight:800,color:"white",letterSpacing:2}}>{refCode}</div>
                  <button className="press" onClick={()=>{
                    try{navigator.clipboard.writeText(refCode);}catch(e){}
                    try{navigator.share&&navigator.share({text:`Use my code ${refCode} at Nemo Aqua Store for ₹${refAmt} off! 🐠`});}catch(e){}
                    setReferralCopied(true);setTimeout(()=>setReferralCopied(false),2000);
                  }} style={{background:referralCopied?"rgba(255,255,255,.9)":"rgba(255,255,255,.25)",border:"1px solid rgba(255,255,255,.4)",borderRadius:8,padding:"7px 12px",color:referralCopied?"#7c3aed":"white",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                    {referralCopied?"✓ Copied!":"Share"}
                  </button>
                </div>
              </div>
            );
          })()}
          <div style={{display:"flex",gap:10,width:"100%",maxWidth:340}}>
            <button className="press" onClick={()=>nav("home")}
              style={{flex:1,background:"transparent",color:C.primary,border:`1.5px solid ${C.primary}`,borderRadius:14,padding:"14px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Home</button>
            <button className="press" onClick={()=>nav("orders")}
              style={{flex:1,background:C.primary,color:"white",border:"none",borderRadius:14,padding:"14px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>View Orders</button>
          </div>
        </>
      ):(
        <>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800,color:C.text,marginBottom:4}}>Almost there — complete payment</div>
          <div style={{fontSize:12.5,color:C.textSub,marginBottom:18,maxWidth:330,lineHeight:1.5}}>Your order is reserved. Pay the full amount now &amp; submit proof to confirm it.</div>
          {placed&&<PaymentPanel order={placed} settings={settings} onSubmitPayment={submitPaymentHere} onCancelled={(o)=>{onCancelled&&onCancelled(o);}}/>}
          <button className="press" onClick={()=>nav("orders")}
            style={{marginTop:16,background:"none",border:"none",color:C.textSub,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",textDecoration:"underline"}}>
            I'll pay later — go to Orders
          </button>
        </>
      )}
    </div>
  );

  return(
    <div className="slide-up">
      {/* Header */}
      <div className="vh-head" style={{background:C.card,padding:"52px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button className="press" onClick={()=>step===1?nav("cart"):setStep(1)}
            style={{background:"none",border:"none",fontSize:20,color:C.textSub}}>←</button>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,color:C.text}}>
            {step===1?"Shipping Details":"Review & Place Order"}
          </div>
        </div>
        {/* Steps */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {["Address","Review","Done"].map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,
                background:i<step?C.primary:"transparent",color:i<step?"white":C.textSub,border:`2px solid ${i<step?C.primary:C.border}`}}>
                {i<step-1?"✓":i+1}
              </div>
              <span style={{fontSize:11,fontWeight:600,color:i===step-1?C.primary:C.textSub}}>{s}</span>
              {i<2&&<div style={{width:16,height:2,background:i<step-1?C.primary:C.border,borderRadius:2}}/>}
            </div>
          ))}
        </div>
      </div>

      {step===1&&(
        <div className="dt-read" style={{padding:"20px 16px 100px"}}>
          {/* Shipping rates info */}
          <div style={{background:C.accentLight,borderRadius:14,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.primaryDark}}>🚚 Shipping rates vary by location &amp; weight</div>
              <button className="press" onClick={()=>setShowRates(r=>!r)}
                style={{background:"none",border:`1px solid ${C.primary}`,color:C.primary,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                {showRates?"Hide":"View chart"}
              </button>
            </div>
            {zone&&<div style={{fontSize:11.5,color:C.primary,fontWeight:700,marginTop:4}}>📍 Detected zone: <b>{ZONE_LABELS[zone]}</b></div>}
            {!zone&&addr.pincode.length===6&&<div style={{fontSize:11.5,color:"#b45309",marginTop:4}}>⚠ Pincode not recognized — enter your city below and we'll confirm shipping</div>}
            {hasLiveFish&&(()=>{
              const r2=settings.shippingRates||DEFAULT_SHIPPING_RATES;
              const fishWt=cart.filter(i=>i.category==="Live Fish").reduce((s,i)=>{const wt=Number(i.variantPackagingWeight!=null?i.variantPackagingWeight:i.packagingWeight)||0.2;return s+wt*i.qty;},0);
              const base=Number(r2.liveBasePackagingKg!=null?r2.liveBasePackagingKg:(r2.basePackagingKg??0.5));
              const total=fishWt+base;
              return <div style={{fontSize:11,color:C.textSub,marginTop:4}}>🐠 Estimated live parcel weight: <b style={{color:C.primary}}>{total.toFixed(2)} kg</b> (fish packing: {fishWt.toFixed(2)} kg + base: {base} kg)</div>;
            })()}
            {showRates&&<ShippingRatesChart settings={settings}/>}
          </div>
          {liveBlocked&&(
            <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:14,padding:"13px 15px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,color:"#b91c1c",marginBottom:3}}>🚫 Live fish not deliverable to {zone?ZONE_LABELS[zone]:"this region"}</div>
              <div style={{fontSize:12,color:"#7f1d1d",lineHeight:1.5}}>For the safety of the fish we currently ship live stock only within <b>Tamil Nadu</b> and <b>South India</b>. Please use a delivery address in those regions, or remove the live-fish items to continue with the rest of your order.</div>
            </div>
          )}
          {hasLiveFish&&(
            <>
            <div style={{background:"#dcfce7",border:`1px solid #86efac`,borderRadius:16,padding:"14px 16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:20}}>🛡️</span>
                <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:"#15803d"}}>Live Arrival Guarantee</span>
              </div>
              <div style={{fontSize:12.5,color:"#166534",lineHeight:1.6}}>Free on every live-fish order sent with our <b>recommended packing</b>. If a fish arrives dead (DOA), share a clear, continuous unboxing video on WhatsApp within <b>2 hours</b> of delivery and we'll make it right <b>one time</b> — a replacement, store credit, or refund of the fish's value (our choice). Shipping charges aren't refundable, and normal-parcel orders aren't covered. Once your fish arrive safely, all sales are final.</div>
              <button className="press" onClick={()=>nav("about")}
                style={{marginTop:8,background:"none",border:"none",padding:0,color:"#15803d",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",textDecoration:"underline"}}>
                📖 Read our acclimatization guide →
              </button>
            </div>
            </>
          )}
          {inp("Full Name","name","text","John Doe")}
          {inp("Mobile Number","phone","tel","9876543210")}
          {inp("WhatsApp Number","whatsapp","tel","9876543210 (if different)",false,true)}
          <label style={{display:"flex",alignItems:"center",gap:10,background:C.accentLight,borderRadius:12,padding:"12px 14px",marginBottom:14,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={addr.waUpdates} onChange={e=>f("waUpdates",e.target.checked)} style={{width:18,height:18,accentColor:C.primary,flexShrink:0}}/>
            <span style={{fontSize:12.5,color:C.primaryDark,fontWeight:500,lineHeight:1.45}}>💬 Notify me about my order (payment confirmed, shipped, delivered)</span>
          </label>
          {inp("Street Address","address","text","123, Main Street")}
          <div style={{display:"flex",gap:12}}>
            {inp("City","city","text","Chennai",true)}
            {inp("Pincode","pincode","text","600001",true)}
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Delivery Notes <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            <textarea value={addr.notes} onChange={e=>f("notes",e.target.value)} rows={3}
              placeholder="Landmark, gate code, special instructions…"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",resize:"none",lineHeight:1.6,background:"white"}}/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Order Summary / Special Requests <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            <textarea value={addr.summary} onChange={e=>f("summary",e.target.value)} rows={3}
              placeholder="e.g. Please pack fish with extra oxygen, specific colour preference…"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",resize:"none",lineHeight:1.6,background:"white"}}/>
            <div style={{fontSize:11,color:C.textSub,marginTop:4}}>📝 Tell us anything special about your order — we'll see it with your order.</div>
          </div>
          {/* Special delivery — recommended parcel that carries the Live Arrival Guarantee for live fish */}
          {/* Live-fish packing chooser (customer picks); falls back to dry-goods special toggle */}
          {hasLiveFish ? (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>🐠 Choose Live-Fish Packing</div>
              <div style={{fontSize:11.5,color:"#15803d",background:"#dcfce7",border:"1px solid #86efac",borderRadius:10,padding:"9px 12px",marginBottom:10,lineHeight:1.5}}>🛡️ The <b>Live Arrival Guarantee</b> applies when you choose our recommended packing — <b>{packingLabel(suggestedPacking)}</b> — or a safer option above it. Whatever you choose, we always pack with the utmost care to keep your fish safe in transit.</div>
              {PACKING_OPTIONS.map(opt=>{
                const sel=packing===opt.key;
                const isSug=opt.key===suggestedPacking;
                const covered=opt.rank>=packingOpt(suggestedPacking).rank;
                const optFee=calcShipping(cart,zone,{packing:opt.key},settings);
                return(
                  <label key={opt.key} style={{display:"flex",alignItems:"flex-start",gap:11,background:sel?"#eff6ff":"#fff",borderRadius:13,padding:"12px 13px",marginBottom:8,cursor:"pointer",userSelect:"none",border:`1.5px solid ${sel?"#3b82f6":C.border}`}}>
                    <input type="radio" name="packing" checked={sel} onChange={()=>setPacking(opt.key)} style={{width:18,height:18,accentColor:"#3b82f6",flexShrink:0,marginTop:1}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:12.5,fontWeight:800,color:sel?"#1d4ed8":C.text}}>{opt.label}</span>
                        {isSug&&<span style={{fontSize:9,fontWeight:800,color:"#15803d",background:"#dcfce7",borderRadius:20,padding:"2px 7px",letterSpacing:.3}}>RECOMMENDED</span>}
                        {covered&&<span style={{fontSize:9.5,fontWeight:700,color:"#15803d"}}>🛡️ Guaranteed</span>}
                      </div>
                      <div style={{fontSize:11,color:C.textSub,marginTop:2,lineHeight:1.45}}>{opt.blurb}</div>
                    </div>
                    <span style={{fontSize:12.5,fontWeight:800,color:sel?"#1d4ed8":C.text,whiteSpace:"nowrap"}}>{zone?`₹${optFee}`:"—"}</span>
                  </label>
                );
              })}
              {selPack.rank < packingOpt(suggestedPacking).rank &&(
                <div style={{fontSize:11,color:"#9a3412",lineHeight:1.45,marginTop:2,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"8px 11px"}}>⚠ You've chosen a lighter packing than we recommend for these fish — that's okay, but <b>live arrival won't be guaranteed</b>.</div>
              )}
            </div>
          ) : anySuggestSpecial ? (
            <label style={{display:"flex",alignItems:"flex-start",gap:12,background:specialDelivery?"#eff6ff":"#fff",borderRadius:14,padding:"13px 14px",marginBottom:14,cursor:"pointer",userSelect:"none",border:`1.5px solid ${specialDelivery?"#3b82f6":C.border}`}}>
              <input type="checkbox" checked={specialDelivery} onChange={e=>setSpecialDelivery(e.target.checked)} style={{width:20,height:20,accentColor:"#3b82f6",flexShrink:0,marginTop:1}}/>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#1d4ed8"}}>⚡ Speed Delivery</div>
                <div style={{fontSize:11.5,color:"#1e40af",marginTop:2,lineHeight:1.45}}>Priority courier with extra care for fragile items. Adds <b>₹{settings.specialDeliveryPrice||200}</b> to shipping.</div>
              </div>
            </label>
          ) : null}
          {/* Wallet — redeem points (earned + referral + shipping refunds) */}
          {settings.loyaltyEnabled&&loyaltyPts!=null&&loyaltyPts>0&&(
            <LoyaltyWidget points={loyaltyPts} settings={settings} subtotal={total} redeemApplied={loyaltyRedeemed} onRedeem={()=>setLoyaltyRedeemed(true)}/>
          )}
          {/* Coupon code */}
          {settings.showCouponField!==false && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>🎟 Coupon Code <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            {/* Show available coupon hints — secret coupons are never listed here */}
            {(()=>{
              const active=(settings.coupons||[]).filter(c=>c.active!==false&&c.code&&!c.secret);
              if(!active.length) return null;
              return(
                <div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:5}}>
                  {active.map((c,i)=>{
                    const minOk=!c.minOrder||total>=Number(c.minOrder);
                    const needed=c.minOrder?Math.max(0,Number(c.minOrder)-total):0;
                    const discount=c.type==="percent"?`${c.discount}% off`:`₹${c.discount} off`;
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:minOk?"#f0fdf4":"#fefce8",border:`1px solid ${minOk?"#86efac":"#fde68a"}`,borderRadius:10,padding:"7px 12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontFamily:"monospace",fontWeight:800,fontSize:12,color:minOk?C.success:"#92400e",background:minOk?"#dcfce7":"#fef3c7",padding:"2px 8px",borderRadius:6}}>{c.code}</span>
                          <span style={{fontSize:11.5,color:minOk?"#15803d":"#92400e",fontWeight:600}}>{discount}</span>
                        </div>
                        {minOk?(
                          <button className="press" onClick={()=>{setCouponCode(c.code);}}
                            style={{background:C.success,color:"white",border:"none",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Apply</button>
                        ):(
                          <span style={{fontSize:10.5,color:"#92400e",fontWeight:600}}>Add ₹{needed} more</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{display:"flex",gap:8}}>
              <input value={couponCode} onChange={e=>{setCouponCode(e.target.value);setCouponMsg({text:"",ok:false});setCouponApplied(null);}}
                placeholder="Enter coupon code"
                style={{flex:1,borderRadius:12,border:`1.5px solid ${couponMsg.ok?"#22c55e":couponMsg.text?C.danger:C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
              <button className="press" onClick={applyCoupon}
                style={{background:C.primary,color:"white",border:"none",borderRadius:12,padding:"0 16px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                Apply
              </button>
            </div>
            {couponMsg.text&&<div style={{fontSize:11.5,color:couponMsg.ok?C.success:C.danger,fontWeight:600,marginTop:4}}>{couponMsg.text}</div>}
          </div>
          )}
          {/* Referral code — a friend's 6-digit code, one-time use */}
          {settings.referralEnabled!==false && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>💜 Referral Code <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            <div style={{display:"flex",gap:8}}>
              <input value={refInput} onChange={e=>{setRefInput(e.target.value.replace(/\D/g,"").slice(0,6));setRefMsg({text:"",ok:false});setRefApplied(false);}}
                inputMode="numeric" placeholder="6-digit friend's code"
                style={{flex:1,borderRadius:12,border:`1.5px solid ${refMsg.ok?"#22c55e":refMsg.text?C.danger:C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white",letterSpacing:2,fontFamily:"monospace"}}/>
              <button className="press" onClick={applyReferral} disabled={refInput.length!==6}
                style={{background:refInput.length===6?"#7c3aed":"#c4b5fd",color:"white",border:"none",borderRadius:12,padding:"0 16px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                Apply
              </button>
            </div>
            {refMsg.text&&<div style={{fontSize:11.5,color:refMsg.ok?C.success:C.danger,fontWeight:600,marginTop:4}}>{refMsg.text}</div>}
          </div>
          )}
          {/* Billing address */}
          <label style={{display:"flex",alignItems:"center",gap:10,background:C.bg,borderRadius:12,padding:"11px 14px",marginBottom:12,cursor:"pointer",userSelect:"none",border:`1px solid ${C.border}`}}>
            <input type="checkbox" checked={useSameBilling} onChange={e=>setUseSameBilling(e.target.checked)} style={{width:18,height:18,accentColor:C.primary,flexShrink:0}}/>
            <span style={{fontSize:12.5,color:C.primaryDark,fontWeight:600}}>🏠 Billing address same as shipping</span>
          </label>
          {!useSameBilling&&(
            <div style={{background:C.bg,borderRadius:14,padding:"14px",marginBottom:14,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:10}}>Billing Address</div>
              {["name","address","city","pincode"].map(k=>(
                <div key={k} style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.6,marginBottom:4}}>{k.charAt(0).toUpperCase()+k.slice(1)}</div>
                  <input value={billing[k]} onChange={e=>fb(k,e.target.value)}
                    style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:13,outline:"none",background:"white"}}/>
                </div>
              ))}
            </div>
          )}
          <button className="press" onClick={()=>{if(validate())setStep(2);}}
            style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:16,padding:"16px",fontSize:15,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
            Continue to Review →
          </button>
        </div>
      )}

      {step===2&&(
        <div className="dt-read" style={{padding:"20px 16px 100px"}}>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:16,fontWeight:800,color:C.text,marginBottom:12}}>Order Items</div>
          {cart.map(item=>{
            const m=CAT_META[item.category]||CAT_META["Live Fish"];
            return(
              <div key={item.id} style={{background:C.card,borderRadius:14,padding:"12px",marginBottom:8,display:"flex",gap:12,alignItems:"center",border:`1px solid ${C.border}`}}>
                <div style={{width:44,height:44,borderRadius:10,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{m.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text}}>{item.name}</div>
                  <div style={{fontSize:12,color:C.textSub}}>{item.variantLabel?`${item.variantLabel} · `:""}Qty: {item.qty}</div>
                </div>
                <div style={{fontFamily:PRICE_FONT,fontSize:14,fontWeight:800,color:C.primary}}>₹{item.price*item.qty}</div>
              </div>
            );
          })}
          <div style={{background:C.card,borderRadius:14,padding:"14px",marginTop:12,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:13,color:C.textSub}}>Subtotal</span>
              <span style={{fontSize:13,fontWeight:600,color:C.text}}>₹{total}</span>
            </div>
            {!zone ? (
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:C.textSub}}>Shipping</span>
                <span style={{fontSize:13,fontWeight:600,color:C.accent}}>TBD after address</span>
              </div>
            ) : (<>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:C.textSub}}>Shipping <span style={{fontSize:11,color:C.accent}}>({ZONE_LABELS[zone]})</span></span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{shipBreak.freeShip?"Free":`₹${shipBreak.courier}`}</span>
              </div>
              {shipBreak.special>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:"#1d4ed8"}}>⚡ Speed Courier extra</span>
                {!hasLiveFish?(
                  <span style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#1d4ed8"}}>₹{shipBreak.special}</span>
                    <button className="press" onClick={()=>setSpecialDelivery(false)} title="Remove" style={{width:22,height:22,borderRadius:"50%",background:"#dbeafe",color:"#1d4ed8",border:"none",fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
                  </span>
                ):<span style={{fontSize:13,fontWeight:600,color:"#1d4ed8"}}>₹{shipBreak.special}</span>}
              </div>}
              {shipBreak.thermacol>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:C.textSub}}>🧊 Thermacol packaging</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>₹{shipBreak.thermacol}</span>
              </div>}
              {shipBreak.carton>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:C.textSub}}>📦 Carton packaging</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>₹{shipBreak.carton}</span>
              </div>}
            </>)}
            {hasLiveFish ? (
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"flex-start"}}>
                <span style={{fontSize:13,color:C.textSub}}>📦 Packing</span>
                <span style={{fontSize:12,fontWeight:700,color:C.text,textAlign:"right",maxWidth:"62%"}}>{packingLabel(packing)}</span>
              </div>
            ) : null}
            {zone&&fee>0&&<div style={{fontSize:10.5,color:C.textSub,lineHeight:1.5,marginTop:-2,marginBottom:8,background:C.accentLight,borderRadius:8,padding:"7px 10px"}}>ℹ️ Shipping is charged as an estimate. If your parcel actually costs less to send, we credit the difference back to your 👛 wallet as loyalty coins after it's dispatched.</div>}
            {guaranteeActive&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
              <span style={{fontSize:13,color:"#15803d"}}>🛡️ Live Arrival Guarantee</span>
              <span style={{fontSize:13,fontWeight:700,color:"#15803d"}}>Included</span>
            </div>}
            {couponApplied&&couponDiscount>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:13,color:C.success}}>🎟 Coupon ({couponCode.toUpperCase()})</span>
              <span style={{fontSize:13,fontWeight:600,color:C.success}}>-₹{couponDiscount}</span>
            </div>}
            {refApplied&&refDiscount>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:13,color:"#7c3aed"}}>💜 Referral ({refInput})</span>
              <span style={{fontSize:13,fontWeight:600,color:"#7c3aed"}}>-₹{refDiscount}</span>
            </div>}
            {loyaltyRedeemed&&loyaltyDiscount>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:13,color:"#7c3aed"}}>👛 Wallet</span>
              <span style={{fontSize:13,fontWeight:600,color:"#7c3aed"}}>-₹{loyaltyDiscount}</span>
            </div>}
            {discountCapped&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8,gap:8}}>
              <span style={{fontSize:11,color:C.textSub,lineHeight:1.4}}>Max savings of {maxDiscPct}% applied — some discounts were trimmed.</span>
            </div>}
            <div style={{height:1,background:C.border,margin:"10px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:15,fontWeight:700,color:C.text}}>Grand Total</span>
              <span style={{fontFamily:PRICE_FONT,fontSize:18,fontWeight:800,color:C.primary}}>₹{grand}</span>
            </div>
          </div>
          <div style={{marginTop:16,background:C.card,borderRadius:14,padding:"14px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>📍 Shipping To</div>
            {[{l:"Name",v:addr.name},{l:"Phone",v:addr.phone},{l:"Address",v:addr.address},{l:"City",v:`${addr.city} — ${addr.pincode}`}].map((r,i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:6}}>
                <span style={{fontSize:12,color:C.textSub,minWidth:55}}>{r.l}</span>
                <span style={{fontSize:12,color:C.text,fontWeight:600}}>{r.v}</span>
              </div>
            ))}
            <button className="press" onClick={()=>setStep(1)} style={{marginTop:10,background:"none",border:"none",fontSize:12,color:C.accent,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>✏ Edit Address</button>
          </div>

          {/* Prepayment notice */}
          <div style={{marginTop:16,background:"#eff6ff",border:`1px solid #bfdbfe`,borderRadius:14,padding:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:18}}>💳</span>
              <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:"#1e40af"}}>Prepaid order — pay ₹{grand} to confirm</span>
            </div>
            <div style={{fontSize:12,color:"#1e3a8a",lineHeight:1.55}}>On the next screen, pay the <b>full amount</b> by UPI and upload your payment screenshot. We verify &amp; confirm within 1–2 days. Orders unpaid within {PAY_WINDOW_MIN} minutes are auto-cancelled.</div>
          </div>

          {placeErr&&<div style={{marginTop:14,background:"#fef2f2",border:`1.5px solid #fecaca`,borderRadius:12,padding:"11px 14px",fontSize:12.5,color:"#b91c1c",fontWeight:600,lineHeight:1.5}}>⚠ {placeErr}</div>}
          <button className="press" onClick={handlePlaceOrder} disabled={placing}
            style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:16,padding:"17px 16px",fontSize:15,fontWeight:800,fontFamily:"'Nunito',sans-serif",marginTop:18,opacity:placing?.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            {placing?"Checking stock…":<>Place Order &amp; Pay ₹{grand} →</>}
          </button>
          <div style={{fontSize:11,color:C.textSub,textAlign:"center",marginTop:7,lineHeight:1.5}}>
            You'll complete payment on the next step to confirm your order.
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ DESKTOP TOP NAV (shown ≥1000px) ═══════════════════ */
function DesktopNav({page,nav,cartCount,user,settings={},onSecretTap}){
  const links=[{id:"home",label:"Home"},{id:"shop",label:"Shop"},{id:"guides",label:"Care Guides"},{id:"request",label:"Request"}];
  const active=page==="detail"?"shop":page==="checkout"?"cart":page==="auth"?"orders":page;
  const linkStyle=on=>({background:on?"#eef9fa":"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:on?800:600,color:on?C.primary:C.text,padding:"8px 12px",borderRadius:10,fontFamily:"'Nunito',sans-serif",whiteSpace:"nowrap"});
  return(
    <div className="desk-nav" style={{flexShrink:0,alignItems:"center",gap:4,background:C.card,borderBottom:`1px solid ${C.border}`,padding:"10px 22px",position:"sticky",top:0,zIndex:60,boxShadow:"0 2px 12px rgba(11,110,114,.06)"}}>
      <div className="press" onClick={onSecretTap} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginRight:8}}>
        <img src={STORE_LOGO} alt="" onError={e=>{if(!e.target.dataset.fb){e.target.dataset.fb='1';e.target.src=NEMO_FALLBACK;}}} style={{width:38,height:38,objectFit:"contain"}}/>
        <span style={{fontFamily:"'Baloo 2',sans-serif",fontWeight:800,fontSize:16,color:C.text,letterSpacing:.4,whiteSpace:"nowrap"}}>{STORE_NAME} Aqua Store</span>
      </div>
      {links.map(l=>(
        <button key={l.id} className="desk-link" onClick={()=>nav(l.id)} style={linkStyle(active===l.id)}>{l.label}</button>
      ))}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
        <button className="desk-link" onClick={()=>nav("orders")} style={linkStyle(active==="orders")}>📦 Orders</button>
        <button className="press" onClick={()=>nav("cart")} style={{position:"relative",display:"inline-flex",alignItems:"center",gap:6,background:active==="cart"?C.primary:C.accentLight,color:active==="cart"?"white":C.primary,border:`1px solid ${active==="cart"?C.primary:C.border}`,borderRadius:11,padding:"8px 13px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
          🛒 Cart
          {cartCount>0&&<span style={{position:"absolute",top:-6,right:-6,background:C.coral,color:"white",fontSize:10,fontWeight:800,borderRadius:10,padding:"1px 6px",minWidth:18,textAlign:"center"}}>{cartCount>99?"99+":cartCount}</span>}
        </button>
        <button className="press" onClick={()=>nav("orders")} style={{display:"inline-flex",alignItems:"center",gap:8,background:"none",border:`1px solid ${C.border}`,borderRadius:30,padding:"5px 12px 5px 5px",cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
          <span style={{width:28,height:28,borderRadius:"50%",background:C.primary,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800}}>{user?(user.name||"U").charAt(0).toUpperCase():"👤"}</span>
          <span style={{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{user?(user.name||"").split(" ")[0]||"Account":"Sign in"}</span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ BOTTOM NAV ═══════════════════ */
function BottomNav({page,nav,cartCount}){
  const tabs=[{id:"home",label:"Home",icon:"🏠"},{id:"shop",label:"Shop",icon:"🛍️"},{id:"orders",label:"Orders",icon:"📦"},{id:"cart",label:"Cart",icon:"🛒"}];
  const active=page==="home"?"home":page==="shop"||page==="detail"?"shop":page==="orders"||page==="auth"?"orders":page==="cart"||page==="checkout"?"cart":"home";
  return(
    <div className="mobile-bottom-nav" style={{position:"absolute",bottom:0,left:0,right:0,zIndex:100}}>
      {/* Bottom nav tabs */}
      <div style={{background:C.navBg,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,display:"flex",paddingTop:"8px",paddingBottom:"calc(14px + env(safe-area-inset-bottom, 0px))"}}>
        {tabs.map(t=>{
          const on=active===t.id;
          return(
            <button key={t.id} className="press" onClick={()=>nav(t.id)}
              style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{position:"relative"}}>
                <span style={{fontSize:24,filter:on?"none":"grayscale(1) opacity(.45)",transition:"filter .2s",display:"block"}}>{t.icon}</span>
                {t.id==="cart"&&cartCount>0&&(
                  <span style={{position:"absolute",top:-4,right:-8,background:C.coral,color:"white",fontSize:9,fontWeight:800,borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center"}}>
                    {cartCount>99?"99+":cartCount}
                  </span>
                )}
              </div>
              <span style={{fontSize:10,fontWeight:on?700:500,color:on?C.primary:C.textSub,fontFamily:"'Nunito',sans-serif"}}>{t.label}</span>
              {on&&<div style={{width:5,height:5,borderRadius:"50%",background:C.primary,marginTop:-2}}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ ADMIN LOGIN ═══════════════════ */
function AdminLogin({onSuccess,onBack,settings={}}){
  const [pw,setPw]=useState("");
  const [show,setShow]=useState(false);
  const [err,setErr]=useState(false);
  const [shaking,setShaking]=useState(false);
  const inpRef=useRef(null);

  useEffect(()=>{const t=setTimeout(()=>inpRef.current?.focus(),200);return()=>clearTimeout(t);},[]);

  const submit=()=>{
    const custom = settings.adminPassHash;
    const ok = custom ? (hashPass(pw)===custom) : (hashPass(pw)===ADMIN_PASS_HASH);
    if(ok){onSuccess();}
    else{
      setShaking(true);setErr(true);
      setTimeout(()=>{setShaking(false);},500);
    }
  };

  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",background:C.bg,padding:"24px",position:"relative"}}>
      <button className="press" onClick={onBack} style={{position:"absolute",top:20,left:16,background:"none",border:"none",fontSize:24,color:C.textSub,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
      <div style={{fontSize:56,marginBottom:14}}>🔐</div>
      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:24,fontWeight:800,color:C.text,marginBottom:6}}>Admin Access</div>
      <div style={{fontSize:13.5,color:C.textSub,marginBottom:28,textAlign:"center"}}>Enter your admin password</div>

      <div className={shaking?"shake":""} style={{width:"100%",maxWidth:320}}>
        <div style={{position:"relative",marginBottom:6}}>
          <input
            ref={inpRef}
            type={show?"text":"password"}
            value={pw}
            onChange={e=>{setPw(e.target.value);if(err)setErr(false);}}
            onKeyDown={e=>{if(e.key==="Enter")submit();}}
            placeholder="Password"
            autoComplete="off"
            style={{
              width:"100%",borderRadius:14,
              border:`1.5px solid ${err?C.danger:C.border}`,
              padding:"16px 50px 16px 18px",
              fontSize:16,outline:"none",
              background:"white",
              fontFamily:"'Nunito',sans-serif",
              letterSpacing: show?0:2,
            }}
          />
          <button className="press" onClick={()=>setShow(s=>!s)} type="button"
            style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
              background:"transparent",border:"none",width:40,height:40,
              fontSize:18,color:C.textSub,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            {show?"🙈":"👁"}
          </button>
        </div>
        <div style={{minHeight:20,marginBottom:14}}>
          {err&&<div style={{fontSize:12.5,color:C.danger,fontWeight:600}}>✕ Incorrect password</div>}
        </div>
        <button className="press" onClick={submit} disabled={!pw}
          style={{width:"100%",background:pw?C.primary:"#9ca3af",color:"white",
            border:"none",borderRadius:14,padding:"16px",
            fontSize:15,fontWeight:700,
            fontFamily:"'Nunito',sans-serif",
            transition:"background .2s"}}>
          Unlock Admin →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ ADMIN MEDIA UPLOADER ═══════════════════ */
function MediaUploader({label,accept,preview,previewType,onChange,onClear,note,fit="cover"}){
  const ref=useRef(null);
  const [drag,setDrag]=useState(false);
  return(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>{label}</div>
      {preview?(
        <div style={{position:"relative",borderRadius:14,overflow:"hidden",border:`1.5px solid ${C.border}`,background:fit==="contain"?"#0c2b30":"transparent"}}>
          {previewType==="video"
            ?<video src={preview} autoPlay loop muted playsInline style={{width:"100%",maxHeight:fit==="contain"?340:180,objectFit:fit,display:"block"}}/>
            :<img src={preview} alt="" style={{width:"100%",maxHeight:fit==="contain"?340:180,objectFit:fit,display:"block"}}/>}
          <button className="press" onClick={onClear}
            style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.5)",border:"none",borderRadius:"50%",width:32,height:32,color:"white",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          <div style={{position:"absolute",bottom:8,left:8,background:"rgba(0,0,0,.5)",color:"white",fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:12}}>
            {previewType==="video"?"▶ Preview":"📷 Preview"}
          </div>
        </div>
      ):(
        <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);onChange(e.dataTransfer.files[0]);}}
          onClick={()=>ref.current?.click()}
          style={{border:`2px dashed ${drag?C.primary:C.border}`,borderRadius:14,padding:"28px 16px",textAlign:"center",cursor:"pointer",background:drag?C.accentLight:"transparent",transition:"all .2s"}}>
          <div style={{fontSize:32,marginBottom:8}}>{previewType==="video"?"🎬":"📷"}</div>
          <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>Drop {previewType==="video"?"video / GIF":"photo"} here</div>
          <div style={{fontSize:12,color:C.textSub,marginBottom:12}}>or tap to browse</div>
          <span style={{background:C.primary,color:"white",borderRadius:10,padding:"7px 18px",fontSize:12,fontWeight:700}}>Choose File</span>
          <input ref={ref} type="file" accept={accept} style={{display:"none"}} onChange={e=>onChange(e.target.files[0])}/>
        </div>
      )}
      {note&&<div style={{fontSize:11,color:C.textSub,marginTop:6,lineHeight:1.5}}>ℹ {note}</div>}
    </div>
  );
}

/* ═══════════════════ ADMIN PRODUCT FORM ═══════════════════ */
function ProductForm({product,onSave,onDelete,onBack,showToast,settings={}}){
  const isEdit=!!product;
  const [form,setForm]=useState({
    name:product?.name||"",
    category:product?.category||CATEGORIES[0],
    price:product?.price||"",
    stockCount:product?.stockCount ?? DEFAULT_STOCK,
    discountPct:product?.discountPct ?? 0,
    offerEndsAt:product?.offerEndsAt ? new Date(product.offerEndsAt).toISOString().slice(0,16) : "",
    tag:product?.tag||"",
    desc:product?.desc||"",
    comingSoon:!!product?.comingSoon,
    packagingWeight:product?.packagingWeight||"",
    suggestSpecialDelivery:!!product?.suggestSpecialDelivery,
    suggestedPacking:product?.suggestedPacking||"carton_special",
  });
  // Gallery: images [{key,src,b64?}], one video {key,src,b64?,tooLarge?}
  const initImgs=(product?._mediaImgs||[]).map((src,i)=>({key:(product.media?.filter(m=>m.type!=="video")[i]?.key)||uid("mi"),src,existing:true}));
  const [images,setImages]=useState(initImgs);
  const [video,setVideo]=useState(product?._mediaVid?{key:(product.media?.find(m=>m.type==="video")?.key)||uid("mv"),src:product._mediaVid,existing:true}:null);
  const [saving,setSaving]=useState(false);
  const [delConfirm,setDelConfirm]=useState(false);
  const [busyNote,setBusyNote]=useState("");
  const MAX_IMAGES=4;
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  // Live-fish types (variants) — editable. Seed from product or defaults (converted to absolute prices).
  const seedVariants=()=>{
    const src = (product?.variants&&product.variants.length) ? product.variants : DEFAULT_FISH_VARIANTS;
    const base = Number(product?.price)||0;
    return src.map(v=>({ id:v.id||uid("v"), label:v.label, price:(typeof v.price==="number"?v.price:Math.round(base*(v.priceMul||1))), soldOut:!!v.soldOut }));
  };
  const [variants,setVariants]=useState(seedVariants);
  const setVar=(id,key,val)=>setVariants(prev=>prev.map(v=>v.id===id?{...v,[key]:val}:v));
  const addVariant=()=>setVariants(prev=>[...prev,{id:uid("v"),label:"",price:Number(form.price)||0,soldOut:false}]);
  const removeVariant=(id)=>setVariants(prev=>prev.filter(v=>v.id!==id));

  const addImages=async(fileList)=>{
    const files=[...fileList].slice(0,MAX_IMAGES-images.length);
    if(!files.length){ showToast(`Up to ${MAX_IMAGES} photos`,"error"); return; }
    setBusyNote("Processing photos…");
    const added=[];
    for(const file of files){
      try{ const b64=await compressImage(file); added.push({key:uid("mi"),src:b64,b64}); }catch(e){}
    }
    setImages(prev=>[...prev,...added]);
    setBusyNote("");
  };
  const removeImage=(key)=>setImages(prev=>prev.filter(i=>i.key!==key));
  const moveImage=(key,dir)=>setImages(prev=>{ const i=prev.findIndex(x=>x.key===key); const j=i+dir; if(j<0||j>=prev.length)return prev; const next=[...prev]; [next[i],next[j]]=[next[j],next[i]]; return next; });

  const handleVid=async file=>{
    const url=URL.createObjectURL(file);
    if(file.size>5*1024*1024){ setVideo({key:uid("mv"),src:url,tooLarge:true}); setBusyNote(`⚠ Video ${fmtSize(file.size)} — too large to save (keep under 5MB)`); }
    else { const b64=await fileToBase64(file); setVideo({key:uid("mv"),src:url,b64}); setBusyNote(`✓ Video ${fmtSize(file.size)} ready`); }
  };

  const handleSave=async()=>{
    if(!form.name.trim()){showToast("Product name required","error");return;}
    if(!form.price||isNaN(form.price)||Number(form.price)<=0){showToast("Enter a valid price","error");return;}
    setSaving(true);
    const id=product?.id||uid();
    // Persist any newly-added media items
    const media=[];
    for(const im of images){
      if(im.b64){ await saveMediaItem(im.key,im.b64); }
      media.push({key:im.key,type:"image"});
    }
    if(video && !video.tooLarge){
      if(video.b64){ await saveMediaItem(video.key,video.b64); }
      media.push({key:video.key,type:"video"});
    }
    // Clean up removed media items (were on the product, now gone)
    const keptKeys=new Set(media.map(m=>m.key));
    (product?.media||[]).forEach(m=>{ if(!keptKeys.has(m.key)) delMediaItem(m.key); });

    const firstImg=images.find(i=>i.src)?.src || "";
    const saved={id,name:form.name,category:form.category,tag:form.tag,desc:form.desc,
      price:Number(form.price),
      stockCount:Math.max(0,parseInt(form.stockCount)||0),
      discountPct:Math.min(100,Math.max(0,parseInt(form.discountPct)||0)),
      offerEndsAt:form.offerEndsAt?new Date(form.offerEndsAt).toISOString():null,
      comingSoon:!!form.comingSoon,
      packagingWeight:Number(form.packagingWeight)||0,
      suggestSpecialDelivery:!!form.suggestSpecialDelivery,
      suggestedPacking:form.suggestedPacking||"carton_special",
      media,
      rating:product?.rating||0,reviews:product?.reviews||0,
      variants: form.category==="Live Fish"
        ? variants.filter(v=>v.label.trim()).map(v=>({id:v.id,label:v.label.trim(),price:Math.max(0,Math.round(Number(v.price)||0)),soldOut:!!v.soldOut}))
        : null,
      createdAt:product?.createdAt||new Date().toISOString()};
    // Build a cache patch so the UI shows new media immediately
    const cachePatch={};
    images.forEach(im=>{ if(im.src) cachePatch["m-"+im.key]=im.src; });
    if(video&&!video.tooLarge&&video.src) cachePatch["m-"+video.key]=video.b64||video.src;
    await onSave(saved, cachePatch);
    setSaving(false);
  };

  const fld=(label,key,type="text",ph="",opts={})=>(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{label}</div>
      {opts.textarea
        ?<textarea value={form[key]} onChange={e=>f(key,e.target.value)} rows={4} placeholder={ph} style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,resize:"vertical",outline:"none",lineHeight:1.6,background:"white"}}/>
        :<input type={type} value={form[key]} onChange={e=>f(key,e.target.value)} placeholder={ph} style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
      }
    </div>
  );

  return(
    <div className="slide-up">
      <div style={{background:C.adminBg,padding:"52px 16px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button className="press" onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:20,fontWeight:800,color:"white"}}>{isEdit?"Edit Product":"Add Product"}</div>
      </div>
      <div className="dt-read" style={{padding:"20px 16px 100px"}}>
        {fld("Product Name","name","text","e.g. Betta Splendens")}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Category</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {CATEGORIES.map(cat=>(
              <button key={cat} className="press" onClick={()=>f("category",cat)}
                style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${form.category===cat?C.primary:C.border}`,background:form.category===cat?C.primary:"transparent",color:form.category===cat?"white":C.textSub,fontSize:12,fontWeight:600,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",gap:5}}>
                {CAT_META[cat].emoji} {cat}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Price (₹)</div>
            <input type="number" value={form.price} onChange={e=>f("price",e.target.value)} placeholder="350" min="0" style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Stock Count</div>
            <input type="number" value={form.stockCount} onChange={e=>f("stockCount",e.target.value)} placeholder="10" min="0" style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
            <div style={{fontSize:11,color:C.textSub,marginTop:4}}>Customers can order up to this many (max {MAX_PER_ORDER}).</div>
          </div>
        </div>

        {/* Offer / discount */}
        <div style={{background:"#fff7ed",borderRadius:14,padding:"14px",marginBottom:16,border:`1px solid #fed7aa`}}>
          <div style={{fontSize:12,fontWeight:800,color:"#c2410c",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>⚡ Offer &amp; Discount</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:12}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:6}}>Discount %</div>
              <input type="number" value={form.discountPct} onChange={e=>f("discountPct",e.target.value)} placeholder="0" min="0" max="100" style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:6}}>Offer ends (optional)</div>
              <input type="datetime-local" value={form.offerEndsAt} onChange={e=>f("offerEndsAt",e.target.value)} style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:13,outline:"none",background:"white"}}/>
            </div>
          </div>
          {Number(form.discountPct)>0&&form.price&&(
            <div style={{fontSize:12,color:"#c2410c",fontWeight:700,marginTop:10}}>
              Sale price: ₹{Math.round(Number(form.price)*(1-Number(form.discountPct)/100))} <span style={{textDecoration:"line-through",color:C.textSub,fontWeight:500}}>₹{form.price}</span>
              {form.offerEndsAt&&" · countdown shows on Home"}
            </div>
          )}
        </div>
        {fld("Tag / Badge","tag","text","e.g. Popular, New Arrival, Sale")}

        <label style={{display:"flex",alignItems:"center",gap:10,background:"#eef9fa",borderRadius:12,padding:"12px 14px",marginBottom:16,cursor:"pointer",userSelect:"none",border:`1px solid ${C.border}`}}>
          <input type="checkbox" checked={!!form.comingSoon} onChange={e=>f("comingSoon",e.target.checked)} style={{width:18,height:18,accentColor:C.accent,flexShrink:0}}/>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.text}}>🔜 Mark as "Coming Soon"</div>
            <div style={{fontSize:11,color:C.textSub,marginTop:2,lineHeight:1.45}}>Shows a Coming Soon badge + "Interested" button instead of Add. Track demand before stocking.</div>
          </div>
        </label>

        {/* Live Fish types — editable */}
        {form.category==="Live Fish"&&(
          <div style={{background:"#eef9fa",borderRadius:14,padding:"14px",marginBottom:16,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:800,color:C.primary,textTransform:"uppercase",letterSpacing:.8}}>🐠 Live Fish Types</div>
              <span style={{fontSize:11,color:C.textSub}}>{variants.length} option{variants.length!==1?"s":""}</span>
            </div>
            <div style={{fontSize:11,color:C.textSub,marginBottom:12,lineHeight:1.45}}>Customers pick one of these on the product page. Set a label, price and packing weight (kg) for each. The weight is used to calculate live-fish shipping accurately.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {variants.map((v,idx)=>(
                <div key={v.id} style={{background:"white",borderRadius:12,padding:"10px",border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <input value={v.label} onChange={e=>setVar(v.id,"label",e.target.value)} placeholder="e.g. 1 Pair — Male & Female"
                      style={{flex:1,borderRadius:9,border:`1.5px solid ${C.border}`,padding:"9px 11px",fontSize:13,outline:"none",background:"white"}}/>
                    <button className="press" onClick={()=>removeVariant(v.id)} title="Remove"
                      style={{flexShrink:0,width:30,height:30,borderRadius:8,background:"#fee2e2",color:C.danger,border:"none",fontSize:15,cursor:"pointer"}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,color:C.textSub,fontWeight:700,marginBottom:3,letterSpacing:.4}}>PRICE</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,background:C.bg,borderRadius:9,padding:"0 10px",border:`1.5px solid ${C.border}`}}>
                        <span style={{fontSize:13,color:C.textSub,fontWeight:700}}>₹</span>
                        <input type="number" min="0" value={v.price} onChange={e=>setVar(v.id,"price",e.target.value)} placeholder="0"
                          style={{width:"100%",border:"none",background:"transparent",outline:"none",padding:"9px 2px",fontSize:13,fontFamily:PRICE_FONT,fontWeight:700}}/>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.textSub,fontWeight:700,marginBottom:3,letterSpacing:.4}}>PACKING WEIGHT</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,background:C.bg,borderRadius:9,padding:"0 10px",border:`1.5px solid ${C.border}`}} title="Packing weight for this type (kg) — used for shipping">
                        <input type="number" step="0.05" min="0" value={v.packagingWeight??""} onChange={e=>setVar(v.id,"packagingWeight",e.target.value===''?null:Number(e.target.value))} placeholder="0.20"
                          style={{width:"100%",border:"none",background:"transparent",outline:"none",padding:"9px 2px",fontSize:13,fontFamily:PRICE_FONT,fontWeight:700}}/>
                        <span style={{fontSize:12,color:C.textSub,fontWeight:700,whiteSpace:"nowrap"}}>kg</span>
                      </div>
                    </div>
                  </div>
                  <button className="press" onClick={()=>setVar(v.id,"soldOut",!v.soldOut)}
                    style={{width:"100%",padding:"9px 12px",borderRadius:9,border:`1.5px solid ${v.soldOut?C.danger:C.border}`,background:v.soldOut?"#fee2e2":"transparent",color:v.soldOut?C.danger:C.textSub,fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                    {v.soldOut?"Sold out":"In stock"}
                  </button>
                </div>
              ))}
            </div>
            <button className="press" onClick={addVariant}
              style={{width:"100%",marginTop:10,background:"white",border:`1.5px dashed ${C.primary}`,color:C.primary,borderRadius:10,padding:"10px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              ＋ Add a type
            </button>
          </div>
        )}

        {fld("Description","desc","text","Describe the product…",{textarea:true})}

        {/* Packaging weight + special delivery suggestion */}
        {form.category==="Live Fish" ? (
          /* Live fish weight is set per-variant (type-wise) above. Admin recommends a packing here. */
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,letterSpacing:.6,marginBottom:5,textTransform:"uppercase"}}>recommended packing for this fish</div>
            <select value={form.suggestedPacking||"carton_special"} onChange={e=>f("suggestedPacking",e.target.value)}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"11px 12px",fontSize:13,outline:"none",background:"white",fontFamily:"'Nunito',sans-serif"}}>
              {PACKING_OPTIONS.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <div style={{fontSize:10,color:C.textSub,marginTop:5,lineHeight:1.5}}>Shown as <b>“Recommended”</b> at checkout. For costly / delicate fish choose a <b>Thermacol</b> option (premium packing). The <b>Live Arrival Guarantee</b> applies only when the customer picks this packing or a safer one. Thermacol adds a weight-based charge (set in Settings).</div>
          </div>
        ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,letterSpacing:.6,marginBottom:5}}>packaging weight (kg)</div>
            <input type="number" step="0.1" min="0" value={form.packagingWeight} onChange={e=>f("packagingWeight",e.target.value)} placeholder="e.g. 0.2"
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:13,outline:"none",background:"white"}}/>
            <div style={{fontSize:10,color:C.textSub,marginTop:3}}>Weight of product + packaging in kg, used for shipping.</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:4}}>
            <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={!!form.suggestSpecialDelivery} onChange={e=>f("suggestSpecialDelivery",e.target.checked)} style={{width:16,height:16,accentColor:C.primary,flexShrink:0,marginTop:2}}/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.text}}>suggest speed delivery</div>
                <div style={{fontSize:10,color:C.textSub,marginTop:2,lineHeight:1.4}}>Highlight Speed Delivery option at checkout for this product.</div>
              </div>
            </label>
          </div>
        </div>
        )}

        {/* Photos — up to 4, from device */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8}}>Photos <span style={{color:C.primary}}>({images.length}/{MAX_IMAGES})</span></div>
            <div style={{fontSize:11,color:C.textSub}}>First photo = main image</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {images.map((im,idx)=>(
              <div key={im.key} style={{position:"relative",aspectRatio:"1",borderRadius:12,overflow:"hidden",border:`1.5px solid ${idx===0?C.primary:C.border}`,background:C.bg}}>
                <img src={im.src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                {idx===0&&<span style={{position:"absolute",top:3,left:3,background:C.primary,color:"white",fontSize:8,fontWeight:800,padding:"2px 5px",borderRadius:6}}>MAIN</span>}
                <button onClick={()=>removeImage(im.key)} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,.6)",color:"white",border:"none",fontSize:12,lineHeight:1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                {idx>0&&<button onClick={()=>moveImage(im.key,-1)} style={{position:"absolute",bottom:3,left:3,width:20,height:20,borderRadius:6,background:"rgba(255,255,255,.92)",color:C.primary,border:"none",fontSize:12,fontWeight:800,cursor:"pointer",lineHeight:1}}>←</button>}
                {idx<images.length-1&&<button onClick={()=>moveImage(im.key,1)} style={{position:"absolute",bottom:3,right:3,width:20,height:20,borderRadius:6,background:"rgba(255,255,255,.92)",color:C.primary,border:"none",fontSize:12,fontWeight:800,cursor:"pointer",lineHeight:1}}>→</button>}
              </div>
            ))}
            {images.length<MAX_IMAGES&&(
              <label style={{aspectRatio:"1",borderRadius:12,border:`1.5px dashed ${C.primary}`,background:C.accentLight,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.primary}}>
                <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{addImages(e.target.files);e.target.value="";}}/>
                <span style={{fontSize:24,lineHeight:1}}>＋</span>
                <span style={{fontSize:10,fontWeight:700,marginTop:2}}>Add</span>
              </label>
            )}
          </div>
        </div>

        {/* Video */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Video <span style={{fontWeight:400,textTransform:"none"}}>(optional, ≤5MB)</span></div>
          {video?(
            <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:`1.5px solid ${C.border}`,background:"#000"}}>
              <video src={video.src} controls playsInline style={{width:"100%",maxHeight:200,display:"block"}}/>
              <button onClick={()=>{setVideo(null);setBusyNote("");}} style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:"50%",background:"rgba(0,0,0,.6)",color:"white",border:"none",fontSize:15,cursor:"pointer"}}>×</button>
              {video.tooLarge&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(220,38,38,.9)",color:"white",fontSize:10,fontWeight:700,padding:"4px 8px",textAlign:"center"}}>Too large to save — won't persist</div>}
            </div>
          ):(
            <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,borderRadius:12,border:`1.5px dashed ${C.border}`,background:C.bg,padding:"16px",cursor:"pointer",color:C.textSub,fontSize:13,fontWeight:600,fontFamily:"'Nunito',sans-serif"}}>
              <input type="file" accept="video/*,.gif" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleVid(e.target.files[0]);e.target.value="";}}/>
              🎬 Add a short video
            </label>
          )}
        </div>
        {busyNote&&<div style={{fontSize:12,color:busyNote.startsWith("⚠")?C.danger:C.textSub,fontWeight:600,marginBottom:12,marginTop:-4}}>{busyNote}</div>}

        <button className="press" onClick={handleSave} disabled={saving}
          style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:16,padding:"16px",fontSize:15,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:saving?.7:1}}>
          {saving?<><Spinner/> Saving…</>:isEdit?"💾 Save Changes":"✓ Add Product"}
        </button>
        {isEdit&&!delConfirm&&(
          <button className="press" onClick={()=>setDelConfirm(true)} style={{width:"100%",background:"transparent",color:C.danger,border:`1.5px solid ${C.danger}`,borderRadius:16,padding:"14px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>🗑 Delete Product</button>
        )}
        {delConfirm&&(
          <div style={{background:"#fee2e2",borderRadius:16,padding:"16px",border:`1.5px solid ${C.danger}`}}>
            <div style={{fontSize:14,fontWeight:700,color:C.danger,marginBottom:12,textAlign:"center"}}>Delete "{product.name}"?</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button className="press" onClick={()=>setDelConfirm(false)} style={{padding:"12px",borderRadius:12,border:`1px solid ${C.border}`,background:"white",color:C.text,fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
              <button className="press" onClick={()=>onDelete(product.id)} style={{padding:"12px",borderRadius:12,border:"none",background:C.danger,color:"white",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Yes, Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ ADMIN ORDER DETAIL (Phase 4) ═══════════════════ */
function AdminOrderDetail({order:o,onBack,onUpdateOrder,onDeleteOrder,showToast,settings={}}){
  const [status,setStatus]=useState(o.status);
  const [tracking,setTracking]=useState(o.trackingNumber||"");
  const [etaDays,setEtaDays]=useState(o.etaDays!=null?o.etaDays:"");
  const couriers=settings.couriers||[];
  const [courierId,setCourierId]=useState(o.courierId||"");
  const selCourier=couriers.find(c=>c.id===courierId)||null;
  const rewardMin=Number(settings.shippingRewardMin??10);
  const [actualShip,setActualShip]=useState("");
  const [verified,setVerified]=useState(o.paymentStatus==="Verified");
  const [proofZoom,setProofZoom]=useState(false);
  const [saving,setSaving]=useState(false);
  const [rejectConfirm,setRejectConfirm]=useState(false);
  const [delOrderConfirm,setDelOrderConfirm]=useState(false);
  const amtDue=o.amountDue??(o.total+o.fee);
  // Was money actually collected for this order? (verified payment, a proof, a paid timestamp, or already progressed past payment)
  const paidish=o.paymentStatus==="Verified"||!!o.paidAt||!!o.paymentProof||["Confirmed","Shipped","Delivered"].includes(o.status);
  const [cancelOpen,setCancelOpen]=useState(false);
  const [refundMethod,setRefundMethod]=useState(o.refund?.method&&o.refund.method!=="none"?o.refund.method:"upi");
  const [refundTxn,setRefundTxn]=useState(o.refund?.refundTxnId||"");
  const [refundAmt,setRefundAmt]=useState(o.refund?.amount!=null?o.refund.amount:amtDue);
  const [refundStatus,setRefundStatus]=useState(o.refund?.status&&o.refund.status!=="none"?o.refund.status:"pending");
  const [cancelReason,setCancelReason]=useState(o.cancelReason||"");
  const custWA="91"+(o.address.whatsapp||o.address.phone).replace(/\D/g,"");

  const buildRefund=()=>{
    if(!paidish) return { due:false, amount:0, method:"none", refundTxnId:"", status:"none", updatedAt:new Date().toISOString() };
    return { due:true, amount:Math.max(0,Number(refundAmt)||0), method:refundMethod,
      refundTxnId: refundMethod==="upi"?refundTxn.trim():"",
      status: refundMethod==="gateway" ? (refundStatus==="refunded"?"refunded":"processing") : refundStatus,
      updatedAt:new Date().toISOString() };
  };
  const doCancel=async()=>{
    setSaving(true);
    const updated={...o,status:"Cancelled",paymentStatus:"Cancelled by store",cancelReason:cancelReason.trim(),refund:buildRefund(),updatedAt:new Date().toISOString()};
    setStatus("Cancelled");
    await onUpdateOrder(updated);
    showToast(paidish?"Order cancelled — refund recorded":"Order cancelled");
    setSaving(false); setCancelOpen(false);
  };
  const saveRefund=async()=>{
    setSaving(true);
    await onUpdateOrder({...o,refund:buildRefund(),updatedAt:new Date().toISOString()});
    showToast("Refund details saved");
    setSaving(false);
  };
  const refundFld={width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:14,outline:"none",background:"white",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"};
  const refundEditor=()=>(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[{k:"upi",l:"Manual UPI"},{k:"gateway",l:"Auto / Gateway"}].map(m=>(
          <button key={m.k} className="press" type="button" onClick={()=>setRefundMethod(m.k)}
            style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${refundMethod===m.k?C.primary:C.border}`,background:refundMethod===m.k?C.primary:"transparent",color:refundMethod===m.k?"white":C.textSub,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>{m.l}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Refund amount (₹)</div>
          <input type="number" min="0" value={refundAmt} onChange={e=>setRefundAmt(Number(e.target.value))} style={refundFld}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Refund status</div>
          <select value={refundStatus} onChange={e=>setRefundStatus(e.target.value)} style={refundFld}>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </div>
      {refundMethod==="upi"?(
        <div>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Refund Transaction / UPI Ref ID</div>
          <input value={refundTxn} onChange={e=>setRefundTxn(e.target.value)} placeholder="e.g. 4231XXXXXX98" style={refundFld}/>
          <div style={{fontSize:10.5,color:C.textSub,marginTop:4,lineHeight:1.5}}>Shown to the customer on their order page so they can match the UPI refund you sent.</div>
        </div>
      ):(
        <div style={{fontSize:11,color:C.textSub,lineHeight:1.5}}>Gateway refunds are returned automatically to the customer's original payment method in 3–7 working days.</div>
      )}
    </div>
  );

  const liveInOrder=o.items.some(it=>it.category==="Live Fish");
  const [doaStatus,setDoaStatus]=useState(o.doa?.status&&o.doa.status!=="Requested"?o.doa.status:"Under Review");
  const [doaNote,setDoaNote]=useState(o.doa?.note||"");
  const saveDoa=async()=>{
    setSaving(true);
    await onUpdateOrder({...o,doa:{...(o.doa||{}),status:doaStatus,note:doaNote.trim(),requestedAt:o.doa?.requestedAt||new Date().toISOString(),updatedAt:new Date().toISOString()}});
    showToast("DOA request updated");
    setSaving(false);
  };

  const handleUpdate=async()=>{
    setSaving(true);
    const updated={...o,status,trackingNumber:tracking,etaDays:etaDays===""?"":Math.max(0,Number(etaDays)||0),courierId,courierName:selCourier?.name||"",courierTrackUrl:selCourier?.trackUrl||"",updatedAt:new Date().toISOString()};
    await onUpdateOrder(updated);
    showToast("Order updated!");
    setSaving(false);
  };
  // Closing an order: only once it's delivered and no DOA is still open.
  const doaResolved = !o.doa || (o.doa.status||"").startsWith("Approved") || o.doa.status==="Declined";
  const doClose=async()=>{
    setSaving(true);
    await onUpdateOrder({...o,closed:true,closedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    showToast("Order closed — all done ✓");
    setSaving(false);
  };
  const doReopen=async()=>{
    setSaving(true);
    await onUpdateOrder({...o,closed:false,closedAt:"",updatedAt:new Date().toISOString()});
    showToast("Order reopened");
    setSaving(false);
  };
  // Shipping reward is based on COURIER charge only — packaging (thermacol) is never rewardable.
  const courierCharged=Math.max(0, Number(o.fee||0) - Number(o.thermacolFee||0));
  const chargedShip=courierCharged;
  const [rewardConfirm,setRewardConfirm]=useState(false);
  const issueShippingReward=async()=>{
    const actual=Number(actualShip);
    if(!(actual>=0)){ showToast("Enter the actual courier cost","error"); return; }
    const diff=Math.round(chargedShip-actual);
    if(diff<rewardMin){ showToast(`Difference must be at least ₹${rewardMin} to reward`,"error"); return; }
    setSaving(true);
    const code="NEMO"+Math.random().toString(36).slice(2,7).toUpperCase();
    const reward={code,amount:diff,actual,charged:chargedShip,issuedAt:new Date().toISOString()};
    await onUpdateOrder({...o,shippingReward:reward,updatedAt:new Date().toISOString()});
    // Credit the customer's wallet directly (admin context — rules permit writing any loyalty node).
    const coinVal=Number(settings.loyaltyRedeemValue||1)||1;
    const coins=Math.round(diff/coinVal);
    if(coins>0 && o.userUid) adminCreditLoyalty(o.userUid, coins, "ship:"+code, "Shipping refund");
    showToast(`₹${diff} credited to ${o.address.name}'s wallet`);
    setRewardConfirm(false);
    setSaving(false);
  };
  const verifyPayment=async(ok)=>{
    setSaving(true);
    const updated= ok
      ? {...o,paymentStatus:"Verified",status:"Confirmed",updatedAt:new Date().toISOString()}
      : {...o,paymentStatus:"Rejected",status:"Cancelled",updatedAt:new Date().toISOString()};
    setVerified(ok); setStatus(updated.status);
    await onUpdateOrder(updated);
    showToast(ok?"Payment verified — order confirmed ✓":"Payment rejected — order cancelled");
    setSaving(false);
  };
  const sendWA=(st)=>{
    if(!o.address.phone&&!o.address.whatsapp){showToast("No customer WhatsApp number","error");return;}
    openWA(custWA,waStatusMsg(o,st,tracking));
    showToast(`Opening WhatsApp — ${st} message`);
  };

  const statusColor={Placed:"#1d4ed8",Confirmed:C.success,Shipped:"#c2410c",Delivered:C.success};

  return(
    <div className="slide-up">
      <div style={{background:C.adminBg,padding:"52px 16px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button className="press" onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.65)",fontWeight:600,letterSpacing:1}}>ORDER {orderId(o.id)}</div>
          <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:18,fontWeight:800,color:"white"}}>{o.address.name}</div>
        </div>
      </div>

      <div className="dt-read" style={{padding:"20px 16px 100px"}}>
        {/* Current status */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Order Status</div>
          {/* Status steps */}
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,position:"relative"}}>
            <div style={{position:"absolute",top:12,left:"12.5%",right:"12.5%",height:2,background:C.border,zIndex:0}}/>
            <div style={{position:"absolute",top:12,left:"12.5%",height:2,background:C.primary,zIndex:1,
              width:(()=>{const i=ORDER_STATUSES.indexOf(status);return i<=0?"0%":`${(i/(ORDER_STATUSES.length-1))*75}%`;})(),transition:"width .5s"}}/>
            {ORDER_STATUSES.map((s,i)=>{
              const done=ORDER_STATUSES.indexOf(status)>=i;
              return(
                <div key={s} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,zIndex:2,flex:1}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:done?C.primary:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:done?"white":C.textSub,transition:"all .3s"}}>
                    {done?"✓":i+1}
                  </div>
                  <span style={{fontSize:9,fontWeight:700,color:done?C.primary:C.textSub,textAlign:"center"}}>{s}</span>
                </div>
              );
            })}
          </div>
          {/* Status selector */}
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>Update Status</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {ORDER_STATUSES.map(s=>(
              <button key={s} className="press" onClick={()=>setStatus(s)}
                style={{padding:"9px 12px",borderRadius:12,border:`1.5px solid ${status===s?C.primary:C.border}`,background:status===s?C.primary:"transparent",color:status===s?"white":C.textSub,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                {s}
              </button>
            ))}
          </div>
          {/* Tracking */}
          {(status==="Shipped"||status==="Delivered")&&(
            <div style={{marginBottom:12}}>
              {couriers.length>0 ? (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Courier Partner</div>
                  <select value={courierId} onChange={e=>setCourierId(e.target.value)}
                    style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:C.bg,fontFamily:"'Nunito',sans-serif"}}>
                    <option value="">— Select courier —</option>
                    {couriers.map(c=><option key={c.id} value={c.id}>{c.name||"(unnamed)"}</option>)}
                  </select>
                </div>
              ) : (
                <div style={{fontSize:11,color:"#9a3412",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"8px 11px",marginBottom:10,lineHeight:1.45}}>Add your courier partners in <b>Settings → Live-Fish Packing &amp; Couriers</b> to give customers a Track button.</div>
              )}
              <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Consignment / Tracking Number</div>
              <input value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="e.g. DTDC123456789IN"
                style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:C.bg,boxSizing:"border-box"}}/>
              {selCourier&&selCourier.trackUrl&&<div style={{fontSize:11,color:C.success,marginTop:6,fontWeight:600}}>✓ Customer will see a <b>Track</b> button linking to {selCourier.name}.</div>}
            </div>
          )}
          {/* Estimated delivery time (days) — shown to the customer on their order */}
          {(status==="Confirmed"||status==="Shipped"||status==="Delivered")&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Estimated Delivery (days)</div>
              <input type="number" min="0" value={etaDays} onChange={e=>setEtaDays(e.target.value)} placeholder="e.g. 3"
                style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:C.bg,boxSizing:"border-box"}}/>
              <div style={{fontSize:10.5,color:C.textSub,marginTop:5}}>Shows on the customer's order as “Estimated delivery: in X day(s)”. Leave blank to hide.</div>
            </div>
          )}
          <button className="press" onClick={handleUpdate} disabled={saving}
            style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:saving?.7:1}}>
            {saving?<><Spinner/>Saving…</>:"💾 Save Status Update"}
          </button>
        </div>

        {/* Close / complete order — once delivered safely with no pending DOA */}
        {o.status==="Delivered" && (
          <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>✅ Complete Order</div>
            {o.closed ? (
              <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:12,padding:"12px"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#15803d",marginBottom:3}}>✓ Order closed — all done</div>
                <div style={{fontSize:11.5,color:"#166534",lineHeight:1.5,marginBottom:10}}>Delivered safely and finalised{o.closedAt?` on ${fmtDate(o.closedAt)}`:""}. Nothing more to do here.</div>
                <button className="press" onClick={doReopen} disabled={saving}
                  style={{background:"white",color:C.textSub,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>↺ Reopen order</button>
              </div>
            ) : !doaResolved ? (
              <div style={{fontSize:12,color:"#9a3412",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"11px 13px",lineHeight:1.5}}>⏳ A Dead-on-Arrival request is still open. Resolve the DOA below before closing this order.</div>
            ) : (
              <>
                <div style={{fontSize:12,color:C.textSub,marginBottom:10,lineHeight:1.55}}>Everything delivered safely and no DOA is pending. Close this order to mark it fully complete.</div>
                <button className="press" onClick={doClose} disabled={saving}
                  style={{width:"100%",background:C.success,color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>✓ Close this order</button>
              </>
            )}
          </div>
        )}

        {/* Shipping-overcharge reward */}
        {paidish && chargedShip>0 && (
          <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>🎁 Shipping Reward</div>
            {o.shippingReward ? (
              <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:12,padding:"12px"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#15803d",marginBottom:3}}>✓ Reward issued — ₹{o.shippingReward.amount}</div>
                <div style={{fontSize:12,color:"#166534",lineHeight:1.55}}>₹{o.shippingReward.amount} has been credited to the customer's 👛 wallet. (Courier charged ₹{o.shippingReward.charged} · actual ₹{o.shippingReward.actual}.)</div>
              </div>
            ) : (
              <>
                <div style={{fontSize:12,color:C.textSub,marginBottom:6,lineHeight:1.55}}>Customer paid <b style={{color:C.text}}>₹{chargedShip}</b> in <b>courier charges</b> for this order{Number(o.thermacolFee||0)>0?<> (₹{o.fee} shipping − ₹{o.thermacolFee} thermacol packaging, which is not rewardable)</>:null}. If the courier actually cost you less (by ≥ ₹{rewardMin}), give the difference back as a reward code.</div>
                <div style={{fontSize:11,color:"#15803d",background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:9,padding:"7px 10px",marginBottom:10,lineHeight:1.45}}>ℹ️ Reward is based on the <b>courier partner charge only</b> — packaging costs are excluded.</div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,color:C.text,fontWeight:700,whiteSpace:"nowrap"}}>Actual courier cost ₹</span>
                  <input type="number" min="0" value={actualShip} onChange={e=>{setActualShip(e.target.value);setRewardConfirm(false);}} placeholder="0"
                    style={{width:"100px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 11px",fontSize:14,outline:"none",background:C.bg}}/>
                  {actualShip!==""&&Number(actualShip)>=0&&(
                    <span style={{fontSize:12,fontWeight:700,color:(chargedShip-Number(actualShip))>=rewardMin?C.success:C.textSub}}>
                      → reward ₹{Math.max(0,Math.round(chargedShip-Number(actualShip)))}
                    </span>
                  )}
                </div>
                {rewardConfirm ? (
                  <div style={{background:"#ecfdf5",border:`1.5px solid #34d399`,borderRadius:12,padding:"12px"}}>
                    <div style={{fontSize:12.5,fontWeight:700,color:"#15803d",marginBottom:10,textAlign:"center",lineHeight:1.5}}>Credit <b>{o.address.name}</b>'s 👛 wallet with ₹{Math.max(0,Math.round(chargedShip-Number(actualShip)))}? They can redeem it at checkout on a future order.</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <button className="press" onClick={()=>setRewardConfirm(false)} disabled={saving}
                        style={{background:"white",color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
                      <button className="press" onClick={issueShippingReward} disabled={saving}
                        style={{background:C.success,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>✓ Yes, issue</button>
                    </div>
                  </div>
                ) : (
                  <button className="press" onClick={()=>{ if(actualShip===""){showToast("Enter the actual courier cost","error");return;} if((chargedShip-Number(actualShip))<rewardMin){showToast(`Difference must be at least ₹${rewardMin}`,"error");return;} setRewardConfirm(true); }} disabled={saving||actualShip===""}
                    style={{width:"100%",background:(actualShip!==""&&(chargedShip-Number(actualShip))>=rewardMin)?C.success:"#9ca3af",color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>
                    🎁 Create Reward Code
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Payment — prepayment verification */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>💳 Payment Verification</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>Amount: ₹{o.amountDue??(o.total+o.fee)}</div>
              <div style={{fontSize:12,color:verified?C.success:"#c2410c",fontWeight:600,marginTop:2}}>{verified?"✓ Verified":o.paymentStatus||"Awaiting payment"}</div>
            </div>
            <StatusBadge status={o.status}/>
          </div>
          {o.txnId&&<div style={{background:C.bg,borderRadius:10,padding:"9px 12px",marginBottom:10,fontSize:12.5}}><span style={{color:C.textSub}}>Txn / Ref ID: </span><b style={{color:C.text}}>{o.txnId}</b></div>}
          {o.paymentProof?(
            <button className="press" onClick={()=>setProofZoom(true)} style={{display:"block",width:"100%",padding:0,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",background:"#0c2b30",marginBottom:10,cursor:"zoom-in"}}>
              <img src={o.paymentProof} alt="payment proof" style={{width:"100%",maxHeight:260,objectFit:"contain",display:"block"}}/>
            </button>
          ):(
            <div style={{fontSize:12,color:C.textSub,marginBottom:10,fontStyle:"italic"}}>No payment screenshot uploaded yet.</div>
          )}
          {(o.status==="Payment Review"||o.status==="Awaiting Payment")&&(
            rejectConfirm?(
              <div style={{background:"#fee2e2",borderRadius:12,padding:"12px",border:`1.5px solid ${C.danger}`}}>
                <div style={{fontSize:12.5,fontWeight:700,color:C.danger,marginBottom:10,textAlign:"center"}}>Reject this payment &amp; cancel the order? This can't be undone.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button className="press" onClick={()=>setRejectConfirm(false)} disabled={saving}
                    style={{background:"white",color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Keep order</button>
                  <button className="press" onClick={()=>{setRejectConfirm(false);verifyPayment(false);}} disabled={saving}
                    style={{background:C.danger,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Yes, reject</button>
                </div>
              </div>
            ):(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button className="press" onClick={()=>verifyPayment(true)} disabled={saving}
                style={{background:C.success,color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>✓ Verify &amp; Confirm</button>
              <button className="press" onClick={()=>setRejectConfirm(true)} disabled={saving}
                style={{background:"transparent",color:C.danger,border:`1.5px solid ${C.danger}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>✕ Reject / Cancel</button>
            </div>
            )
          )}
          {verified&&<div style={{fontSize:11.5,color:C.success,fontWeight:600,marginTop:8}}>Payment verified — order confirmed &amp; moved to processing.</div>}
        </div>

        {proofZoom&&o.paymentProof&&(
          <Portal>
          <div onClick={()=>setProofZoom(false)} style={{position:"fixed",inset:0,background:"rgba(4,16,20,.92)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <img src={o.paymentProof} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}}/>
            <button className="press" onClick={()=>setProofZoom(false)} style={{position:"absolute",top:18,right:18,width:42,height:42,borderRadius:"50%",background:"rgba(255,255,255,.18)",border:"none",color:"white",fontSize:22}}>✕</button>
          </div>
          </Portal>
        )}

        {/* WhatsApp updates */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:4}}>💬 Send WhatsApp Update</div>
          <div style={{fontSize:12,color:C.textSub,marginBottom:4}}>Customer: {o.address.whatsapp||o.address.phone}</div>
          {o.waUpdates===false
            ? <div style={{fontSize:11.5,color:"#c2410c",fontWeight:600,marginBottom:10,background:"#fff7ed",borderRadius:8,padding:"7px 10px"}}>⚠ Customer opted out of WhatsApp updates — only message if needed.</div>
            : <div style={{fontSize:11.5,color:C.success,fontWeight:600,marginBottom:10}}>✓ Customer opted in to WhatsApp updates</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {["Confirmed","Shipped","Delivered"].map(s=>(
              <button key={s} className="press" onClick={()=>sendWA(s)}
                style={{background:"#25D366",color:"white",border:"none",borderRadius:12,padding:"12px 16px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",gap:8}}>
                <span>💬</span>Send "{s}" Message
              </button>
            ))}
          </div>
        </div>

        {/* Order items */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:12}}>Order Items</div>
          {o.items.map((item,i)=>{
            const m=CAT_META[item.category]||CAT_META["Live Fish"];
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{m.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text}}>{item.name}</div>
                  <div style={{fontSize:11,color:C.textSub}}>x{item.qty}</div>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:C.primary}}>₹{item.price*item.qty}</div>
              </div>
            );
          })}
          <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:8}}>
            {[
              {l:"Subtotal",v:`₹${o.total}`},
              {l:`Shipping${o.shippingZoneLabel?" ("+o.shippingZoneLabel+")":""}${o.specialDelivery?" + Special":""}`,v:`₹${o.fee||0}`},
              ...(o.liveGuarantee?[{l:"Live Arrival Guarantee",v:o.liveGuaranteeFee>0?`₹${o.liveGuaranteeFee}`:"Included",color:"#15803d"}]:[]),
              ...(o.coupon&&o.couponDiscount?[{l:`Coupon (${o.coupon})`,v:`-₹${o.couponDiscount}`,color:"#16a34a"}]:[]),
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:12,color:r.color||C.textSub}}>{r.l}</span>
                <span style={{fontSize:12,fontWeight:600,color:r.color||C.text}}>{r.v}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,paddingTop:6,borderTop:`1px dashed ${C.border}`}}>
              <span style={{fontSize:13,fontWeight:700,color:C.text}}>Grand Total</span>
              <span style={{fontFamily:PRICE_FONT,fontSize:15,fontWeight:800,color:C.primary}}>₹{o.amountDue??(o.total+o.fee)}</span>
            </div>
          </div>
        </div>

        {/* Address */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:12}}>📍 Delivery Address</div>
          {[{l:"Name",v:o.address.name},{l:"Phone",v:o.address.phone},{l:"WhatsApp",v:o.address.whatsapp||o.address.phone},{l:"Address",v:o.address.address},{l:"City",v:`${o.address.city} — ${o.address.pincode}`}].map((r,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:6}}>
              <span style={{fontSize:12,color:C.textSub,minWidth:60}}>{r.l}</span>
              <span style={{fontSize:12,color:C.text,fontWeight:600}}>{r.v}</span>
            </div>
          ))}
          {o.address.notes&&<div style={{fontSize:12,color:C.textSub,marginTop:4}}>Note: {o.address.notes}</div>}
        </div>

        {/* Customer order summary */}
        {o.summary&&(
          <div style={{background:"#fff7ed",borderRadius:16,padding:"16px",border:`1px solid #fed7aa`,marginTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#c2410c",textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>📝 Customer's Order Summary</div>
            <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{o.summary}</div>
          </div>
        )}

        {/* Bill / Invoice */}
        <div style={{marginTop:14,display:"flex",gap:10}}>
          <button className="press" onClick={()=>openBill(o,settings)}
            style={{flex:1,background:"#fff",color:C.primary,border:`1.5px solid ${C.primary}`,borderRadius:14,padding:"14px",fontSize:13.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            🧾 Quick Bill
          </button>
          <button className="press" onClick={()=>openInvoice(o,settings)}
            style={{flex:1,background:C.primary,color:"#fff",border:`1.5px solid ${C.primary}`,borderRadius:14,padding:"14px",fontSize:13.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            📄 Invoice (PDF)
          </button>
        </div>

        {/* Dead-on-Arrival (DOA) review — for delivered live-fish orders */}
        {liveInOrder && (o.status==="Delivered"||o.doa) && (
          <div style={{background:C.card,borderRadius:16,padding:"16px",marginTop:14,border:`1px solid ${o.doa&&o.doa.status==="Requested"?"#fdba74":C.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>🐟 Dead-on-Arrival (DOA) Request</div>
            {o.doa?(
              <div style={{fontSize:12,color:C.text,marginBottom:10,lineHeight:1.55}}>Customer reported a DOA{o.doa.requestedAt?` on ${fmtDate(o.doa.requestedAt)}`:""}. Review their unboxing video on WhatsApp, then set the outcome below.</div>
            ):(
              <div style={{fontSize:12,color:C.textSub,marginBottom:10,lineHeight:1.55}}>No DOA reported yet. You can still record an outcome here if the customer contacted you directly.</div>
            )}
            <button className="press" onClick={()=>openWA(custWA,encodeURIComponent(`Hi ${o.address.name}, regarding the Dead-on-Arrival report for order ${orderId(o.id)} — please share your unboxing video so we can help.`))}
              style={{width:"100%",background:"#25D366",color:"white",border:"none",borderRadius:10,padding:"10px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>💬 Message customer on WhatsApp</button>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:6}}>Outcome</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {["Under Review","Approved - Replacement","Approved - Store Credit","Approved - Refund","Declined"].map(s=>(
                <button key={s} className="press" onClick={()=>setDoaStatus(s)}
                  style={{padding:"9px 6px",borderRadius:10,border:`1.5px solid ${doaStatus===s?C.primary:C.border}`,background:doaStatus===s?C.primary:"transparent",color:doaStatus===s?"white":C.textSub,fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>{s.replace("Approved - ","✓ ")}</button>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:6}}>Note to customer <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            <textarea value={doaNote} onChange={e=>setDoaNote(e.target.value)} rows={2} placeholder="e.g. Replacement will ship with your next order, or refund sent to your UPI"
              style={{...refundFld,resize:"none",lineHeight:1.5,marginBottom:10}}/>
            <button className="press" onClick={saveDoa} disabled={saving}
              style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",opacity:saving?.7:1}}>💾 Save DOA Outcome</button>
          </div>
        )}

        {/* Cancellation & Refund */}
        <div style={{background:C.card,borderRadius:16,padding:"16px",marginTop:14,border:`1px solid ${o.status==="Cancelled"?"#fecaca":C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>✕ Cancellation &amp; Refund</div>
          {o.status==="Cancelled"?(
            <>
              <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12.5,color:"#b91c1c",fontWeight:600,lineHeight:1.5}}>
                This order is cancelled.{o.cancelReason?` Reason: ${o.cancelReason}`:""}
              </div>
              {paidish?(
                <>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Refund of ₹{amtDue} is due to the customer:</div>
                  {refundEditor()}
                  <button className="press" onClick={saveRefund} disabled={saving}
                    style={{width:"100%",marginTop:12,background:C.primary,color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13.5,fontWeight:800,fontFamily:"'Nunito',sans-serif",opacity:saving?.7:1}}>
                    💾 Save Refund Details
                  </button>
                </>
              ):(
                <div style={{fontSize:12,color:C.textSub,lineHeight:1.5}}>No payment was collected for this order, so no refund is needed.</div>
              )}
            </>
          ):cancelOpen?(
            <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Reason <span style={{fontWeight:400,textTransform:"none"}}>(optional, shown to customer)</span></div>
              <input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="e.g. Out of stock"
                style={{...refundFld,marginBottom:12}}/>
              {paidish?(
                <>
                  <div style={{fontSize:12,fontWeight:700,color:"#b91c1c",marginBottom:8}}>₹{amtDue} was collected — record the refund:</div>
                  {refundEditor()}
                </>
              ):(
                <div style={{fontSize:12,color:C.textSub,lineHeight:1.5,marginBottom:4}}>No payment was collected, so nothing needs to be refunded.</div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14}}>
                <button className="press" onClick={()=>setCancelOpen(false)} disabled={saving}
                  style={{background:"white",color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Keep order</button>
                <button className="press" onClick={doCancel} disabled={saving}
                  style={{background:C.danger,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>{saving?"Cancelling…":"Confirm cancellation"}</button>
              </div>
            </div>
          ):(
            <>
              <div style={{fontSize:12,color:C.textSub,marginBottom:10,lineHeight:1.5}}>Cancel this order and record any refund owed. Stock is automatically returned, and the customer sees the cancellation &amp; refund status on their order page.</div>
              <button className="press" onClick={()=>setCancelOpen(true)}
                style={{width:"100%",background:"transparent",color:C.danger,border:`1.5px solid ${C.danger}`,borderRadius:12,padding:"12px",fontSize:13.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                ✕ Cancel Order
              </button>
            </>
          )}
        </div>

        {/* Delete this order (also removes its payment screenshot) */}
        {onDeleteOrder&&(
          <div style={{marginTop:14}}>
            {delOrderConfirm?(
              <div style={{background:"#fef2f2",border:`1.5px solid ${C.danger}`,borderRadius:14,padding:"14px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.danger,marginBottom:4,textAlign:"center"}}>Delete order {orderId(o.id)} permanently?</div>
                <div style={{fontSize:11,color:"#7f1d1d",marginBottom:10,textAlign:"center",lineHeight:1.5}}>This also removes its payment screenshot and can't be undone.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button className="press" onClick={()=>setDelOrderConfirm(false)}
                    style={{background:"white",color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
                  <button className="press" onClick={()=>{setDelOrderConfirm(false);onDeleteOrder(o);}}
                    style={{background:C.danger,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Yes, delete</button>
                </div>
              </div>
            ):(
            <button className="press" onClick={()=>setDelOrderConfirm(true)}
              style={{width:"100%",background:"#fff",color:C.danger,border:`1.5px solid ${C.danger}`,borderRadius:14,padding:"13px",fontSize:13.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              🗑 Delete This Order
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ ADMIN HUB (Dashboard + Orders) ═══════════════════ */
function AdminHub({products,orders,mediaCache,requests,guides,settings,interestCounts={},onSaveProd,onDeleteProd,onUpdateOrder,onDeleteOrder,onCleanupOrders,onDeleteRequest,onSaveGuide,onDeleteGuide,onSaveSettings,onReviewsChanged,onBack,showToast,onAdminSignIn,showcase=[],onDeleteShowcase,onApproveShowcase,testimonials=[],onDeleteTestimonial}){
  const [tab,setTab]=useState("orders"); // orders | products | reviews | requests | guides | settings | form | orderDetail
  const [editGuide,setEditGuide]=useState(null);
  const [guideFormOpen,setGuideFormOpen]=useState(false);
  const [editProduct,setEditProduct]=useState(null);
  const [viewOrder,setViewOrder]=useState(null);
  const [cleanMonths,setCleanMonths]=useState(6);
  const [cleanConfirm,setCleanConfirm]=useState(false);
  const [visitStats,setVisitStats]=useState(null);
  useEffect(()=>{ loadAnalytics().then(setVisitStats); },[]);
  const [orderFilter,setOrderFilter]=useState("All");
  const [orderSearch,setOrderSearch]=useState("");
  const [csvFrom,setCsvFrom]=useState("");
  const [csvTo,setCsvTo]=useState("");
  // Monthly "download your report" reminder — stamped in localStorage once you export (or dismiss) each month.
  const [exportDone,setExportDone]=useState(()=>{try{return localStorage.getItem("nemo-export-month")===monthKey();}catch(e){return true;}});
  const stampExport=()=>{try{localStorage.setItem("nemo-export-month",monthKey());}catch(e){}setExportDone(true);};
  const [catFilter,setCatFilter]=useState("All");
  const [prodQ,setProdQ]=useState("");
  const [allReviews,setAllReviews]=useState({}); // {pid: [reviews]}
  const [loadingRev,setLoadingRev]=useState(false);
  const [walletBalances,setWalletBalances]=useState({}); // {uid: points}
  const [loadingWallets,setLoadingWallets]=useState(false);

  // Customers derived from orders (one entry per uid, most-recent name/phone)
  const customers=useMemo(()=>{
    const m=new Map();
    [...orders].sort((a,b)=>(a.placedAt||"").localeCompare(b.placedAt||"")).forEach(o=>{
      const uid=o.userUid; if(!uid) return;
      const prev=m.get(uid)||{uid,orders:0,spent:0};
      m.set(uid,{uid,name:o.address?.name||prev.name||"Customer",phone:o.address?.phone||prev.phone||"",email:o.userEmail||prev.email||"",orders:prev.orders+1,spent:prev.spent+Number((o.amountDue??(o.total+o.fee))||0),last:o.placedAt});
    });
    return [...m.values()].sort((a,b)=>(b.last||"").localeCompare(a.last||""));
  },[orders]);

  // Load every customer's wallet balance (admin can read each loyalty/<uid> node).
  const loadWallets=async()=>{
    setLoadingWallets(true);
    const out={};
    await Promise.all(customers.map(async c=>{
      try{ const d=await loadLoyalty(c.uid); out[c.uid]=d.points||0; }catch(e){ out[c.uid]=0; }
    }));
    setWalletBalances(out);
    setLoadingWallets(false);
  };
  useEffect(()=>{ if(tab==="wallets"&&customers.length&&!loadingWallets&&Object.keys(walletBalances).length===0){ loadWallets(); } },[tab,customers.length]);

  // Load all reviews when Reviews tab is opened
  useEffect(()=>{
    if(tab==="reviews"&&!loadingRev){
      setLoadingRev(true);
      Promise.all(products.map(async p=>{
        const revs=await loadReviews(p.id);
        return [p.id,revs];
      })).then(entries=>{
        setAllReviews(Object.fromEntries(entries));
        setLoadingRev(false);
      });
    }
  },[tab]);

  const handleDeleteReview=async(pid,rid)=>{
    const next=await deleteReview(pid,rid);
    setAllReviews(prev=>({...prev,[pid]:next}));
    onReviewsChanged && onReviewsChanged(pid, next);
    showToast("Review deleted");
  };

  const filteredOrders=orders.filter(o=>{
    if(orderFilter!=="All" && o.status!==orderFilter) return false;
    const q=orderSearch.trim().toLowerCase();
    if(!q) return true;
    // Match on order number, name, or phone
    return (o.orderNo||orderId(o.id)||"").toLowerCase().includes(q)
      || (o.address?.name||"").toLowerCase().includes(q)
      || (o.address?.phone||"").includes(q)
      || (o.address?.whatsapp||"").includes(q);
  });

  if(tab==="form")return(
    <ProductForm product={editProduct} showToast={showToast} settings={settings}
      onSave={async(saved,vidUrl)=>{await onSaveProd(saved,vidUrl);setTab("products");}}
      onDelete={async(id)=>{await onDeleteProd(id);setTab("products");}}
      onBack={()=>setTab("products")}/>
  );
  if(tab==="orderDetail"&&viewOrder)return(
    <AdminOrderDetail order={viewOrder} showToast={showToast} settings={settings}
      onBack={()=>setTab("orders")} onDeleteOrder={async(ord)=>{await onDeleteOrder(ord);setViewOrder(null);setTab("orders");showToast("Order deleted");}}
      onUpdateOrder={async(updated)=>{await onUpdateOrder(updated);setViewOrder(updated);}}/>
  );

  const filteredProds=products.filter(p=>(catFilter==="All"||p.category===catFilter)&&(!prodQ||p.name.toLowerCase().includes(prodQ.toLowerCase())));
  const newOrderCount=orders.filter(o=>o.status==="Placed").length;          // new paid orders awaiting action
  const outOfStockCount=products.filter(p=>(p.stockCount??DEFAULT_STOCK)<=0).length; // products that went out of stock
  const totalReviews=Object.values(allReviews).reduce((s,r)=>s+r.length,0);
  const stats=[{l:"Products",v:products.length,i:"📦"},{l:"Orders",v:orders.length,i:"🛒"},{l:"New",v:orders.filter(o=>o.status==="Placed").length,i:"🔔"},{l:"Reviews",v:totalReviews||"—",i:"⭐"}];

  return(
    <div className="slide-up">
      {/* Header */}
      <div style={{background:C.adminBg,padding:"52px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.65)",fontWeight:600,letterSpacing:1,marginBottom:4}}>ADMIN — {STORE_NAME.toUpperCase()}</div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800,color:"white"}}>{tab==="products"?"Products":tab==="reviews"?"Reviews":tab==="requests"?"Requests":"Orders"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="press" onClick={onBack}
              style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",borderRadius:10,padding:"8px 14px",color:"white",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              🛍 Store
            </button>
            {tab==="products"&&<button className="press" onClick={()=>{setEditProduct(null);setTab("form");}}
              style={{background:"white",border:"none",borderRadius:10,padding:"8px 14px",color:C.primary,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              + Add
            </button>}
          </div>
        </div>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:0}}>
          {stats.map(s=>(
            <div key={s.l} style={{background:"rgba(255,255,255,.12)",borderRadius:"12px 12px 0 0",padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:16,marginBottom:4}}>{s.i}</div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:18,fontWeight:800,color:"white"}}>{s.v}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
        {/* Tab bar */}
        <div style={{display:"flex",background:"rgba(0,0,0,.2)",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {["orders","products","wallets","reviews","requests","guides","settings"].map(t=>(
            <button key={t} className="press" onClick={()=>setTab(t)}
              style={{flex:"1 0 auto",minWidth:76,padding:"12px 6px",border:"none",background:tab===t?"white":"transparent",color:tab===t?C.primary:"rgba(255,255,255,.75)",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",transition:"all .2s",whiteSpace:"nowrap"}}>
              {t==="orders"?"📋 Orders":t==="products"?"📦 Products":t==="wallets"?"👛 Wallets":t==="reviews"?"⭐ Reviews":t==="requests"?"📨 Requests":t==="guides"?"📖 Guides":"⚙️ Settings"}
              {t==="orders"&&newOrderCount>0&&<span style={{marginLeft:3,background:tab===t?C.primary:C.coral,color:"white",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:800}}>{newOrderCount}</span>}
              {t==="products"&&outOfStockCount>0&&<span style={{marginLeft:3,background:tab===t?"#b45309":"#f59e0b",color:"white",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:800}} title="Out of stock">{outOfStockCount}</span>}
              {t==="requests"&&requests.length>0&&<span style={{marginLeft:3,background:tab===t?C.primary:C.coral,color:"white",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:800}}>{requests.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {!isAdminSignedIn()&&(
        <div style={{margin:"14px 16px 0",background:"#fff7ed",border:`1px solid #fed7aa`,borderRadius:14,padding:"14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:18}}>⚠️</span>
            <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:"#9a3412"}}>Sign in to load orders &amp; save changes</span>
          </div>
          <div style={{fontSize:12.5,color:"#9a3412",lineHeight:1.55,marginBottom:10}}>The admin password unlocks this screen, but for customer privacy <b>order details only load after you sign in with your Google admin account</b>. Products, posters &amp; settings also won't sync to customers until you sign in.</div>
          <button className="press" onClick={onAdminSignIn}
            style={{display:"inline-flex",alignItems:"center",gap:8,background:"white",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,color:C.text,fontFamily:"'Nunito',sans-serif"}}>
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 16 3 9.1 7.6 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.9 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.2 41.4 16 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 35.5 45 30.2 45 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
            Sign in with Google
          </button>
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {tab==="orders"&&(
        <div className="dt-read" style={{padding:"16px 16px 100px"}}>
          {/* Visitor analytics */}
          <div style={{background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`,borderRadius:14,padding:"14px 16px",marginBottom:14,color:"white"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>📈</span>
              <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800}}>Store Visitors</span>
            </div>
            {(()=>{
              const d=(visitStats&&visitStats.daily)||{}; const today=new Date().toISOString().slice(0,10);
              let last7=0; for(let i=0;i<7;i++){ last7+=d[new Date(Date.now()-i*86400000).toISOString().slice(0,10)]||0; }
              const cell=(n,l)=>(<div style={{flex:1,textAlign:"center"}}><div style={{fontFamily:PRICE_FONT,fontSize:22,fontWeight:800}}>{n}</div><div style={{fontSize:10.5,opacity:.85,fontWeight:600}}>{l}</div></div>);
              return <div style={{display:"flex",gap:8}}>{cell(d[today]||0,"Today")}{cell(last7,"Last 7 days")}{cell((visitStats&&visitStats.total)||0,"All time")}</div>;
            })()}
            <div style={{fontSize:10,opacity:.75,marginTop:8}}>One visit per browser session. {settings.gaId?"Google Analytics is also active.":"Add a Google Analytics ID in Settings for detailed reports."}</div>
          </div>
          {/* Payment destination — glance-check that money still routes to you */}
          <div style={{background:(settings.upiId||settings.razorpayLink)?"#ecfdf5":"#fff7ed",border:`1px solid ${(settings.upiId||settings.razorpayLink)?"#a7f3d0":"#fed7aa"}`,borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:(settings.upiId||settings.razorpayLink)?"#15803d":"#9a3412",letterSpacing:.4,marginBottom:5}}>💰 PAYMENTS GO TO</div>
            {(settings.upiId||settings.razorpayLink)?(
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {settings.upiId&&<div style={{fontSize:13,fontWeight:700,color:"#166534"}}>UPI: <span style={{fontFamily:"monospace"}}>{settings.upiId}</span>{settings.upiName?` · ${settings.upiName}`:""}</div>}
                {settings.razorpayLink&&<div style={{fontSize:11.5,color:"#166534",wordBreak:"break-all"}}>Gateway: {settings.razorpayLink}</div>}
                <div style={{fontSize:10.5,color:"#15803d",marginTop:3,lineHeight:1.5}}>Changing these now requires an emailed code. If this ever looks wrong, fix it in Settings → Online Payment immediately.</div>
              </div>
            ):(
              <div style={{fontSize:12.5,color:"#9a3412",fontWeight:600}}>⚠ No payment method set — add your UPI ID or gateway link in Settings so customers can pay.</div>
            )}
          </div>
          {/* Search orders by number / name / phone */}
          <div style={{position:"relative",marginBottom:12}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:14,opacity:.5}}>🔍</span>
            <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}
              placeholder="Search order # / name / phone…"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 36px 11px 36px",fontSize:13.5,outline:"none",background:"white",fontFamily:"'Nunito',sans-serif"}}/>
            {orderSearch&&<button className="press" onClick={()=>setOrderSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",fontSize:16,color:C.textSub,cursor:"pointer"}}>×</button>}
          </div>
          {/* Status filter */}
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:14}}>
            {["All",...ALL_STATUSES].map(s=>(
              <button key={s} className="press" onClick={()=>setOrderFilter(s)}
                style={{flexShrink:0,background:orderFilter===s?C.primary:C.card,color:orderFilter===s?"white":C.textSub,border:`1.5px solid ${orderFilter===s?C.primary:C.border}`,borderRadius:20,padding:"7px 14px",fontSize:12,fontWeight:600,fontFamily:"'Nunito',sans-serif"}}>
                {s}
                {s!=="All"&&<span style={{marginLeft:4,background:orderFilter===s?"rgba(255,255,255,.25)":C.border,borderRadius:10,padding:"1px 6px",fontSize:10}}>
                  {orders.filter(o=>o.status===s).length}
                </span>}
              </button>
            ))}
          </div>

          {/* Monthly report reminder */}
          {!exportDone&&orders.length>0&&(()=>{
            const pm=prevMonthRange();
            return(
              <div style={{background:"linear-gradient(135deg,#107c41,#0b5e31)",borderRadius:14,padding:"14px 16px",marginBottom:14,color:"white"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <span style={{fontSize:18}}>🗓️</span>
                  <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800}}>Monthly report reminder</span>
                </div>
                <div style={{fontSize:12,opacity:.93,lineHeight:1.55,marginBottom:10}}>It's a new month — download &amp; save your <b>{pm.label}</b> orders report (Excel) for your records and accounts.</div>
                <div style={{display:"flex",gap:8}}>
                  <button className="press" onClick={()=>{const n=exportOrdersCSV(orders,pm.from,pm.to,settings,walletBalances);stampExport();showToast(n?`Downloaded ${n} order${n!==1?"s":""} for ${pm.label}`:`No orders in ${pm.label} — marked done`);}}
                    style={{flex:1,background:"white",color:"#0b5e31",border:"none",borderRadius:10,padding:"10px",fontSize:12.5,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>⬇ Download {pm.label}</button>
                  <button className="press" onClick={stampExport}
                    style={{background:"rgba(255,255,255,.18)",color:"white",border:"1px solid rgba(255,255,255,.4)",borderRadius:10,padding:"10px 14px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Dismiss</button>
                </div>
              </div>
            );
          })()}

          {/* Excel export with date range */}
          <div style={{background:C.card,borderRadius:14,padding:"14px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>📊</span>
              <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:C.text}}>Export Orders to Excel</span>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10.5,color:C.textSub,fontWeight:700,marginBottom:4}}>FROM</div>
                <input type="date" value={csvFrom} onChange={e=>setCsvFrom(e.target.value)}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:12.5,outline:"none",background:"white",fontFamily:"'Nunito',sans-serif",color:C.text}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10.5,color:C.textSub,fontWeight:700,marginBottom:4}}>TO</div>
                <input type="date" value={csvTo} onChange={e=>setCsvTo(e.target.value)}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:12.5,outline:"none",background:"white",fontFamily:"'Nunito',sans-serif",color:C.text}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {[["Today",0],["7 days",7],["30 days",30],["This year",365]].map(([lbl,d])=>(
                <button key={lbl} className="press" onClick={()=>{
                  const to=new Date(); const from=new Date(); if(d>0)from.setDate(from.getDate()-d);
                  setCsvFrom(from.toISOString().slice(0,10)); setCsvTo(to.toISOString().slice(0,10));
                }} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,padding:"5px 12px",fontSize:11,fontWeight:700,color:C.primary,fontFamily:"'Nunito',sans-serif"}}>{lbl}</button>
              ))}
              {(csvFrom||csvTo)&&<button className="press" onClick={()=>{setCsvFrom("");setCsvTo("");}} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:16,padding:"5px 12px",fontSize:11,fontWeight:700,color:C.textSub,fontFamily:"'Nunito',sans-serif"}}>Clear</button>}
            </div>
            <button className="press" onClick={()=>{const n=exportOrdersCSV(orders,csvFrom,csvTo,settings,walletBalances);stampExport();showToast(n?`Exported ${n} order${n!==1?"s":""} to Excel`:"No orders in that range","error");}}
              style={{width:"100%",background:"#107c41",color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              ⬇ Download Excel (CSV){(csvFrom||csvTo)?" — selected range":" — all orders"}
            </button>
          </div>

          {/* Clean up old orders — frees Firebase space (also removes their payment screenshots) */}
          <div style={{background:C.card,borderRadius:14,padding:"14px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:16}}>🧹</span>
              <span style={{fontFamily:"'Baloo 2',sans-serif",fontSize:14,fontWeight:800,color:C.text}}>Clean Up Old Orders</span>
            </div>
            <div style={{fontSize:11.5,color:C.textSub,marginBottom:10,lineHeight:1.5}}>Permanently deletes <b>Delivered</b> &amp; <b>Cancelled</b> orders (and their payment screenshots) older than the chosen age — frees Firebase space. Active &amp; recent orders are kept. 💡 Download a backup first (Settings → Data &amp; Backup).</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={cleanMonths} onChange={e=>{setCleanMonths(Number(e.target.value));setCleanConfirm(false);}}
                style={{flexShrink:0,borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px",fontSize:12.5,background:"white",fontFamily:"'Nunito',sans-serif",color:C.text}}>
                <option value={3}>Older than 3 months</option>
                <option value={6}>Older than 6 months</option>
                <option value={12}>Older than 1 year</option>
              </select>
              <button className="press" onClick={()=>{
                const cutoff=Date.now()-cleanMonths*30*24*60*60*1000;
                const due=orders.filter(o=>(o.status==="Delivered"||o.status==="Cancelled")&&new Date(o.placedAt||0).getTime()<cutoff).length;
                if(!due){ showToast("No old orders to delete","error"); return; }
                setCleanConfirm(true);
              }}
                style={{flex:1,background:"#b91c1c",color:"white",border:"none",borderRadius:12,padding:"11px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                🗑 Delete Old Orders
              </button>
            </div>
            {cleanConfirm&&(()=>{
              const cutoff=Date.now()-cleanMonths*30*24*60*60*1000;
              const due=orders.filter(o=>(o.status==="Delivered"||o.status==="Cancelled")&&new Date(o.placedAt||0).getTime()<cutoff).length;
              return(
                <div style={{marginTop:10,background:"#fef2f2",border:`1.5px solid ${C.danger}`,borderRadius:12,padding:"12px"}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:C.danger,marginBottom:4,lineHeight:1.5}}>Permanently delete {due} delivered/cancelled order{due!==1?"s":""} older than {cleanMonths} months?</div>
                  <div style={{fontSize:11,color:"#7f1d1d",marginBottom:10,lineHeight:1.5}}>This also removes their payment screenshots and <b>cannot be undone</b>. Download a backup or CSV first if you want to keep the records.</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button className="press" onClick={()=>setCleanConfirm(false)}
                      style={{background:"white",color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
                    <button className="press" onClick={async()=>{
                      setCleanConfirm(false);
                      const n=await onCleanupOrders(cleanMonths);
                      showToast(n?`Deleted ${n} old order${n!==1?"s":""} ✓`:"Nothing deleted");
                    }}
                      style={{background:C.danger,color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Yes, delete</button>
                  </div>
                </div>
              );
            })()}
          </div>

          {filteredOrders.length===0?(
            <div style={{textAlign:"center",padding:"50px 0",color:C.textSub}}>
              <div style={{fontSize:48,marginBottom:14}}>📋</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No orders yet</div>
              <div style={{fontSize:12}}>Orders will appear here when customers place them</div>
            </div>
          ):(<>
          {filteredOrders.map(o=>(
            <div key={o.id} className="lift" onClick={()=>{setViewOrder(o);setTab("orderDetail");}}
              style={{background:C.card,borderRadius:16,padding:"14px",marginBottom:10,border:`1px solid ${C.border}`,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:2}}>{orderId(o.id)}</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text}}>{o.address.name}</div>
                  <div style={{fontSize:11,color:C.textSub}}>{o.address.city} · {fmtDate(o.placedAt)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <StatusBadge status={o.status}/>
                  <div style={{fontFamily:PRICE_FONT,fontSize:16,fontWeight:800,color:C.primary,marginTop:6}}>₹{o.total+o.fee}</div>
                </div>
              </div>
              <div style={{fontSize:12,color:C.textSub}}>{o.items.map(i=>`${i.name} x${i.qty}`).join(" · ")}</div>
              <div style={{marginTop:8,fontSize:11,color:C.accent,fontWeight:600}}>Tap to manage →</div>
            </div>
          ))}
          </>)}
        </div>
      )}

      {/* ── REVIEWS TAB ── */}
      {tab==="reviews"&&(
        <div style={{padding:"16px 16px 100px"}}>
          {loadingRev?(
            <div style={{display:"flex",justifyContent:"center",padding:"40px"}}><Spinner/></div>
          ):products.map(p=>{
            const revs=allReviews[p.id]||[];
            if(!revs.length)return null;
            const m=CAT_META[p.category]||CAT_META["Live Fish"];
            const avg=(revs.reduce((s,r)=>s+r.rating,0)/revs.length).toFixed(1);
            return(
              <div key={p.id} style={{background:C.card,borderRadius:16,padding:"14px",marginBottom:14,border:`1px solid ${C.border}`}}>
                {/* Product header */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                    {mediaCache["img-"+p.id]?<img src={mediaCache["img-"+p.id]} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:10}}/>:m.emoji}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{p.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                      <ReviewStars value={Math.round(Number(avg))} size={11}/>
                      <span style={{fontSize:11,color:C.textSub}}>{avg} · {revs.length} review{revs.length!==1?"s":""}</span>
                    </div>
                  </div>
                </div>
                {/* Individual reviews */}
                {revs.map((r,i)=>(
                  <div key={r.id||i} style={{paddingBottom:i<revs.length-1?12:0,marginBottom:i<revs.length-1?12:0,borderBottom:i<revs.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.text}}>{r.name}</span>
                          <ReviewStars value={r.rating} size={11}/>
                        </div>
                        <div style={{fontSize:10,color:C.textSub}}>{new Date(r.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                      </div>
                      <button className="press" onClick={()=>handleDeleteReview(p.id,r.id)}
                        style={{background:"#fee2e2",border:"none",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,color:C.danger,fontFamily:"'Nunito',sans-serif"}}>
                        Delete
                      </button>
                    </div>
                    <div style={{fontSize:12,color:C.textSub,lineHeight:1.55}}>{r.comment}</div>
                  </div>
                ))}
              </div>
            );
          })}
          {!loadingRev&&Object.values(allReviews).every(r=>r.length===0)&&(
            <div style={{textAlign:"center",padding:"50px 0",color:C.textSub}}>
              <div style={{fontSize:48,marginBottom:12}}>⭐</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No reviews yet</div>
              <div style={{fontSize:12}}>Customer reviews will appear here</div>
            </div>
          )}
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab==="products"&&(
        <div style={{padding:"16px 16px 100px"}}>
          <div style={{display:"flex",alignItems:"center",background:C.card,borderRadius:12,padding:"10px 14px",gap:8,marginBottom:12,border:`1.5px solid ${C.border}`}}>
            <span>🔍</span>
            <input type="text" placeholder="Search products…" value={prodQ} onChange={e=>setProdQ(e.target.value)}
              style={{border:"none",background:"transparent",outline:"none",flex:1,fontSize:13}}/>
            {prodQ&&<button className="press" onClick={()=>setProdQ("")} style={{background:"none",border:"none",fontSize:14,color:C.textSub}}>✕</button>}
          </div>
          <div style={{marginBottom:14}}><CategoryPills selected={catFilter} onSelect={setCatFilter} all/></div>
          <div style={{fontSize:12,color:C.textSub,fontWeight:500,marginBottom:12}}>{filteredProds.length} product{filteredProds.length!==1?"s":""}</div>
          {filteredProds.map(p=>{
            const imgSrc=getProductMedia(p,mediaCache).images[0];
            const m=CAT_META[p.category]||CAT_META["Live Fish"];
            return(
              <div key={p.id} style={{background:C.card,borderRadius:16,padding:"12px",marginBottom:10,display:"flex",gap:12,alignItems:"center",border:`1px solid ${C.border}`}}>
                <div style={{width:60,height:60,borderRadius:12,overflow:"hidden",flexShrink:0,background:`linear-gradient(135deg,${m.c1},${m.c2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
                  {imgSrc?<img src={imgSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:m.emoji}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                  <div style={{fontSize:11,color:C.textSub,marginBottom:4}}>{p.category}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontFamily:PRICE_FONT,fontSize:15,fontWeight:800,color:C.primary}}>₹{effectivePrice(p)}</span>
                    {p.comingSoon
                      ? <span style={{fontSize:10,fontWeight:800,color:C.accent,background:C.accentLight,padding:"2px 7px",borderRadius:12}}>🔜 Coming Soon · {interestCounts[p.id]||0} interested</span>
                      : <StockBadge stockCount={p.stockCount ?? DEFAULT_STOCK}/>}
                    {(p.discountPct||0)>0&&!p.comingSoon&&<span style={{fontSize:10,fontWeight:800,color:C.coral,background:"#fff7ed",padding:"2px 7px",borderRadius:12}}>-{p.discountPct}%</span>}
                    {p.hasImg&&<span style={{fontSize:10,color:C.accent}}>📷</span>}
                    {p.hasVid&&<span style={{fontSize:10,color:C.accent}}>🎬</span>}
                  </div>
                </div>
                <button className="press" onClick={()=>{const gm=getProductMedia(p,mediaCache);setEditProduct({...p,_mediaImgs:gm.images,_mediaVid:gm.video});setTab("form");}}
                  style={{background:C.accentLight,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,color:C.primary,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── REQUESTS TAB ── */}
      {tab==="requests"&&(
        <div style={{padding:"16px 16px 100px"}}>
          {requests.length===0?(
            <div style={{textAlign:"center",padding:"50px 0",color:C.textSub}}>
              <div style={{fontSize:48,marginBottom:14}}>📨</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No requests yet</div>
              <div style={{fontSize:12}}>Customer product requests will appear here</div>
            </div>
          ):(
            <>
            <div style={{fontSize:12,color:C.textSub,fontWeight:600,marginBottom:12}}>{requests.length} customer request{requests.length!==1?"s":""}</div>
            {requests.map(r=>{
              const img=mediaCache["img-"+r.id];
              const waNum="91"+normalizePhone(r.phone);
              return(
                <div key={r.id} style={{background:C.card,borderRadius:16,padding:"14px",marginBottom:12,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",gap:12}}>
                    <div style={{width:60,height:60,borderRadius:12,flexShrink:0,overflow:"hidden",background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>
                      {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🐟"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.text}}>{r.product}</div>
                      <div style={{fontSize:11.5,color:C.textSub,marginTop:2}}>
                        {r.brand?<>Brand: <b style={{color:C.text}}>{r.brand}</b> · </>:null}Qty: {r.qty}
                      </div>
                      <div style={{fontSize:11,color:C.textSub,marginTop:2}}>{fmtDate(r.createdAt)}</div>
                    </div>
                  </div>
                  {r.notes&&<div style={{fontSize:12,color:C.textSub,lineHeight:1.55,marginTop:10,background:C.bg,borderRadius:10,padding:"8px 12px"}}>{r.notes}</div>}
                  {r.link&&<a href={r.link} target="_blank" rel="noopener" style={{display:"inline-block",fontSize:12,color:C.accent,fontWeight:700,marginTop:8,wordBreak:"break-all"}}>🔗 Reference link</a>}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:12,color:C.text,fontWeight:600}}>{r.name} · {r.phone}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="press" onClick={()=>openWA(waNum,encodeURIComponent(`Hi ${r.name}! Regarding your request for "${r.product}" at ${STORE_NAME}…`))}
                        style={{background:"#25D366",color:"white",border:"none",borderRadius:10,padding:"7px 12px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>💬 Reply</button>
                      <button className="press" onClick={()=>onDeleteRequest(r.id)}
                        style={{background:"#fee2e2",color:C.danger,border:"none",borderRadius:10,padding:"7px 12px",fontSize:11.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      )}

      {/* ── GUIDES TAB ── */}
      {tab==="guides"&&(
        <div style={{padding:"16px 16px 100px"}}>
          {guideFormOpen?(
            <GuideForm guide={editGuide} imgSrc={editGuide?mediaCache["img-"+editGuide.id]:null}
              onSave={async(g,b64)=>{await onSaveGuide(g,b64);setGuideFormOpen(false);setEditGuide(null);}}
              onCancel={()=>{setGuideFormOpen(false);setEditGuide(null);}}/>
          ):(
            <>
            <button className="press" onClick={()=>{setEditGuide(null);setGuideFormOpen(true);}}
              style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:14,padding:"14px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginBottom:16}}>
              + Add Care Guide / Poster
            </button>
            {guides.length===0?(
              <div style={{textAlign:"center",padding:"40px 0",color:C.textSub}}>
                <div style={{fontSize:48,marginBottom:14}}>📖</div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>No guides yet</div>
                <div style={{fontSize:12}}>Add posters and instructions for your customers</div>
              </div>
            ):guides.map(g=>{
              const img=mediaCache["img-"+g.id];
              return(
                <div key={g.id} style={{background:C.card,borderRadius:16,padding:"12px",marginBottom:12,border:`1px solid ${C.border}`,display:"flex",gap:12}}>
                  <div style={{width:56,height:56,borderRadius:12,flexShrink:0,overflow:"hidden",background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                    {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"📖"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:800,color:C.accent,marginBottom:2}}>{g.category}</div>
                    <div style={{fontSize:13.5,fontWeight:700,color:C.text,lineHeight:1.3,marginBottom:4}}>{g.title}</div>
                    <div style={{fontSize:11.5,color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{g.content}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                    <button className="press" onClick={()=>{setEditGuide(g);setGuideFormOpen(true);}}
                      style={{background:C.accentLight,color:C.primary,border:"none",borderRadius:9,padding:"6px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Edit</button>
                    <button className="press" onClick={()=>onDeleteGuide(g.id)}
                      style={{background:"#fee2e2",color:C.danger,border:"none",borderRadius:9,padding:"6px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Del</button>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      )}

      {/* ── WALLETS TAB ── */}
      {tab==="wallets"&&(
        <div style={{padding:"16px 16px 100px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:18,fontWeight:800,color:C.text}}>👛 Customer Wallets</div>
              <div style={{fontSize:11.5,color:C.textSub}}>{customers.length} customer{customers.length!==1?"s":""} · ₹{Number(settings.loyaltyRedeemValue||1)}/coin</div>
            </div>
            <button className="press" onClick={loadWallets} disabled={loadingWallets}
              style={{background:C.accentLight,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:700,color:C.primary,fontFamily:"'Nunito',sans-serif"}}>
              {loadingWallets?"…":"↻ Refresh"}
            </button>
          </div>
          {(()=>{
            const totalCoins=Object.values(walletBalances).reduce((s,v)=>s+(Number(v)||0),0);
            const val=Number(settings.loyaltyRedeemValue||1);
            return(
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                <div style={{flex:1,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",borderRadius:14,padding:"13px 15px",color:"white"}}>
                  <div style={{fontSize:11,opacity:.85,fontWeight:600}}>Total coins outstanding</div>
                  <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800}}>{totalCoins}</div>
                  <div style={{fontSize:10.5,opacity:.85}}>≈ ₹{Math.floor(totalCoins*val)} liability</div>
                </div>
              </div>
            );
          })()}
          {loadingWallets&&customers.length>0&&Object.keys(walletBalances).length===0?(
            <div style={{textAlign:"center",padding:"30px",color:C.textSub,fontSize:13}}>Loading wallet balances…</div>
          ):customers.length===0?(
            <div style={{textAlign:"center",padding:"30px",color:C.textSub,fontSize:13}}>No customers yet.</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...customers].sort((a,b)=>(walletBalances[b.uid]||0)-(walletBalances[a.uid]||0)).map(c=>{
                const bal=walletBalances[c.uid];
                const val=Number(settings.loyaltyRedeemValue||1);
                return(
                  <div key={c.uid} style={{display:"flex",alignItems:"center",gap:12,background:C.card,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:C.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>👤</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                      <div style={{fontSize:11,color:C.textSub}}>{c.phone||c.email||c.uid.slice(0,12)} · {c.orders} order{c.orders!==1?"s":""}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:16,fontWeight:800,color:C.primary}}>{bal==null?"—":bal} <span style={{fontSize:11,fontWeight:600,color:C.textSub}}>pts</span></div>
                      {bal!=null&&<div style={{fontSize:10.5,color:C.textSub}}>≈ ₹{Math.floor(bal*val)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab==="settings"&&(
        <div>
          {/* Showcase management */}
          {showcase.length>0&&(()=>{
            const now=Date.now();
            const pending=showcase.filter(s=>!showcaseApproved(s)&&!showcaseExpired(s,now));
            const live=showcase.filter(s=>showcaseApproved(s)&&!showcaseExpired(s,now));
            const row=(s,isPending)=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,background:C.bg,borderRadius:12,padding:"8px 10px",border:`1px solid ${isPending?"#fed7aa":C.border}`}}>
                <img src={s.imgData} alt={s.ownerName} style={{width:48,height:48,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.ownerName}</div>
                  {s.caption&&<div style={{fontSize:11,color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.caption}</div>}
                  <div style={{fontSize:10,color:C.textSub}}>{fmtDate(s.createdAt)}{!isPending&&s.expiresAt?` · expires ${fmtDate(new Date(s.expiresAt).toISOString())}`:""}</div>
                </div>
                {isPending&&(
                  <button className="press" onClick={()=>onApproveShowcase&&onApproveShowcase(s)}
                    style={{background:C.success,color:"white",border:"none",borderRadius:8,padding:"5px 11px",fontSize:11,fontWeight:800,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                    Approve
                  </button>
                )}
                <button className="press" onClick={()=>onDeleteShowcase&&onDeleteShowcase(s.id)}
                  style={{background:"#fee2e2",color:C.danger,border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                  {isPending?"Reject":"Remove"}
                </button>
              </div>
            );
            return(
            <div style={{padding:"16px 16px 0"}}>
              <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:0,border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>🪸 Customer Tank Showcase</div>
                {pending.length>0&&(
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11.5,fontWeight:800,color:"#9a3412",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>⏳ Pending approval ({pending.length})</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>{pending.map(s=>row(s,true))}</div>
                  </div>
                )}
                <div style={{fontSize:11.5,fontWeight:800,color:C.textSub,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>✓ Live ({live.length})</div>
                {live.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>{live.map(s=>row(s,false))}</div>
                ):(
                  <div style={{fontSize:11.5,color:C.textSub,fontStyle:"italic"}}>No live tanks right now.</div>
                )}
              </div>
            </div>
            );
          })()}
          {/* Testimonials management */}
          {testimonials.length>0&&(
            <div style={{padding:"16px 16px 0"}}>
              <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>💬 Testimonials ({testimonials.length})</div>
                <div style={{fontSize:11.5,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Posted by signed-in customers and shown on the home page. Remove any you don't want public.</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {testimonials.map(t=>(
                    <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:10,background:C.bg,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontSize:12.5,fontWeight:800,color:C.text}}>{t.name||"Customer"}</span>
                          <span style={{fontSize:11,color:"#f59e0b"}}>{"★".repeat(t.rating||5)}</span>
                        </div>
                        <div style={{fontSize:12,color:C.textSub,lineHeight:1.4}}>{t.text}</div>
                      </div>
                      <button className="press" onClick={()=>onDeleteTestimonial&&onDeleteTestimonial(t.id)}
                        style={{background:"#fee2e2",color:C.danger,border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",flexShrink:0}}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <SettingsPanel settings={settings} onSave={onSaveSettings}/>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ ADMIN SETTINGS PANEL ═══════════════════ */
function SettingsPanel({settings,onSave}){
  const [f,setF]=useState({...DEFAULT_SETTINGS,...settings});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const [logoNote,setLogoNote]=useState("");
  const [npw,setNpw]=useState("");
  const [npw2,setNpw2]=useState("");
  const [pwMsg,setPwMsg]=useState("");
  const [backupMsg,setBackupMsg]=useState("");
  const [sec,setSec]=useState("store"); // settings are split into pages; this is the active one
  const adminOk=isAdminSignedIn();
  // Live daily-promo usage (today) — refreshed on mount so admin sees "X of N used today"
  const [promoToday,setPromoToday]=useState({coupon:0,referral:0});
  useEffect(()=>{ let on=true; Promise.all([promoUsageCount("coupon"),promoUsageCount("referral")]).then(([c,r])=>{ if(on) setPromoToday({coupon:c,referral:r}); }); return ()=>{on=false;}; },[]);
  const usageBadge=(type,limit)=>{
    const used=promoToday[type]||0; const lim=Number(limit||0);
    const full=lim>0&&used>=lim;
    return (
      <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10.5,fontWeight:800,color:full?C.danger:lim>0?"#9a6a00":C.textSub,background:full?"#fee2e2":lim>0?"#fffbeb":C.bg,border:`1px solid ${full?"#fecaca":lim>0?"#fde68a":C.border}`,borderRadius:20,padding:"3px 9px",marginLeft:8}}>
        {full?"●":"○"} {used}{lim>0?` of ${lim}`:""} used today{full?" — full":""}
      </span>
    );
  };

  /* ── OTP-gated sensitive changes (WhatsApp number + admin password) ──
     Only the signed-in Google admin can change these, and only after entering a
     code emailed to the configured admin email. The Google-admin-UID Firebase rule
     is the real lock; this OTP is a second factor on the edit itself. */
  const [otpOpen,setOtpOpen]=useState(false);
  const [otpCode,setOtpCode]=useState("");      // the code we generated + emailed
  const [otpExp,setOtpExp]=useState(0);
  const [otpEmail,setOtpEmail]=useState("");
  const [otpInput,setOtpInput]=useState("");
  const [otpMsg,setOtpMsg]=useState("");
  const [otpBusy,setOtpBusy]=useState(false);
  const [otpTries,setOtpTries]=useState(0);
  const [pendingSave,setPendingSave]=useState(null);
  const [otpSendFailed,setOtpSendFailed]=useState(false); // true when the code email couldn't be sent — unlocks the verified-admin override
  const [overrideText,setOverrideText]=useState("");
  const genCode=()=>String(Math.floor(100000+Math.random()*900000));
  const sensitiveChanged=(nf)=>(
    String(nf.ownerWhatsapp||"")!==String(settings.ownerWhatsapp||"") ||
    String(nf.orderEmail||"")!==String(settings.orderEmail||"") ||
    String(nf.adminPassHash||"")!==String(settings.adminPassHash||"") ||
    String(nf.upiId||"")!==String(settings.upiId||"") ||
    String(nf.razorpayLink||"")!==String(settings.razorpayLink||"")
  );
  const adminEmail=()=>((settings.orderEmail||"").trim() || BUSINESS_EMAIL || (FB_OK&&FB_AUTH?.currentUser?.email)||"");
  const startSave=async(nf)=>{
    // No sensitive change → save normally.
    if(!sensitiveChanged(nf)){ onSave(nf); return; }
    // Sensitive change requires the Google admin account…
    if(!isAdminSignedIn()){
      setPwMsg("🔒 Sign in with your Google admin account (banner at the top of Admin) before changing your WhatsApp number, email, password or payment details.");
      return;
    }
    // …and an email to send the code to.
    const email=adminEmail();
    if(!email){
      setPwMsg("✉ Add an 'Order Notification Email' (Store Contact section) first — that's where your security code is sent.");
      return;
    }
    const code=genCode();
    setOtpCode(code); setOtpExp(Date.now()+5*60*1000); setOtpEmail(email);
    setOtpInput(""); setOtpMsg(""); setOtpTries(0); setPendingSave(nf);
    setOtpSendFailed(false); setOverrideText("");
    setOtpOpen(true); setOtpBusy(true);
    const res=await sendOtpEmail(email, code, settings);
    setOtpBusy(false); setOtpSendFailed(!res.ok);
    setOtpMsg(res.ok ? ("✓ Code sent to "+maskEmail(email)) : ("⚠ Couldn't send — "+res.error+". In your EmailJS template, set the “To Email” field to {{to_email}}, and allow your site's domain under Account → Security."));
  };
  const resendOtp=async()=>{
    const code=genCode(); setOtpCode(code); setOtpExp(Date.now()+5*60*1000);
    setOtpTries(0); setOtpInput(""); setOtpBusy(true); setOtpMsg("");
    const res=await sendOtpEmail(otpEmail, code, settings); setOtpBusy(false); setOtpSendFailed(!res.ok);
    setOtpMsg(res.ok ? ("✓ New code sent to "+maskEmail(otpEmail)) : ("⚠ "+res.error));
  };
  const verifyOtp=()=>{
    if(Date.now()>otpExp){ setOtpMsg("⌛ Code expired — tap Resend for a new one."); return; }
    if(otpTries>=5){ setOtpMsg("Too many attempts. Tap Resend for a new code."); return; }
    if(otpInput.trim()===otpCode && otpCode){
      const nf=pendingSave; setOtpOpen(false); setOtpCode(""); setPendingSave(null);
      onSave(nf);
    }else{
      setOtpTries(t=>t+1); setOtpMsg("✕ Incorrect code ("+(otpTries+1)+"/5).");
    }
  };

  const changePassword=()=>{
    if(npw.length<4){ setPwMsg("⚠ Use at least 4 characters"); return; }
    if(npw!==npw2){ setPwMsg("⚠ Passwords don't match"); return; }
    set("adminPassHash", hashPass(npw));
    setNpw(""); setNpw2("");
    setPwMsg("✓ New password set — tap Save Settings, then enter the emailed code to apply.");
  };
  const handleLogo=async(file)=>{
    if(!file)return;
    setLogoNote("Cropping to circle…");
    // Read file directly (preserves transparency for PNG/WebP) instead of
    // going through compressImage() which converts everything to JPEG and
    // destroys the alpha channel, causing a black background in the circle.
    const raw=await fileToBase64(file);
    const circ=await cropToCircle(raw, 512);
    set("storeLogo", circ);
    setLogoNote("✓ Circular logo ready — tap Save Settings");
  };
  const field=(label,k,ph,note,type="text")=>(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{label}</div>
      <input type={type} value={f[k]||""} onChange={e=>set(k,e.target.value)} placeholder={ph}
        style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
      {note&&<div style={{fontSize:11,color:C.textSub,marginTop:4,lineHeight:1.45}}>{note}</div>}
    </div>
  );
  const area=(label,k)=>(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{label}</div>
      <textarea value={f[k]||""} onChange={e=>set(k,e.target.value)} rows={4}
        style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:13,outline:"none",resize:"vertical",lineHeight:1.6,background:"white"}}/>
    </div>
  );
  return(
    <div className="dt-read" style={{padding:"18px 16px 100px"}}>
      {/* Settings are split into pages for ease — pick a section */}
      <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:16,paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
        {[["store","🏪 Store"],["payship","🚚 Payments & Shipping"],["promos","🎁 Promotions"],["content","📄 Content"],["emails","🔐 Email & Security"]].map(([k,label])=>(
          <button key={k} className="press" onClick={()=>setSec(k)}
            style={{flexShrink:0,padding:"9px 14px",borderRadius:20,border:`1.5px solid ${sec===k?C.primary:C.border}`,background:sec===k?C.primary:"white",color:sec===k?"white":C.textSub,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",whiteSpace:"nowrap",cursor:"pointer"}}>
            {label}
          </button>
        ))}
      </div>
      {sec==="store"&&(<>
      {/* WhatsApp */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:14}}>💬 WhatsApp Notifications</div>
        {field("Your WhatsApp Number","ownerWhatsapp","919876543210","With country code, no + or spaces. New orders open here. Changing this needs a code emailed to your admin email.")}
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none"}}>
          <input type="checkbox" checked={!!f.supporterEnabled} onChange={e=>set("supporterEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,color:C.text,fontWeight:600}}>Also notify a support team member</span>
        </label>
        {f.supporterEnabled&&field("Supporter's WhatsApp Number","supporterWhatsapp","919123456780","Shown a 'notify support' button on each new order.")}
      </div>

      {/* Store contact (shown on home page) */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>🖼️ Store Logo</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Upload your logo (PNG with transparent background works best). It updates everywhere for all customers.</div>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:10}}>
          <div style={{width:72,height:72,borderRadius:14,background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
            <img src={f.storeLogo||STORE_LOGO} alt="" onError={e=>{if(!e.target.dataset.fb){e.target.dataset.fb='1';e.target.src=NEMO_FALLBACK;}}} style={{width:"100%",height:"100%",objectFit:"contain"}}/>
          </div>
          <div style={{flex:1}}>
            <label className="press" style={{display:"inline-block",background:C.accentLight,color:C.primary,border:`1.5px solid ${C.primary}`,borderRadius:10,padding:"9px 14px",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>
              Choose Logo
              <input type="file" accept="image/*" onChange={e=>handleLogo(e.target.files&&e.target.files[0])} style={{display:"none"}}/>
            </label>
            {f.storeLogo&&<button className="press" onClick={()=>{set("storeLogo","");setLogoNote("Reset to default — tap Save");}} style={{marginLeft:8,background:"#fee2e2",color:C.danger,border:"none",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Reset</button>}
            {logoNote&&<div style={{fontSize:11,color:C.textSub,marginTop:6}}>{logoNote}</div>}
          </div>
        </div>
      </div>

      {/* Store contact (shown on home page) */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>📍 Store Contact</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Shown at the bottom of the home page for customers.</div>
        {field("Store Address","storeAddress","e.g. 12 Lake View Rd, Chennai 600001")}
        {field("Opening Hours (optional)","storeHours","e.g. Mon–Sat, 10am–8pm")}
        {field("Instagram Link (optional)","instagramUrl","https://instagram.com/yourstore","Shown in the home-page footer under Follow Us.")}
        {field("Facebook Link (optional)","facebookUrl","https://facebook.com/yourstore")}
        {field("Order Notification Email (optional)","orderEmail","you@example.com","Where new-order alerts and your admin security codes are sent. Delivered via EmailJS (set the keys below). Changing this needs an email security code.","email")}
      </div>

      </>)}
      {sec==="emails"&&(<>
      {/* Customer confirmation emails (EmailJS) */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>📧 Customer Confirmation Emails</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Auto-emails customers an order confirmation. Create a free account at emailjs.com → add an Email Service + Template, then paste the 3 IDs here. Template should use variables: to_email, to_name, order_no, order_items, order_total, payment_method, store_name.</div>
        {field("EmailJS Service ID","emailjsService","service_xxxxxxx")}
        {field("EmailJS Template ID","emailjsTemplate","template_xxxxxxx")}
        {field("EmailJS Public Key","emailjsKey","xxxxxxxxxxxxxxxx")}
        {/* Per-event switches — save your free email quota; use WhatsApp for the rest */}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>Which emails to send automatically</div>
          <div style={{fontSize:11,color:C.textSub,marginBottom:10,lineHeight:1.5}}>Free EmailJS = 200 emails/month. Turn off the ones you'd rather send by WhatsApp.</div>
          {[
            ["emailPlaced","🧾 Order received + bill","Sent when a customer places an order"],
            ["emailConfirmed","✅ Payment confirmed","When you verify their payment"],
            ["emailShipped","🚚 Shipped + tracking","When you mark the order Shipped"],
            ["emailDelivered","🎉 Delivered","When you mark the order Delivered"],
          ].map(([key,label,desc])=>(
            <label key={key} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:9,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={f[key]!==false} onChange={e=>set(key,e.target.checked)} style={{width:18,height:18,accentColor:C.primary,flexShrink:0,marginTop:1}}/>
              <span><span style={{fontSize:13,color:C.text,fontWeight:700}}>{label}</span><br/><span style={{fontSize:11,color:C.textSub}}>{desc}</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* Visitor analytics */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>📈 Visitor Analytics</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Basic visit counts already appear on your Orders dashboard — no setup needed. For detailed reports (traffic sources, devices, locations), create a free Google Analytics 4 property and paste its Measurement ID here.</div>
        {field("Google Analytics ID (optional)","gaId","G-XXXXXXXXXX","From analytics.google.com → Admin → Data Streams → your web stream.")}
      </div>

      {/* Admin security */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>🔐 Admin Security</div>

        {/* Change password — only the signed-in Google admin can save it */}
        <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginTop:6,marginBottom:8}}>Change Admin Password</div>
        {adminOk ? (
          <div style={{marginBottom:14}}>
            <input type="password" value={npw} onChange={e=>{setNpw(e.target.value);setPwMsg("");}} placeholder="New password"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white",marginBottom:8}}/>
            <input type="password" value={npw2} onChange={e=>{setNpw2(e.target.value);setPwMsg("");}} placeholder="Confirm new password"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white",marginBottom:8}}/>
            <button className="press" onClick={changePassword} disabled={!npw}
              style={{background:npw?C.primary:"#9ca3af",color:"white",border:"none",borderRadius:10,padding:"10px 16px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Set New Password</button>
            {pwMsg&&<div style={{fontSize:11.5,color:pwMsg[0]==="✓"?C.success:C.danger,fontWeight:600,marginTop:8}}>{pwMsg}</div>}
          </div>
        ) : (
          <div style={{background:"#fff7ed",border:`1px solid #fed7aa`,borderRadius:10,padding:"11px 13px",marginBottom:14,fontSize:12,color:"#9a3412",lineHeight:1.5}}>
            🔒 Sign in with your Google admin account (banner at the top of Admin) to change the password. This keeps it changeable <b>only by you</b>.
          </div>
        )}

        <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:6}}>Your Google Admin UID</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:10,lineHeight:1.5}}>Paste this into your Firebase rules to lock admin to your account.</div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.bg,borderRadius:10,padding:"10px 12px"}}>
          <code style={{flex:1,fontSize:12,color:C.text,wordBreak:"break-all"}}>{adminOk?FB_AUTH.currentUser.uid:"— sign in with Google to view —"}</code>
          {adminOk&&(
            <button className="press" onClick={()=>{navigator.clipboard?.writeText(FB_AUTH.currentUser.uid);}} style={{background:C.accentLight,border:"none",color:C.primary,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Copy</button>
          )}
        </div>

        {/* ── Change Admin Google Account ── */}
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
          <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:10}}>🔄 Change Admin Google Account</div>
          <div style={{background:"#f0f9ff",border:`1px solid #bae6fd`,borderRadius:10,padding:"11px 13px",marginBottom:10,fontSize:12,color:"#0c4a6e",lineHeight:1.6}}>
            <b>Currently configured admin UID(s):</b><br/>
            {ADMIN_UIDS.map(u=>(<code key={u} style={{fontSize:11,wordBreak:"break-all",background:"rgba(0,0,0,.06)",borderRadius:4,padding:"2px 6px",display:"inline-block",marginTop:4,marginRight:4}}>{u}</code>))}
          </div>
          {/* Optional co-admin — a helper account that can also open the admin panel. */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>🤝 Co-admin Google UID (optional)</div>
            <input value={f.coAdminUid||""} onChange={e=>set("coAdminUid",e.target.value.trim())}
              placeholder="Paste your helper's Google UID"
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"10px 12px",fontSize:12.5,fontFamily:"monospace",outline:"none",background:"white"}}/>
            <div style={{fontSize:10.5,color:C.textSub,marginTop:5,lineHeight:1.55}}>Lets a second person open Admin. You must <b>also</b> add this UID to <code style={{fontSize:10,background:"rgba(0,0,0,.07)",borderRadius:3,padding:"1px 4px"}}>database.rules.json</code> + the Firebase console so their changes sync to the cloud. Save Settings after pasting.</div>
          </div>
          {FB_OK && FB_AUTH?.currentUser && !isAdminUid(FB_AUTH.currentUser.uid) && (
            <div style={{background:"#f0fdf4",border:`1px solid #86efac`,borderRadius:10,padding:"11px 13px",marginBottom:10,fontSize:12,color:"#14532d",lineHeight:1.6}}>
              <b>✓ New account UID (signed in now):</b><br/>
              <code style={{fontSize:11,wordBreak:"break-all",background:"rgba(0,0,0,.06)",borderRadius:4,padding:"2px 6px",display:"inline-block",marginTop:4}}>{FB_AUTH.currentUser.uid}</code>
              <button className="press" onClick={()=>navigator.clipboard?.writeText(FB_AUTH.currentUser.uid)}
                style={{display:"block",marginTop:8,background:"#16a34a",color:"white",border:"none",borderRadius:8,padding:"7px 14px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
                📋 Copy New UID
              </button>
            </div>
          )}
          <div style={{background:C.bg,borderRadius:10,padding:"12px 13px",fontSize:11.5,color:C.textSub,lineHeight:1.85}}>
            <b style={{color:C.text,display:"block",marginBottom:4}}>Steps to switch to a new Gmail account:</b>
            1. Sign in above (Admin panel banner) with your new Gmail<br/>
            2. Copy the "New account UID" shown in the green box above<br/>
            3. In <code style={{fontSize:10.5,background:"rgba(0,0,0,.07)",borderRadius:3,padding:"1px 5px"}}>app.jsx</code> line 14, replace the UID inside <code style={{fontSize:10.5,background:"rgba(0,0,0,.07)",borderRadius:3,padding:"1px 5px"}}>ADMIN_UID="..."</code><br/>
            4. In <code style={{fontSize:10.5,background:"rgba(0,0,0,.07)",borderRadius:3,padding:"1px 5px"}}>database_rules.json</code>, replace all occurrences of the old UID with the new one<br/>
            5. Push to GitHub → Vercel will redeploy automatically<br/>
            6. In Firebase Console → Realtime Database → Rules, paste the updated <code style={{fontSize:10.5,background:"rgba(0,0,0,.07)",borderRadius:3,padding:"1px 5px"}}>database_rules.json</code> and click Publish
          </div>
        </div>
      </div>

      {/* Data & Backup */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>💾 Data &amp; Backup</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Download a complete copy of your store — products, orders, settings, reviews and photos — as one file. Keep it safe (email it to yourself or save to Google Drive). To restore, use Firebase Console → Realtime Database → ⋮ → Import JSON.</div>
        {adminOk ? (
          <button className="press" onClick={async()=>{ setBackupMsg("Preparing backup…"); try{ const keys=await downloadFullBackup(); setBackupMsg("✓ Backup downloaded ("+keys.length+" sections)"); }catch(e){ setBackupMsg("⚠ Backup failed — try again"); } }}
            style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
            ⬇ Download Full Backup (JSON)
          </button>
        ) : (
          <div style={{background:"#fff7ed",border:`1px solid #fed7aa`,borderRadius:10,padding:"11px 13px",fontSize:12,color:"#9a3412",lineHeight:1.5}}>🔒 Sign in with your Google admin account to download the full backup (it includes orders, which only you can read).</div>
        )}
        {backupMsg&&<div style={{fontSize:11.5,color:backupMsg[0]==="✓"?C.success:backupMsg[0]==="⚠"?C.danger:C.textSub,fontWeight:600,marginTop:8}}>{backupMsg}</div>}
      </div>

      </>)}
      {sec==="content"&&(<>
      {/* About & Policies content */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>📄 About &amp; Policies</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Shown on the About page. Edit these to your real policies.</div>
        {area("Our Story","aboutStory")}
        {area("Delivery Areas","deliveryAreas")}
        {area("Live Arrival Guarantee","liveArrivalGuarantee")}
        {area("Returns & DOA Policy","returnPolicy")}
        {area("Acclimatization Guide","acclimatizationTips")}
        {area("Terms & Conditions","termsPolicy")}
        {area("Privacy Policy","privacyPolicy")}
      </div>

      {/* Business / legal identity */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>🏛️ Business &amp; Legal Info</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Shown on the About page and your invoices for legitimacy. <b>Never enter PAN or other private data here</b> — only business-level details customers may see.</div>
        {field("Registered Business Name","legalName","NEMO AQUA STORE")}
        {field("Entity Type","legalEntity","Proprietorship · Udyam-registered Micro Enterprise")}
        {field("Main Activity","legalActivity","Trading — aquarium fish, plants & accessories")}
        {field("City / State (public)","legalCity","Salem, Tamil Nadu, India")}
        {field("Full Address (invoice only, optional)","legalAddress","Leave blank to show only city","Appears on invoices for legal completeness. Optional.")}
        {field("GSTIN (add once registered)","gstin","22AAAAA0000A1Z5","When set, invoices become a proper GST 'Tax Invoice' with HSN, place of supply and CGST/SGST (or IGST) breakup. Leave blank until you have it.")}
        {field("Default GST Rate %","gstRate","18","Applied on tax invoices once GSTIN is set (prices are treated as GST-inclusive). A product can override this per item.")}
        {field("Default HSN / SAC Code","hsnCode","0301","Printed per line on the tax invoice. e.g. ornamental fish 0301, aquatic plants 0602, accessories per item.")}
        {field("Legal Jurisdiction","jurisdiction","Salem, Tamil Nadu")}
      </div>

      </>)}
      {sec==="payship"&&(<>
      {/* Payment */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>💳 Online Payment</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:14,lineHeight:1.5}}>Two ways to collect payment — use either or both:<br/><b>1. UPI ID</b> — direct to your phone (good while starting out; this is temporary).<br/><b>2. Payment Gateway link</b> — once your current account &amp; gateway (Razorpay etc.) are ready, paste the link below and it takes over. To stop UPI later, clear the UPI ID field and Save.</div>
        {field("UPI ID","upiId","yourname@oksbi","Direct UPI collection. Clear this field + Save to remove it once your gateway is live.")}
        {field("UPI Display Name","upiName","Nemo Aqua Store")}
        {field("Payment Gateway / Razorpay Link","razorpayLink","https://rzp.io/i/xxxx","Paste your Razorpay Payment Link / Page (or any gateway checkout URL) for card, netbanking & UPI. This is the long-term option once you have a current account.")}
      </div>

      {/* Drive removed — photos are uploaded directly from device in the product form */}

      {/* Shipping rates editor */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>🚚 Shipping Rates</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Edit shipping prices per zone. Leave blank to use default rates. Changes apply immediately after Save.</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:4}}>Base packaging weight for <b>Dry Goods</b> orders (kg)</div>
          <input type="number" step="0.25" min="0"
            value={(f.shippingRates||DEFAULT_SHIPPING_RATES).basePackagingKg||0.5}
            onChange={e=>{const cur=f.shippingRates||{...DEFAULT_SHIPPING_RATES};set("shippingRates",{...cur,basePackagingKg:Number(e.target.value)||0.5});}}
            style={{width:"120px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:4}}>Base packaging weight for <b>Live Fish</b> orders (kg) — oxygen bag + box</div>
          <input type="number" step="0.25" min="0"
            value={(f.shippingRates||DEFAULT_SHIPPING_RATES).liveBasePackagingKg??0.5}
            onChange={e=>{const cur=f.shippingRates||{...DEFAULT_SHIPPING_RATES};set("shippingRates",{...cur,liveBasePackagingKg:Number(e.target.value)||0.5});}}
            style={{width:"120px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          <div style={{fontSize:10.5,color:C.textSub,marginTop:4}}>Each fish's per-variant packaging weight is set in the product form. Total = fish weights + this base.</div>
        </div>
        {["dryGoods","liveFish"].map(type=>{
          const rows = (f.shippingRates||DEFAULT_SHIPPING_RATES)[type]||{};
          const label = type==="dryGoods"?"🐟 Dry Goods (by weight)":"🐠 Live Fish (by total parcel weight)";
          return(
            <div key={type} style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:6}}>{label}</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
                  <thead>
                    <tr>
                      <th style={{padding:"5px 4px",color:C.textSub,textAlign:"left",fontWeight:700,fontSize:10}}>Size/Weight</th>
                      {ZONE_KEYS.map(z=><th key={z} style={{padding:"5px 4px",color:C.textSub,textAlign:"center",fontWeight:700,fontSize:10}}>{ZONE_LABELS[z]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(rows).map(([bracket,prices])=>(
                      <tr key={bracket}>
                        <td style={{padding:"4px 4px",fontSize:10.5,color:C.text,fontWeight:600,whiteSpace:"nowrap"}}>{bracket}</td>
                        {ZONE_KEYS.map(z=>(
                          <td key={z} style={{padding:"3px 4px"}}>
                            <input type="number" min="0"
                              value={prices[z]||0}
                              onChange={e=>{
                                const cur=f.shippingRates||{...DEFAULT_SHIPPING_RATES};
                                const typeRates={...(cur[type]||{})};
                                typeRates[bracket]={...(typeRates[bracket]||{}),[z]:Number(e.target.value)||0};
                                set("shippingRates",{...cur,[type]:typeRates});
                              }}
                              style={{width:"54px",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"6px 6px",fontSize:12,outline:"none",background:"white",textAlign:"right"}}/>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live-fish packing: thermacol charge chart + courier partners */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>📦 Live-Fish Packing &amp; Couriers</div>
        {/* Live-fish delivery region restriction */}
        <label style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none",background:f.liveFishRestrictNCIndia!==false?"#fef2f2":C.bg,borderRadius:12,padding:"11px 13px",border:`1.5px solid ${f.liveFishRestrictNCIndia!==false?"#fecaca":C.border}`}}>
          <input type="checkbox" checked={f.liveFishRestrictNCIndia!==false} onChange={e=>set("liveFishRestrictNCIndia",e.target.checked)} style={{width:18,height:18,accentColor:C.danger,flexShrink:0,marginTop:1}}/>
          <span><span style={{fontSize:13,color:C.text,fontWeight:700}}>🚫 Don't deliver live fish to Central &amp; North India</span><br/><span style={{fontSize:11,color:C.textSub,lineHeight:1.45}}>Detected from the customer's pincode. When on, live-fish orders to those regions are blocked at checkout (dry goods still ship everywhere). Turn off to allow all of India.</span></span>
        </label>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Thermacol (insulated box) is added when a customer picks a <b>Thermacol</b> packing option, or for premium fish you recommend it on. The charge is by total live-parcel weight — same brackets as the shipping chart above.</div>
        <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:6}}>🧊 Thermacol charge (₹ per parcel-weight bracket)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:8}}>
          {SHIP_TIERS.map(t=>{
            const cur=f.shippingRates||{...DEFAULT_SHIPPING_RATES};
            const therm=cur.thermacol||DEFAULT_SHIPPING_RATES.thermacol;
            return(
              <div key={t} style={{display:"flex",alignItems:"center",gap:8,background:C.bg,borderRadius:10,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                <span style={{fontSize:11,color:C.text,fontWeight:700,flex:1,whiteSpace:"nowrap"}}>{t}</span>
                <span style={{fontSize:12,color:C.textSub,fontWeight:700}}>₹</span>
                <input type="number" min="0" value={therm[t]||0}
                  onChange={e=>{const c2=f.shippingRates||{...DEFAULT_SHIPPING_RATES};const th={...(c2.thermacol||DEFAULT_SHIPPING_RATES.thermacol)};th[t]=Number(e.target.value)||0;set("shippingRates",{...c2,thermacol:th});}}
                  style={{width:"58px",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"6px 8px",fontSize:12,outline:"none",background:"white",textAlign:"right"}}/>
              </div>
            );
          })}
        </div>
        <div style={{height:1,background:C.border,margin:"14px 0"}}/>
        {/* Shipping-overcharge reward */}
        <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:6}}>🎁 Shipping-overcharge reward</div>
        <div style={{fontSize:11.5,color:C.textSub,marginBottom:8,lineHeight:1.5}}>When you ship an order you can enter what the courier actually cost. If it's lower than what the customer paid by at least this amount, the app creates a reward code in their orders to use next time — so you're never overcharging for shipping.</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{fontSize:11.5,color:C.text,fontWeight:700}}>Minimum difference to reward (₹)</span>
          <input type="number" min="0" value={f.shippingRewardMin??10} onChange={e=>set("shippingRewardMin",Number(e.target.value)||0)}
            style={{width:"80px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"8px 10px",fontSize:13,outline:"none",background:"white"}}/>
        </div>
        <div style={{height:1,background:C.border,margin:"14px 0"}}/>
        {/* Courier partners */}
        <div style={{fontSize:12,fontWeight:800,color:C.primary,marginBottom:4}}>🚚 Courier partners &amp; tracking links</div>
        <div style={{fontSize:11.5,color:C.textSub,marginBottom:10,lineHeight:1.5}}>Add the couriers you use and each one's public tracking-page link. When you mark an order Shipped you'll pick the courier and enter the consignment number — the customer gets a <b>Track</b> button. Tip: if a courier's URL accepts the number directly, put <b style={{fontFamily:"monospace"}}>{"{awb}"}</b> where the number goes (e.g. <span style={{fontFamily:"monospace"}}>https://dtdc.in/track?awb={"{awb}"}</span>) and it'll auto-fill; otherwise we copy the number for the customer to paste.</div>
        {(f.couriers||[]).map((c,i)=>(
          <div key={c.id||i} style={{background:C.bg,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input value={c.name||""} onChange={e=>{const arr=[...(f.couriers||[])];arr[i]={...arr[i],name:e.target.value};set("couriers",arr);}}
                placeholder="Courier name (e.g. DTDC, ST Courier)"
                style={{flex:1,borderRadius:8,border:`1.5px solid ${C.border}`,padding:"8px 10px",fontSize:13,fontWeight:700,outline:"none",background:"white"}}/>
              <button className="press" onClick={()=>{const arr=(f.couriers||[]).filter((_,j)=>j!==i);set("couriers",arr);}}
                style={{flexShrink:0,width:28,height:28,borderRadius:8,background:"#fee2e2",color:C.danger,border:"none",fontSize:15,cursor:"pointer"}}>×</button>
            </div>
            <input value={c.trackUrl||""} onChange={e=>{const arr=[...(f.couriers||[])];arr[i]={...arr[i],trackUrl:e.target.value.trim()};set("couriers",arr);}}
              placeholder="https://courier.com/track  (optionally with {awb})"
              style={{width:"100%",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"8px 10px",fontSize:12,fontFamily:"monospace",outline:"none",background:"white",marginTop:6,boxSizing:"border-box"}}/>
          </div>
        ))}
        <button className="press" onClick={()=>set("couriers",[...(f.couriers||[]),{id:"cr"+Date.now().toString(36),name:"",trackUrl:""}])}
          style={{width:"100%",background:"white",border:`1.5px dashed ${C.primary}`,color:C.primary,borderRadius:12,padding:"10px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginTop:2}}>
          ＋ Add Courier Partner
        </button>
      </div>

      {/* Special delivery & live guarantee pricing */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>⚡ Speed Delivery &amp; 🛡️ Live Guarantee</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,marginBottom:6}}>Speed Delivery add-on (₹)</div>
            <input type="number" min="0" value={f.specialDeliveryPrice||200} onChange={e=>set("specialDeliveryPrice",Number(e.target.value))}
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 12px",fontSize:14,outline:"none",background:"white"}}/>
            <div style={{fontSize:10.5,color:C.textSub,marginTop:4}}>Extra charge for fast/safe courier. Shown at checkout.</div>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,marginBottom:6}}>🚚 Free Delivery above (₹)</div>
            <input type="number" min="0" value={f.freeDeliveryThreshold||0} onChange={e=>set("freeDeliveryThreshold",Number(e.target.value))}
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 12px",fontSize:14,outline:"none",background:"white"}}/>
            <div style={{fontSize:10.5,color:C.textSub,marginTop:4}}>Home-page banner. Set 0 to hide.</div>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,marginBottom:6}}>📦 Carton packing charge (₹)</div>
            <input type="number" min="0" value={f.cartonPackingCharge||0} onChange={e=>set("cartonPackingCharge",Number(e.target.value)||0)}
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 12px",fontSize:14,outline:"none",background:"white"}}/>
            <div style={{fontSize:10.5,color:C.textSub,marginTop:4}}>Added to live-fish parcels packed in a carton box, shown in the checkout breakup. Leave 0 for now.</div>
          </div>
        </div>
      </div>

      </>)}
      {sec==="promos"&&(<>
      {/* Coupon codes */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>🎟 Coupon Codes</div>
        {/* Master switch: show/hide the coupon box at checkout */}
        <label style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none",background:C.bg,borderRadius:12,padding:"11px 13px",border:`1.5px solid ${C.border}`}}>
          <input type="checkbox" checked={f.showCouponField!==false} onChange={e=>set("showCouponField",e.target.checked)} style={{width:18,height:18,accentColor:C.primary,flexShrink:0,marginTop:1}}/>
          <span><span style={{fontSize:13,color:C.text,fontWeight:700}}>Show coupon box at checkout</span><br/><span style={{fontSize:11,color:C.textSub}}>Off = no coupon field shown to anyone. Secret codes still work only if you turn this on.</span></span>
        </label>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Each code is usable once per Google account. Set a <b style={{color:C.text}}>Min ₹</b> to require a minimum cart value (0 = none). Tick <b style={{color:C.text}}>Secret</b> to keep a code hidden from the public list — it still works when a customer types it, perfect for codes you share privately.</div>
        {(f.coupons||[]).map((c,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,background:C.bg,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
            <div style={{flex:1}}>
              <input value={c.code} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],code:e.target.value.toUpperCase()};set("coupons",arr);}}
                placeholder="CODE"
                style={{width:"100%",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"7px 10px",fontSize:13,fontWeight:700,fontFamily:"monospace",outline:"none",background:"white",marginBottom:4}}/>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <select value={c.type||"flat"} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],type:e.target.value};set("coupons",arr);}}
                  style={{borderRadius:8,border:`1.5px solid ${C.border}`,padding:"5px 8px",fontSize:12,outline:"none",background:"white"}}>
                  <option value="flat">₹ Flat off</option>
                  <option value="percent">% Percent off</option>
                </select>
                <input type="number" min="0" value={c.discount||""} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],discount:Number(e.target.value)};set("coupons",arr);}}
                  placeholder="Amount"
                  style={{width:"70px",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"5px 8px",fontSize:12,outline:"none",background:"white"}}/>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{fontSize:10.5,color:C.textSub,fontWeight:600,whiteSpace:"nowrap"}}>Min&nbsp;₹</span>
                  <input type="number" min="0" value={c.minOrder||""} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],minOrder:Number(e.target.value)||0};set("coupons",arr);}}
                    placeholder="0"
                    title="Minimum cart value required (0 = no minimum)"
                    style={{width:"68px",borderRadius:8,border:`1.5px solid ${C.border}`,padding:"5px 8px",fontSize:12,outline:"none",background:"white"}}/>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11.5,color:C.text,cursor:"pointer"}}>
                  <input type="checkbox" checked={c.active!==false} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],active:e.target.checked};set("coupons",arr);}} style={{accentColor:C.primary}}/>
                  Active
                </label>
                <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11.5,color:c.secret?"#b45309":C.text,cursor:"pointer",fontWeight:c.secret?700:400}} title="Hidden from the public coupon list — still works when typed">
                  <input type="checkbox" checked={!!c.secret} onChange={e=>{const arr=[...(f.coupons||[])];arr[i]={...arr[i],secret:e.target.checked};set("coupons",arr);}} style={{accentColor:"#d97706"}}/>
                  🤫 Secret
                </label>
              </div>
            </div>
            <button className="press" onClick={()=>{const arr=(f.coupons||[]).filter((_,j)=>j!==i);set("coupons",arr);}}
              style={{flexShrink:0,width:28,height:28,borderRadius:8,background:"#fee2e2",color:C.danger,border:"none",fontSize:15,cursor:"pointer"}}>×</button>
          </div>
        ))}
        <button className="press" onClick={()=>set("coupons",[...(f.coupons||[]),{code:"",type:"flat",discount:0,active:true,secret:false}])}
          style={{width:"100%",background:"white",border:`1.5px dashed ${C.primary}`,color:C.primary,borderRadius:12,padding:"10px",fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",marginTop:4}}>
          ＋ Add Coupon Code
        </button>
      </div>

      {/* Welcome coupon */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12,display:"flex",alignItems:"center",flexWrap:"wrap"}}>🎉 First-Order Welcome Coupon{usageBadge("coupon",f.couponDailyLimit)}</div>
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none"}}>
          <input type="checkbox" checked={f.welcomeCouponEnabled!==false} onChange={e=>set("welcomeCouponEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Show welcome coupon banner</span>
        </label>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Shown to customers who have never ordered. Turn off to hide it (e.g. when you'd rather run a Festival Banner below).</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Coupon Code</div>
            <input value={f.welcomeCoupon||"WELCOME100"} onChange={e=>set("welcomeCoupon",e.target.value.toUpperCase())}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Discount (₹)</div>
            <input type="number" min="0" value={f.welcomeCouponAmount||100} onChange={e=>set("welcomeCouponAmount",Number(e.target.value))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Min Order Value (₹)</div>
            <input type="number" min="0" value={f.welcomeCouponMinOrder||999} onChange={e=>set("welcomeCouponMinOrder",Number(e.target.value))}
              style={{width:"140px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Daily limit (0 = unlimited)</div>
            <input type="number" min="0" value={f.couponDailyLimit||0} onChange={e=>set("couponDailyLimit",Number(e.target.value))}
              style={{width:"140px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
        </div>
        <div style={{fontSize:10.5,color:C.textSub,marginTop:6}}>Add this code to your coupons above too — so it's actually redeemable at checkout. Daily limit caps how many customers can use coupons each day.</div>
      </div>

      {/* Festival / seasonal banner */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>🎊 Seasonal / Festival Banner</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Shown at the top of the home page. Perfect for Diwali, New Year, flash promotions etc.</div>
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,cursor:"pointer"}}>
          <input type="checkbox" checked={!!(f.festivalBanner||{}).active} onChange={e=>set("festivalBanner",{...(f.festivalBanner||{}),active:e.target.checked})} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Show banner</span>
        </label>
        <div style={{display:"grid",gridTemplateColumns:"60px 1fr",gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Emoji</div>
            <input value={(f.festivalBanner||{}).emoji||"🎉"} onChange={e=>set("festivalBanner",{...(f.festivalBanner||{}),emoji:e.target.value})}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:18,outline:"none",background:"white",textAlign:"center"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Banner Text</div>
            <input value={(f.festivalBanner||{}).text||""} onChange={e=>set("festivalBanner",{...(f.festivalBanner||{}),text:e.target.value})} placeholder="e.g. 🎆 Happy Diwali! Extra 10% off all fish today →"
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Background Color</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["#7c3aed","#0b6e72","#dc2626","#c2410c","#047857","#1d4ed8","#be185d"].map(col=>(
                <button key={col} onClick={()=>set("festivalBanner",{...(f.festivalBanner||{}),bg:col})}
                  style={{width:28,height:28,borderRadius:8,background:col,border:((f.festivalBanner||{}).bg===col)?"2px solid #fff":"2px solid transparent",boxShadow:((f.festivalBanner||{}).bg===col)?"0 0 0 2px "+col:"none",cursor:"pointer"}}/>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Hide after date</div>
            <input type="date" value={(f.festivalBanner||{}).endsAt||""} onChange={e=>set("festivalBanner",{...(f.festivalBanner||{}),endsAt:e.target.value})}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:12,outline:"none",background:"white"}}/>
          </div>
        </div>
      </div>

      {/* Wallet (loyalty points) */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>👛 Customer Wallet</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Every customer has a wallet. They earn points per ₹100 spent, plus referral rewards and shipping refunds — all land in the same wallet, redeemable for ₹ off at checkout. <b>₹ per point</b> is the coin value.</div>
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"pointer"}}>
          <input type="checkbox" checked={!!f.loyaltyEnabled} onChange={e=>set("loyaltyEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Enable customer wallet</span>
        </label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Pts per ₹100</div>
            <input type="number" min="1" value={f.loyaltyPointsPerHundred||10} onChange={e=>set("loyaltyPointsPerHundred",Number(e.target.value))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Min to redeem</div>
            <input type="number" min="1" value={f.loyaltyRedeemMin||100} onChange={e=>set("loyaltyRedeemMin",Number(e.target.value))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>₹ per point (coin value)</div>
            <input type="number" min="0.1" step="0.1" value={f.loyaltyRedeemValue||1} onChange={e=>set("loyaltyRedeemValue",Number(e.target.value))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 10px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
        </div>
        <div style={{fontSize:10.5,color:C.textSub,marginTop:8}}>Example: spend ₹1000 → earn {(f.loyaltyPointsPerHundred||10)*10} pts → worth ₹{Math.floor((f.loyaltyPointsPerHundred||10)*10*(f.loyaltyRedeemValue||1))} in the wallet.</div>
        <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Max total discount per order (% of subtotal)</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="number" min="0" max="100" value={f.maxDiscountPct??25} onChange={e=>set("maxDiscountPct",Number(e.target.value))}
              style={{width:"90px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
            <span style={{fontSize:11,color:C.textSub,lineHeight:1.4,flex:1}}>Coupon + referral + wallet points combined can never exceed this. <b>0 = no cap</b> (risky). Protects your margin when offers stack.</span>
          </div>
        </div>
      </div>

      {/* Referral discount */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12,display:"flex",alignItems:"center",flexWrap:"wrap"}}>💜 Referral Program{usageBadge("referral",f.referralDailyLimit)}</div>
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none"}}>
          <input type="checkbox" checked={f.referralEnabled!==false} onChange={e=>set("referralEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Enable referral program</span>
        </label>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>After an order at/above the minimum, customers get a unique <b>6-digit code</b> to share. A friend enters it at checkout for ₹X off — each code works <b>once</b>, then is permanently used.</div>
        <div style={{display:"flex",gap:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Friend's discount (₹)</div>
            <input type="number" min="0" value={f.referralDiscount||50} onChange={e=>set("referralDiscount",Number(e.target.value))}
              style={{width:"110px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Giver's wallet coins</div>
            <input type="number" min="0" value={f.referralCoins??50} onChange={e=>set("referralCoins",Number(e.target.value))}
              style={{width:"120px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
            <div style={{fontSize:10,color:C.textSub,marginTop:3}}>Points added to the code-giver's 👛 wallet when a friend uses it.</div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Min order to issue (₹)</div>
            <input type="number" min="0" value={f.referralMinOrder||0} onChange={e=>set("referralMinOrder",Number(e.target.value))}
              style={{width:"130px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
            <div style={{fontSize:10,color:C.textSub,marginTop:3}}>0 = always issue a code</div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5}}>Daily limit</div>
            <input type="number" min="0" value={f.referralDailyLimit||0} onChange={e=>set("referralDailyLimit",Number(e.target.value))}
              style={{width:"110px",borderRadius:10,border:`1.5px solid ${C.border}`,padding:"9px 12px",fontSize:13,outline:"none",background:"white"}}/>
            <div style={{fontSize:10,color:C.textSub,marginTop:3}}>0 = unlimited / day</div>
          </div>
        </div>
        <div style={{fontSize:11,color:C.textSub,marginTop:10,lineHeight:1.5,background:C.bg,borderRadius:10,padding:"9px 11px"}}>💜 When a friend uses a code: the <b>friend</b> gets ₹{f.referralDiscount||50} off their order immediately, and the <b>giver</b> earns {f.referralCoins??50} wallet points (≈ ₹{Math.floor((f.referralCoins??50)*(f.loyaltyRedeemValue||1))}) <b>once the friend's order is successfully delivered</b>.</div>
      </div>

      {/* Tank showcase */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",marginBottom:16,border:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:12}}>🪸 Customer Tank Showcase</div>
        <div style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.5}}>Let signed-in customers upload their tank photos, displayed as a gallery on the home page.</div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={!!f.showcaseEnabled} onChange={e=>set("showcaseEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Enable tank showcase</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <input type="checkbox" checked={f.testimonialsEnabled!==false} onChange={e=>set("testimonialsEnabled",e.target.checked)} style={{width:18,height:18,accentColor:C.primary}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Enable customer testimonials</span>
        </label>
      </div>

      </>)}
      <button className="press" onClick={()=>startSave(f)}
        style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:14,padding:"15px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
        💾 Save Settings
      </button>
      <div style={{fontSize:11,color:C.textSub,textAlign:"center",marginTop:12,lineHeight:1.5}}>
        Settings sync to all devices via Firebase{FB_OK?" ✓ connected":" (offline — saved on this device)"}.
      </div>

      {otpOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(8,30,33,.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={e=>{if(e.target===e.currentTarget){setOtpOpen(false);setPendingSave(null);}}}>
          <div className="fade-in" style={{width:"100%",maxWidth:360,background:"white",borderRadius:18,padding:"22px 20px",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:40,textAlign:"center",marginBottom:8}}>🔐</div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text,textAlign:"center",marginBottom:6}}>Confirm with email code</div>
            <div style={{fontSize:12.5,color:C.textSub,textAlign:"center",lineHeight:1.5,marginBottom:18}}>
              We emailed a 6-digit code to<br/><b style={{color:C.text}}>{maskEmail(otpEmail)}</b>.<br/>Enter it to confirm this change (WhatsApp, email, password or payment details).
            </div>
            <input value={otpInput} onChange={e=>{setOtpInput(e.target.value.replace(/\D/g,"").slice(0,6));if(otpMsg)setOtpMsg("");}}
              onKeyDown={e=>{if(e.key==="Enter")verifyOtp();}}
              inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus
              style={{width:"100%",borderRadius:14,border:`1.5px solid ${C.border}`,padding:"14px",fontSize:24,letterSpacing:8,textAlign:"center",fontWeight:800,fontFamily:PRICE_FONT,outline:"none",background:C.bg,color:C.text,boxSizing:"border-box"}}/>
            {otpMsg&&<div style={{fontSize:12,fontWeight:700,textAlign:"center",marginTop:10,color:otpMsg[0]==="✓"?C.success:(otpMsg[0]==="⚠"||otpMsg[0]==="✕"||otpMsg[0]==="⌛")?C.danger:C.textSub}}>{otpMsg}</div>}
            <button className="press" onClick={verifyOtp} disabled={otpInput.length<6||otpBusy}
              style={{width:"100%",marginTop:16,background:(otpInput.length<6||otpBusy)?"#9ca3af":C.primary,color:"white",border:"none",borderRadius:14,padding:"14px",fontSize:14.5,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              {otpBusy?"Sending…":"Verify & Save"}
            </button>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
              <button className="press" onClick={()=>{setOtpOpen(false);setPendingSave(null);}}
                style={{background:"none",border:"none",color:C.textSub,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",padding:"6px 4px"}}>Cancel</button>
              <button className="press" onClick={resendOtp} disabled={otpBusy}
                style={{background:"none",border:"none",color:C.primary,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",padding:"6px 4px",opacity:otpBusy?.5:1}}>Resend code</button>
            </div>
            {otpSendFailed&&(
              <div style={{marginTop:14,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"12px 13px"}}>
                <div style={{fontSize:11.5,color:"#9a3412",lineHeight:1.55,marginBottom:4}}>📭 Code didn't arrive? You can still save by entering your secret answer.</div>
                <div style={{fontSize:11,color:"#b45309",fontWeight:800,marginBottom:8}}>🔑 Clue: IITM Roll Number</div>
                <input value={overrideText} onChange={e=>setOverrideText(e.target.value)} placeholder="Enter secret answer" type="password"
                  style={{width:"100%",borderRadius:10,border:"1.5px solid #fed7aa",padding:"10px 12px",fontSize:13,letterSpacing:1,textAlign:"center",fontWeight:700,outline:"none",background:"white",boxSizing:"border-box",fontFamily:"'Nunito',sans-serif"}}/>
                <button className="press" disabled={hashPass(overrideText)!==ADMIN_OVERRIDE_HASH} onClick={()=>{ const nf=pendingSave; setOtpOpen(false); setOtpCode(""); setPendingSave(null); setOtpSendFailed(false); setOverrideText(""); onSave(nf); }}
                  style={{width:"100%",marginTop:10,background:hashPass(overrideText)===ADMIN_OVERRIDE_HASH?C.danger:"#e5b89a",color:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>Save with secret answer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function GuideForm({guide,imgSrc,onSave,onCancel}){
  const isEdit=!!guide;
  const [form,setForm]=useState({title:guide?.title||"",category:guide?.category||GUIDE_CATEGORIES[0],content:guide?.content||""});
  const [imgB64,setImgB64]=useState(null);
  const [imgPrev,setImgPrev]=useState(imgSrc||null);
  const [imgNote,setImgNote]=useState("");
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const handleImg=async file=>{
    if(!file)return;
    setImgNote("Processing…");
    const b64=await compressImage(file, 1800, 0.88);
    setImgB64(b64);setImgPrev(b64);
    setImgNote(`✓ HD poster ready (${fmtSize(b64.length*0.75|0)})`);
  };
  const submit=async()=>{
    const e={};
    if(!form.title.trim())e.title="Title required";
    // Content is optional — but require at least a poster OR some text
    if(!form.content.trim() && !imgB64 && !(guide?.hasImg))e.content="Add a poster image or some text";
    setErrs(e);
    if(Object.keys(e).length)return;
    setSaving(true);
    const id=guide?.id||uid("g");
    const saved={id,title:form.title.trim(),category:form.category,content:form.content.trim(),
      hasImg:imgB64?true:(guide?.hasImg||false),createdAt:guide?.createdAt||new Date().toISOString()};
    await onSave(saved,imgB64);
    setSaving(false);
  };

  return(
    <div className="fade-in">
      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:19,fontWeight:800,color:C.text,marginBottom:16}}>{isEdit?"Edit Guide":"New Care Guide"}</div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Title</div>
        <input value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Betta Fish Care Basics"
          style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.title?C.danger:C.border}`,padding:"11px 14px",fontSize:14,outline:"none",background:"white"}}/>
        {errs.title&&<div style={{fontSize:11,color:C.danger,fontWeight:600,marginTop:4}}>{errs.title}</div>}
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Category</div>
        <select value={form.category} onChange={e=>f("category",e.target.value)}
          style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"11px 14px",fontSize:13,outline:"none",background:"white"}}>
          {GUIDE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <MediaUploader label="Poster Image (recommended)" accept="image/*" preview={imgPrev} previewType="image" fit="contain"
        onChange={handleImg} onClear={()=>{setImgB64(null);setImgPrev(null);setImgNote("");}} note={imgNote||"Upload your full poster — shown complete (not cropped), in full HD"}/>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Instructions / Text <span style={{textTransform:"none",fontWeight:400,color:C.textSub}}>(optional)</span></div>
        <textarea value={form.content} onChange={e=>f("content",e.target.value)} rows={5}
          placeholder={"Optional — leave blank if your poster already has all the info.\nOr add tips: use • or 1. 2. 3. for lists; line breaks are kept."}
          style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.content?C.danger:C.border}`,padding:"11px 14px",fontSize:13,outline:"none",resize:"vertical",lineHeight:1.7,background:"white"}}/>
        {errs.content&&<div style={{fontSize:11,color:C.danger,fontWeight:600,marginTop:4}}>{errs.content}</div>}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="press" onClick={onCancel} style={{flex:1,padding:"13px",borderRadius:12,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Cancel</button>
        <button className="press" onClick={submit} disabled={saving} style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:C.primary,color:"white",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:saving?.7:1}}>
          {saving?<><Spinner/>Saving…</>:isEdit?"Save Changes":"Publish Guide"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ CARE GUIDES PAGE ═══════════════════ */
function CareGuidesPage({nav,guides,mediaCache}){
  const [cat,setCat]=useState("All");
  const [openId,setOpenId]=useState(null);
  const [zoom,setZoom]=useState(null);
  const [pz,setPz]=useState(false);
  const cats=["All",...GUIDE_CATEGORIES.filter(c=>guides.some(g=>g.category===c))];
  const list=cat==="All"?guides:guides.filter(g=>g.category===cat);
  return(
    <div className="slide-up">
      <div className="vh-head" style={{background:`linear-gradient(150deg,${C.primaryDark},${C.primary})`,padding:"52px 18px 22px",color:"white",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-20,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <button className="press" onClick={()=>nav("home")} style={{background:"rgba(255,255,255,.18)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,marginBottom:14}}>←</button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:24,fontWeight:800,marginBottom:6}}>Aquarium Care Guides</div>
            <div style={{fontSize:13,opacity:.9,lineHeight:1.5,maxWidth:310}}>Tips, instructions & posters to keep your fish healthy and your tank thriving.</div>
          </div>
          <div style={{flexShrink:0,marginTop:4}}>
            <GuideNotifBtn/>
          </div>
        </div>
      </div>

      {cats.length>1&&(
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"14px 16px 4px",WebkitOverflowScrolling:"touch"}}>
          {cats.map(c=>(
            <button key={c} className="press" onClick={()=>setCat(c)}
              style={{flexShrink:0,padding:"8px 14px",borderRadius:20,border:`1.5px solid ${cat===c?C.primary:C.border}`,background:cat===c?C.primary:"transparent",color:cat===c?"white":C.textSub,fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div style={{padding:"12px 16px 100px"}}>
        {list.length===0?(
          <div style={{textAlign:"center",padding:"50px 20px",color:C.textSub}}>
            <div style={{fontSize:52,marginBottom:14}}>📖</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>No guides yet</div>
            <div style={{fontSize:12}}>Care guides will appear here soon.</div>
          </div>
        ):list.map(g=>{
          const img=mediaCache["img-"+g.id];
          const open=openId===g.id;
          const content=g.content||"";
          return(
            <div key={g.id} style={{background:C.card,borderRadius:18,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
              {img&&(
                <button onClick={()=>setZoom(img)} className="press"
                  style={{display:"block",width:"100%",padding:0,border:"none",background:"#0c2b30",cursor:"zoom-in",lineHeight:0,overflow:"hidden"}}>
                  <SmoothImg src={img} alt={g.title} style={{width:"100%",maxWidth:"100%",height:"auto",display:"block"}}/>
                </button>
              )}
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"inline-block",fontSize:10,fontWeight:800,color:C.accent,background:C.accentLight,padding:"3px 10px",borderRadius:20,marginBottom:8,letterSpacing:.5}}>{g.category}</div>
                <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:17,fontWeight:800,color:C.text,marginBottom:content?8:0,lineHeight:1.3}}>{g.title}</div>
                {content&&(
                  <div style={{fontSize:13.5,color:C.textSub,lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:open?"none":78,overflow:"hidden",position:"relative"}}>
                    {content}
                    {!open&&content.length>140&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:36,background:`linear-gradient(transparent,${C.card})`}}/>}
                  </div>
                )}
                {content.length>140&&(
                  <button className="press" onClick={()=>setOpenId(open?null:g.id)}
                    style={{marginTop:8,background:"none",border:"none",color:C.accent,fontSize:12.5,fontWeight:700,fontFamily:"'Nunito',sans-serif",padding:0}}>
                    {open?"Show less ↑":"Read more ↓"}
                  </button>
                )}
                {img&&<div style={{fontSize:11,color:C.textSub,marginTop:content?10:8}}>🔍 Tap poster to view full size</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fullscreen poster viewer — tap image to zoom in for full detail, tap outside to close */}
      {zoom&&(
        <Portal>
        <div onClick={()=>{setZoom(null);setPz(false);}} style={{position:"fixed",inset:0,background:"rgba(4,16,20,.94)",zIndex:9000,display:"flex",alignItems:pz?"flex-start":"center",justifyContent:pz?"flex-start":"center",padding:pz?0:"16px",overflow:"auto",animation:"fadeIn .2s ease"}}>
          <img src={zoom} alt="" onClick={e=>{e.stopPropagation();setPz(z=>!z);}}
            style={pz
              ? {width:"auto",height:"auto",maxWidth:"none",minWidth:"100%",cursor:"zoom-out",display:"block"}
              : {maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8,cursor:"zoom-in"}}/>
          <div style={{position:"fixed",bottom:18,left:0,right:0,textAlign:"center",pointerEvents:"none"}}>
            <span style={{background:"rgba(0,0,0,.55)",color:"rgba(255,255,255,.92)",fontSize:11.5,fontWeight:700,padding:"6px 14px",borderRadius:20}}>{pz?"Tap image to fit · tap outside to close":"Tap image to zoom in · tap outside to close"}</span>
          </div>
          <button className="press" onClick={e=>{e.stopPropagation();setZoom(null);setPz(false);}} style={{position:"fixed",top:18,right:18,width:42,height:42,borderRadius:"50%",background:"rgba(255,255,255,.18)",border:"none",color:"white",fontSize:22,zIndex:9001}}>✕</button>
        </div>
        </Portal>
      )}
    </div>
  );
}

/* ═══════════════════ SAVED ITEMS PAGE ═══════════════════ */
function SavedPage({nav,products,mediaCache,favorites=[],addToCart,cartMap,onFav,interestedSet=[],onInterest,user,restockSet=[],onRestock}){
  const saved=products.filter(p=>favorites.includes(p.id));
  return(
    <div className="slide-up">
      <div className="vh-head" style={{background:C.card,padding:"52px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:22,fontWeight:800,color:C.text}}>♥ Saved Items</div>
        <div style={{fontSize:12.5,color:C.textSub,marginTop:2}}>{saved.length} item{saved.length!==1?"s":""} saved for later</div>
      </div>
      <div className="dt-read" style={{padding:"16px 16px 100px"}}>
        {saved.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.textSub}}>
            <div style={{fontSize:60,marginBottom:14}}>🤍</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>No saved items yet</div>
            <div style={{fontSize:13,marginBottom:20,lineHeight:1.5}}>Tap the ♥ on any product to save it here and order later.</div>
            <button className="press" onClick={()=>nav("shop")} style={{background:C.primary,color:"white",border:"none",borderRadius:14,padding:"13px 28px",fontSize:13,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Browse Products</button>
          </div>
        ):(
          <div className="prod-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {saved.map(p=>(
              <div key={p.id}>
                <ProductCard product={p} imgSrc={getProductMedia(p,mediaCache).images[0]}
                  onPress={p=>nav("detail",p)} onAdd={addToCart} inCart={cartMap[p.id]||0}
                  isFav={true} onFav={onFav} isInterested={interestedSet.includes(p.id)} onInterest={onInterest}/>
                <RestockBtn product={p} user={user} restockSet={restockSet} onSubscribe={onRestock}/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ ABOUT & POLICIES PAGE ═══════════════════ */
function AboutPage({nav,settings={}}){
  const s={...DEFAULT_SETTINGS,...settings};
  const Section=({icon,title,body,accent})=>(
    <div style={{background:C.card,borderRadius:18,padding:"18px",marginBottom:14,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:38,height:38,borderRadius:11,background:accent||C.accentLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:16,fontWeight:800,color:C.text}}>{title}</div>
      </div>
      <div style={{fontSize:13.5,color:C.textSub,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{body}</div>
    </div>
  );
  return(
    <div className="slide-up">
      <div className="vh-head" style={{background:`linear-gradient(150deg,${C.primaryDark},${C.primary})`,padding:"52px 18px 26px",color:"white",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-20,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <button className="press" onClick={()=>nav("home")} style={{background:"rgba(255,255,255,.18)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,marginBottom:14}}>←</button>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:25,fontWeight:800,marginBottom:6}}>About Us</div>
        <div style={{fontSize:13,opacity:.9,lineHeight:1.5,maxWidth:320}}>Who we are, how we deliver, and our promises to you.</div>
      </div>
      <div className="dt-read" style={{padding:"18px 16px 100px"}}>
        <Section icon="🐠" title={`Our Story`} body={s.aboutStory} accent="#ffe9d6"/>
        <Section icon="🚚" title="Delivery Areas" body={s.deliveryAreas} accent="#d4f4f5"/>
        {/* Policies — each opens its own focused page */}
        <div style={{background:C.card,borderRadius:18,padding:"18px",marginBottom:14,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:38,height:38,borderRadius:11,background:"#ede9fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📋</div>
            <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:16,fontWeight:800,color:C.text}}>Our Policies</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {icon:"🛡️",label:"Live Arrival Guarantee",to:"policy-guarantee"},
              {icon:"↩️",label:"Returns & Refunds",to:"policy-returns"},
              {icon:"💧",label:"Acclimatization Guide",to:"policy-acclimatize"},
              {icon:"📜",label:"Terms & Conditions",to:"policy-terms"},
              {icon:"🔒",label:"Privacy Policy",to:"policy-privacy"},
            ].map(l=>(
              <button key={l.to} className="press" onClick={()=>nav(l.to)}
                style={{display:"flex",alignItems:"center",gap:11,width:"100%",textAlign:"left",background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                <span style={{fontSize:18}}>{l.icon}</span>
                <span style={{flex:1,fontSize:13.5,fontWeight:700,color:C.text}}>{l.label}</span>
                <span style={{color:C.textSub,fontSize:17}}>›</span>
              </button>
            ))}
          </div>
        </div>
        {/* Business information — legitimacy, no personal/PAN data */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px",marginTop:6}}>
          <div style={{fontSize:11,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Business Information</div>
          <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:2}}>{s.legalName||(STORE_NAME+" Aqua Store")}</div>
          {s.legalEntity&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6}}>{s.legalEntity}</div>}
          {s.legalActivity&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6}}>{s.legalActivity}</div>}
          {(s.legalAddress||s.legalCity)&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6,marginTop:4}}>📍 {s.legalAddress||s.legalCity}</div>}
          {s.gstin&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6}}>GSTIN: {s.gstin}</div>}
          {s.orderEmail&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6}}>✉ {s.orderEmail}</div>}
          {s.ownerWhatsapp&&<div style={{fontSize:11.5,color:C.textSub,lineHeight:1.6}}>💬 +{s.ownerWhatsapp.replace(/\D/g,"")}</div>}
          <div style={{fontSize:10.5,color:C.textSub,lineHeight:1.6,marginTop:8,fontStyle:"italic"}}>Jurisdiction: {s.jurisdiction||"India"}. © {new Date().getFullYear()} {s.legalName||STORE_NAME}. All rights reserved.</div>
        </div>
        <div style={{textAlign:"center",marginTop:18}}>
          {s.ownerWhatsapp&&(
            <a href={`https://wa.me/${s.ownerWhatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener"
              style={{display:"inline-flex",alignItems:"center",gap:8,background:"#25D366",color:"white",borderRadius:14,padding:"13px 24px",fontSize:14,fontWeight:700,textDecoration:"none"}}>
              💬 Questions? Chat with us
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ SINGLE POLICY PAGE ═══════════════════ */
const POLICY_META = {
  guarantee:   { icon:"🛡️", title:"Live Arrival Guarantee", key:"liveArrivalGuarantee", sub:"Our promise on every live order." },
  returns:     { icon:"↩️", title:"Returns & Refunds",       key:"returnPolicy",         sub:"Returns, DOA claims & refunds." },
  acclimatize: { icon:"💧", title:"Acclimatization Guide",   key:"acclimatizationTips",  sub:"Settle your new arrivals in safely." },
  terms:       { icon:"📜", title:"Terms & Conditions",      key:"termsPolicy",          sub:"The terms you agree to when ordering." },
  privacy:     { icon:"🔒", title:"Privacy Policy",          key:"privacyPolicy",        sub:"How we handle your information." },
  delivery:    { icon:"🚚", title:"Delivery Areas",          key:"deliveryAreas",        sub:"Where and how we deliver." },
};
function PolicyPage({nav,settings={},which}){
  const s={...DEFAULT_SETTINGS,...settings};
  const meta=POLICY_META[which]||POLICY_META.terms;
  const others=Object.keys(POLICY_META).filter(k=>k!==which);
  return(
    <div className="slide-up">
      <div className="vh-head" style={{background:`linear-gradient(150deg,${C.primaryDark},${C.primary})`,padding:"52px 18px 26px",color:"white",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-20,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <button className="press" onClick={()=>nav("about")} style={{background:"rgba(255,255,255,.18)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,marginBottom:14}}>←</button>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:25,fontWeight:800,marginBottom:6}}>{meta.icon} {meta.title}</div>
        <div style={{fontSize:13,opacity:.9,lineHeight:1.5,maxWidth:320}}>{meta.sub}</div>
      </div>
      <div className="dt-read" style={{padding:"18px 16px 100px"}}>
        <div style={{background:C.card,borderRadius:18,padding:"20px",border:`1px solid ${C.border}`,fontSize:13.5,color:C.textSub,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{s[meta.key]}</div>
        <div style={{fontSize:11,fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,margin:"22px 4px 10px"}}>More policies</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {others.map(k=>(
            <button key={k} className="press" onClick={()=>nav("policy-"+k)}
              style={{display:"inline-flex",alignItems:"center",gap:7,background:C.card,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"9px 13px",fontSize:12.5,fontWeight:700,color:C.text,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
              <span>{POLICY_META[k].icon}</span>{POLICY_META[k].title}
            </button>
          ))}
        </div>
        {s.ownerWhatsapp&&(
          <div style={{textAlign:"center",marginTop:22}}>
            <a href={`https://wa.me/${s.ownerWhatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener"
              style={{display:"inline-flex",alignItems:"center",gap:8,background:"#25D366",color:"white",borderRadius:14,padding:"13px 24px",fontSize:14,fontWeight:700,textDecoration:"none"}}>
              💬 Questions? Chat with us
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ PRODUCT REQUEST PAGE ═══════════════════ */
function RequestPage({nav,user,onSubmit,myRequests}){
  const [form,setForm]=useState({product:"",brand:"",link:"",qty:"1",notes:"",name:user?.name||"",phone:user?.phone||""});
  const [imgB64,setImgB64]=useState(null);
  const [imgPrev,setImgPrev]=useState(null);
  const [imgNote,setImgNote]=useState("");
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const handleImg=async file=>{
    if(!file)return;
    setImgNote("Processing…");
    const b64=await fileToBase64(file);
    setImgB64(b64);setImgPrev(b64);
    setImgNote(`✓ ${fmtSize(file.size)} ready`);
  };

  const submit=async()=>{
    const e={};
    if(!form.product.trim())e.product="What product are you looking for?";
    if(!form.name.trim())e.name="Please enter your name";
    if(!/^[6-9]\d{9}$/.test(normalizePhone(form.phone)))e.phone="Valid 10-digit number required";
    setErrs(e);
    if(Object.keys(e).length)return;
    setSaving(true);
    const id=uid("req");
    const req={id,product:form.product.trim(),brand:form.brand.trim(),link:form.link.trim(),
      qty:form.qty,notes:form.notes.trim(),name:form.name.trim(),phone:normalizePhone(form.phone),
      hasImg:!!imgB64,status:"New",createdAt:new Date().toISOString()};
    await onSubmit(req,imgB64);
    setSaving(false);setDone(true);
  };

  if(done)return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",padding:"24px",textAlign:"center"}}>
      <div style={{width:80,height:80,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,marginBottom:20,animation:"checkPop .4s ease both"}}>✓</div>
      <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:23,fontWeight:800,color:C.text,marginBottom:8}}>Request Sent! 🙌</div>
      <div style={{fontSize:14,color:C.textSub,lineHeight:1.7,marginBottom:24,maxWidth:300}}>We've received your request. We'll source it and reach out on WhatsApp if it's available.</div>
      <div style={{display:"flex",gap:10}}>
        <button className="press" onClick={()=>{setDone(false);setForm(f=>({...f,product:"",brand:"",link:"",notes:""}));setImgB64(null);setImgPrev(null);}}
          style={{background:"transparent",color:C.primary,border:`1.5px solid ${C.primary}`,borderRadius:14,padding:"13px 22px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>+ Another</button>
        <button className="press" onClick={()=>nav("home")}
          style={{background:C.primary,color:"white",border:"none",borderRadius:14,padding:"13px 28px",fontSize:14,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>Back Home</button>
      </div>
    </div>
  );

  return(
    <div className="slide-up">
      <div className="vh-head" style={{background:`linear-gradient(150deg,${C.accent},${C.primary})`,padding:"52px 18px 24px",color:"white",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-20,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,.1)"}}/>
        <button className="press" onClick={()=>nav("home")} style={{background:"rgba(255,255,255,.18)",border:"none",borderRadius:10,width:36,height:36,color:"white",fontSize:18,marginBottom:14}}>←</button>
        <div style={{fontFamily:"'Baloo 2',sans-serif",fontSize:24,fontWeight:800,marginBottom:6}}>Request a Product</div>
        <div style={{fontSize:13,opacity:.9,lineHeight:1.5,maxWidth:300}}>Can't find what you need? Tell us the fish, plant, or gear you want and we'll try to source it for you.</div>
      </div>
      <div className="dt-read" style={{padding:"20px 16px 100px"}}>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Product Name *</div>
          <input value={form.product} onChange={e=>f("product",e.target.value)} placeholder="e.g. Galaxy Koi Betta, CO2 regulator…"
            style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.product?C.danger:C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
          {errs.product&&<div style={{fontSize:11,color:C.danger,fontWeight:600,marginTop:4}}>{errs.product}</div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Brand <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
            <input value={form.brand} onChange={e=>f("brand",e.target.value)} placeholder="e.g. Sera, Eheim"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Qty</div>
            <input type="number" min="1" value={form.qty} onChange={e=>f("qty",e.target.value)}
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Notes <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></div>
          <textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={3} placeholder="Size, colour, variant, budget, or paste a product link here…"
            style={{width:"100%",borderRadius:12,border:`1.5px solid ${C.border}`,padding:"12px 14px",fontSize:14,outline:"none",resize:"none",lineHeight:1.6,background:"white"}}/>
        </div>
        <div style={{height:1,background:C.border,margin:"4px 0 16px"}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Your Name *</div>
            <input value={form.name} onChange={e=>f("name",e.target.value)} placeholder="Name"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.name?C.danger:C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
            {errs.name&&<div style={{fontSize:11,color:C.danger,fontWeight:600,marginTop:4}}>{errs.name}</div>}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Phone *</div>
            <input type="tel" value={form.phone} onChange={e=>f("phone",e.target.value.replace(/\D/g,""))} maxLength={10} placeholder="9876543210"
              style={{width:"100%",borderRadius:12,border:`1.5px solid ${errs.phone?C.danger:C.border}`,padding:"12px 14px",fontSize:14,outline:"none",background:"white"}}/>
            {errs.phone&&<div style={{fontSize:11,color:C.danger,fontWeight:600,marginTop:4}}>{errs.phone}</div>}
          </div>
        </div>
        <button className="press" onClick={submit} disabled={saving}
          style={{width:"100%",background:C.primary,color:"white",border:"none",borderRadius:16,padding:"16px",fontSize:15,fontWeight:700,fontFamily:"'Nunito',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:saving?.7:1}}>
          {saving?<><Spinner/>Sending…</>:"📨 Send Request"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ ROOT APP ═══════════════════ */
function NemoStore(){
  const [page,setPage]             = useState("home");
  const [products,setProducts]     = useState(DEFAULT_PRODUCTS);
  const [orders,setOrders]         = useState([]);
  const [requests,setRequests]     = useState([]);
  const [guides,setGuides]         = useState(DEFAULT_GUIDES);
  const [settings,setSettings]     = useState(DEFAULT_SETTINGS);
  const [settingsReady,setSettingsReady] = useState(false);
  const [user,setUser]             = useState(null);
  const [authReturn,setAuthReturn] = useState("orders"); // where to go after login
  const [reviewedSet,setReviewedSet] = useState([]);
  const [reviewIntent,setReviewIntent] = useState(null);
  const [favorites,setFavorites]   = useState([]);
  const [interestedSet,setInterestedSet] = useState([]);
  const [interestCounts,setInterestCounts] = useState({});
  const [fbReady,setFbReady]       = useState(0);
  const [mediaCache,setMediaCache] = useState({});
  const [loading,setLoading]       = useState(true);
  const [showcase,setShowcase]     = useState([]);
  const [testimonials,setTestimonials] = useState([]);
  const [restockSet,setRestockSet] = useState(()=>loadRestockLocal().map(x=>x.pid));
  const [selProduct,setSelProduct] = useState(null);
  const [walletPts,setWalletPts]   = useState(0);
  const [cart,setCart]             = useState([]);
  const [query,setQuery]           = useState("");
  const [category,setCategory]     = useState("All");
  const [toast,setToast]           = useState(null);
  const scrollRef  = useRef(null);
  const vidUrlsRef = useRef({});
  const tapCount   = useRef(0);
  const tapTimer   = useRef(null);

  const saveSettingsHandler=async(s)=>{ setSettings(s); RUNTIME_CO_ADMIN=(s&&s.coAdminUid||"").trim(); await saveSettings(s); showToast("Settings saved"); };
  // Keep the runtime co-admin UID in sync so an entered helper account also unlocks admin (cloud writes still gated by Firebase rules).
  useEffect(()=>{ RUNTIME_CO_ADMIN=((settings&&settings.coAdminUid)||"").trim(); },[settings.coAdminUid]);

  const showToast=(msg,type="success")=>setToast({msg,type});

  // Load from storage
  // Load from storage — LOCAL first (instant), then hydrate from Firebase in the background
  const hydrateMedia=async(prods,reqs,guideList)=>{
    const cache={};
    await Promise.all([
      ...prods.map(async p=>{
        // New multi-media gallery — load all items in parallel (was serial for-loop: bug)
        if(Array.isArray(p.media)&&p.media.length){
          await Promise.all(p.media.map(async m=>{ const b=await loadMediaItem(m.key); if(b)cache["m-"+m.key]=b; }));
        }
        // Legacy single image/video
        if(p.hasImg){const b=await loadImg(p.id);if(b)cache["img-"+p.id]=b;}
        if(p.hasVid){const b=await loadVid(p.id);if(b)cache["vid-"+p.id]=b;}
      }),
      ...reqs.map(async r=>{ if(r.hasImg){const b=await loadImg(r.id);if(b)cache["img-"+r.id]=b;} }),
      ...guideList.map(async g=>{ if(g.hasImg){const b=await loadImg(g.id);if(b)cache["img-"+g.id]=b;} }),
    ]);
    setMediaCache(c=>({...c,...cache}));
  };

  const cloudSyncDone=useRef(false);
  const cloudSync=async()=>{
    if(!FB_OK||cloudSyncDone.current) return;
    cloudSyncDone.current=true;
    // Products — seed cloud from local/defaults if the cloud is empty
    let prods=await fbGetColl("products");
    if(prods!==null && prods.length===0){ const seed=(localProducts()||DEFAULT_PRODUCTS).map(normalizeProduct); await saveProd(seed); prods=seed; }
    const finalProds=(prods&&prods.length)?prods.map(normalizeProduct):null;
    if(finalProds) setProducts(finalProds);
    // Guides — seed if empty
    let gds=await fbGetColl("guides");
    if(gds!==null && gds.length===0){ const seed=localGuidesData()||DEFAULT_GUIDES; await saveGuides(seed); gds=seed; }
    const finalGds=(gds&&gds.length)?gds:null;
    if(finalGds) setGuides(finalGds);
    // ONE hydrateMedia call with all cloud data (was called twice: once for prods, once for guides)
    const syncedProds=finalProds||(localProducts()||DEFAULT_PRODUCTS).map(normalizeProduct);
    const syncedGds=finalGds||(localGuidesData()||[]);
    hydrateMedia(syncedProds, localRequests(), syncedGds);
    // Requests (admin needs these; customers' request page works regardless)
    const reqs=await loadRequests();
    if(reqs)setRequests(reqs);
    // Settings — seed if missing
    const stObj=await fbGetObj("settings");
    if(stObj===null && FB_OK){ const local=localSettingsData(); await saveSettings(local); setSettings(local); }
    else if(stObj){ const merged=normalizeSettings({...DEFAULT_SETTINGS,...stObj}); setSettings(merged); try{dbSet("nemo-settings",JSON.stringify(merged));}catch(e){} }
    setSettingsReady(true);
    // Showcase
    loadShowcase().then(sc=>{ if(sc&&sc.length) setShowcase(sc); });
    // Testimonials
    loadTestimonials().then(ts=>{ if(ts&&ts.length) setTestimonials(ts); });
  };

  useEffect(()=>{
    (async()=>{
      // 1) Instant first paint from local cache
      const localP=localProducts();
      const prods=(localP||DEFAULT_PRODUCTS).map(normalizeProduct);
      setProducts(prods);
      setOrders(localOrders());
      const reqs=localRequests(); setRequests(reqs);
      const guideList=localGuidesData()||DEFAULT_GUIDES; setGuides(guideList);
      setSettings(localSettingsData());
      // Caching is now reliable (media lives in IndexedDB, so localStorage no longer fills up
      // and silently drops settings writes). So a cached settings blob is trustworthy — reveal
      // settings-gated promo banners IMMEDIATELY from cache instead of waiting on the cloud fetch.
      // First-ever visitors (no cache) briefly wait for the cloud value; everyone else sees it instantly.
      try{ if(localStorage.getItem("nemo-settings")) setSettingsReady(true); }catch(e){}
      const u=await loadUser(); if(u){setUser(u);setReviewedSet(loadReviewedSet(userKey(u)));loadFavorites(userKey(u)).then(setFavorites);setInterestedSet(loadIntLocal(userKey(u)));}
      setLoading(false);
      // Remove the boot splash now that the app has painted
      try{ const sp=document.getElementById("splash"); if(sp){ sp.classList.add("hide"); setTimeout(()=>sp.remove(),450); } }catch(e){}
      hydrateMedia(prods,reqs,guideList);      // Seed defaults locally if first run
      if(!localP)saveProd(prods);
      if(!localGuidesData())saveGuides(guideList);
      // 2) Background cloud hydrate (won't block UI; safe if Firebase is slow/misconfigured)
      cloudSync();
    })();
  },[]);

  // When Firebase connects after first paint (async SDK), re-sync from the cloud
  useEffect(()=>{
    window.addEventListener("nemo-fb-ready",cloudSync);
    return()=>window.removeEventListener("nemo-fb-ready",cloudSync);
  },[]);

  // Safety net: first-ever visitors have no cache, so reveal settings-gated promo banners
  // from the local value after a short grace period even if Firebase is slow/blocked.
  useEffect(()=>{ const t=setTimeout(()=>setSettingsReady(true), 1200); return()=>clearTimeout(t); },[]);

  const deepLinkRef = useRef((()=>{ try{ return new URLSearchParams(window.location.search).get("p")||""; }catch(e){ return ""; } })());
  useEffect(()=>{
    const pid=deepLinkRef.current;
    if(!pid) return;
    const prod=products.find(p=>p.id===pid);
    if(prod){
      deepLinkRef.current=""; // fire once
      nav("detail",prod);
      // Tidy the URL so a refresh/share doesn't keep re-triggering, without reloading
      try{ window.history.replaceState({},"",window.location.pathname); }catch(e){}
    }
  },[products]);

  // Visitor analytics: count one visit per session, once Firebase is ready
  useEffect(()=>{
    if(FB_OK) trackVisit(); else window.addEventListener("nemo-fb-ready",trackVisit,{once:true});
    return()=>window.removeEventListener("nemo-fb-ready",trackVisit);
  },[]);
  // Optional Google Analytics, if the admin pasted a Measurement ID in Settings
  useEffect(()=>{ if(settings.gaId) injectGA(settings.gaId); },[settings.gaId]);

  const prevPageRef = useRef("shop");
  const pageRef = useRef("home");

  const nav=(pg,product=null)=>{
    if(pg!=="detail") setReviewIntent(null);
    // Remember where we came from so DetailPage back button works for any origin
    if(pg==="detail") prevPageRef.current = page;
    // Hardware-back trap: when leaving Home for a deeper page, push a history entry
    // so the phone's Back button returns to Home instead of closing the app.
    if(pageRef.current==="home" && pg!=="home"){ try{ history.pushState({nemo:1},""); }catch(e){} }
    pageRef.current = pg;
    setPage(pg);
    if(product)setSelProduct(product);
    // Instant jump to top on page change feels snappier than smooth on a full swap
    requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:0,behavior:"auto"}));
  };

  // Phone Back button: from any inner page → go Home; on Home → "press back again to exit".
  const exitArmRef = useRef(0);
  useEffect(()=>{
    // Seed one history entry so the FIRST back press is captured (even on a fresh Home load).
    try{ history.pushState({nemo:1},""); }catch(e){}
    const onPop=()=>{
      if(pageRef.current!=="home"){
        // Any inner page → return to Home instead of exiting
        setReviewIntent(null);
        pageRef.current="home";
        setPage("home");
        try{ history.pushState({nemo:1},""); }catch(e){}   // re-arm the trap
        requestAnimationFrame(()=>scrollRef.current?.scrollTo({top:0,behavior:"auto"}));
      } else {
        // On Home: classic mobile "press back again to exit" (window.confirm is blocked
        // inside popstate on most phones, so we use a toast warning instead).
        const now=Date.now();
        if(now - exitArmRef.current < 2500){
          window.removeEventListener("popstate",onPop);
          history.back();           // second press within 2.5s → actually leave
        } else {
          exitArmRef.current = now;
          try{ history.pushState({nemo:1},""); }catch(e){}   // stay in the app
          showToast("Press back again to exit "+STORE_NAME,"error");
        }
      }
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[]);

  // Secret admin tap handler
  const handleSecretTap=()=>{
    clearTimeout(tapTimer.current);
    tapCount.current+=1;
    if(tapCount.current>=SECRET_TAPS){
      tapCount.current=0;
      nav("admin-login");
    } else {
      tapTimer.current=setTimeout(()=>{tapCount.current=0;},2000);
    }
  };

  const addToCart=(product,qty=1,variant=null)=>{
    const stock = product.stockCount ?? DEFAULT_STOCK;
    let v = variant;
    if(!v && product.category==="Live Fish"){ const vs=productVariants(product); v=vs.find(x=>!x.soldOut)||vs[0]; }
    const key = product.id + (v?("|"+v.id):"");
    const unitPrice = v ? variantEffPrice(product, v) : effectivePrice(product);
    const maxAllowed = Math.max(0, Math.min(stock, MAX_PER_ORDER));
    setCart(prev=>{
      const ex=prev.find(i=>i.key===key);
      const curQty=ex?ex.qty:0;
      const nextQty=Math.min(maxAllowed, curQty+qty);
      if(nextQty<=0) return prev.filter(i=>i.key!==key);
      if(qty>0 && curQty+qty>maxAllowed) setTimeout(()=>showToast(`Only ${maxAllowed} available per order`,"error"),0);
      else if(qty>0) setTimeout(()=>showToast("Added to cart"),0);
      if(ex) return prev.map(i=>i.key===key?{...i,qty:nextQty}:i);
      return [...prev,{key,id:product.id,name:product.name,category:product.category,price:unitPrice,qty:nextQty,variantId:v?.id||null,variantLabel:v?.label||null,packagingWeight:product.packagingWeight??null,variantPackagingWeight:v?.packagingWeight??null,suggestedPacking:product.suggestedPacking||null,suggestSpecialDelivery:!!product.suggestSpecialDelivery,stockCount:stock}];
    });
  };
  const updateQty=(key,delta)=>
    setCart(prev=>prev.map(i=>{
      if(i.key!==key)return i;
      const max=Math.min(i.stockCount??DEFAULT_STOCK,MAX_PER_ORDER);
      return {...i,qty:Math.min(max,Math.max(0,i.qty+delta))};
    }).filter(i=>i.qty>0));

  // Auth
  const handleLogin=(u)=>{
    setUser(u);
    setReviewedSet(loadReviewedSet(userKey(u)));
    loadFavorites(userKey(u)).then(setFavorites);
    setInterestedSet(loadIntLocal(userKey(u)));
    if(u.keep!==false) saveUser(u);
    showToast(`Welcome, ${u.name?.split(" ")[0]||"there"}!`);
    nav("home"); // after sign-in, always land on the home page
  };
  const handleLogout=()=>{ setUser(null); setReviewedSet([]); setFavorites([]); setInterestedSet([]); clearUser(); showToast("Signed out"); nav("home"); };
  const goAuth=(returnTo="orders")=>{ setAuthReturn(returnTo); nav("auth"); };
  const adminGoogleSignIn=async()=>{
    try{
      showToast("Opening Google sign-in…");
      const u=await googleSignIn();
      if(u){
        const usr={...u,keep:true};
        setUser(usr); saveUser(usr);
        if(isAdminUid(u.uid)){ showToast("✓ Admin signed in — changes will now sync"); }
        else{ showToast("Signed in, but this isn't the admin account"); }
        setTimeout(()=>{ loadOrders().then(o=>o&&setOrders(o)); loadInterestCounts().then(setInterestCounts); },400);
      }
    }catch(e){ if(String(e?.message)!=="redirecting") showToast("Sign-in failed — try again","error"); }
  };
  const markReviewed=(pid)=>{ if(user){ setReviewedSet(addReviewedLocal(userKey(user),pid)); } };
  const startReview=(prod)=>{ setReviewIntent(prod.id); nav("detail",prod); };
  const toggleFav=(prod)=>{
    if(!user){ goAuth("home"); showToast("Sign in to save items"); return; }
    const on=!favorites.includes(prod.id);
    setFavorites(on?[...favorites,prod.id]:favorites.filter(x=>x!==prod.id));
    setFavoriteRemote(userKey(user),prod.id,on);
    showToast(on?"Saved to favorites ♥":"Removed from favorites");
  };
  const markInterested=(prod)=>{
    if(!user){ goAuth("home"); showToast("Sign in to register interest"); return; }
    if(interestedSet.includes(prod.id))return;
    setInterestedSet([...interestedSet,prod.id]);
    setInterestCounts(c=>({...c,[prod.id]:(c[prod.id]||0)+1}));
    markInterestedRemote(userKey(user),prod.id);
    showToast("Thanks! We'll notify you when it's in 🔔");
  };
  const handleShowcaseSubmit=async(item)=>{
    await addShowcasePhoto(item);
    setShowcase(s=>[item,...s.filter(x=>x.id!==item.id)]); // one per customer — replaces their previous photo
    showToast("📩 Submitted! We'll review and post it soon.");
  };
  const handleApproveShowcase=async(item)=>{
    const updated=await approveShowcasePhoto(item);
    setShowcase(s=>s.map(x=>x.id===item.id?updated:x));
    showToast("✓ Tank approved — now live for 24h");
  };
  const handleTestimonialSubmit=async(t)=>{
    await addTestimonial(t);
    setTestimonials(list=>[t,...list.filter(x=>x.uid!==t.uid)]);
  };
  const handleDeleteTestimonial=async(id)=>{
    await deleteTestimonial(id);
    setTestimonials(list=>list.filter(x=>x.id!==id));
    showToast("Testimonial removed");
  };
  const handleRestock=(prod)=>{
    if(!user){ goAuth("home"); showToast("Sign in to get restock alerts"); return; }
    const uid=userKey(user);
    subscribeRestock(uid, prod.id);
    setRestockSet(s=>[...new Set([...s,prod.id])]);
    showToast("🔔 You'll be alerted when it's back in stock!");
  };

  // Complete a Google redirect sign-in when the page returns from the redirect
  useEffect(()=>{
    const bump=()=>setFbReady(x=>x+1);
    window.addEventListener("nemo-fb-ready",bump);
    return()=>window.removeEventListener("nemo-fb-ready",bump);
  },[]);
  useEffect(()=>{
    const onReady=async()=>{
      try{
        if(!FB_OK||!FB_AUTH.getRedirectResult) return;
        const res=await FB_AUTH.getRedirectResult();
        if(res&&res.user&&!res.user.isAnonymous){
          const u={...googleUserFromCred(res.user),keep:true};
          setUser(u); saveUser(u); showToast(`Welcome, ${u.name?.split(" ")[0]||"there"}!`);
        }
      }catch(e){ /* no redirect pending */ }
    };
    onReady();
    window.addEventListener("nemo-fb-ready",onReady);
    return()=>window.removeEventListener("nemo-fb-ready",onReady);
  },[]);

  // Requests
  const submitRequest=async(req,imgB64)=>{
    if(imgB64){const ok=await saveImg(req.id,imgB64);req.hasImg=ok;if(ok)setMediaCache(c=>({...c,["img-"+req.id]:imgB64}));}
    setRequests(prev=>[req,...prev]); saveOneRequest(req); // per-id write — no longer clobbers other customers' requests
  };
  const deleteRequest=async(id)=>{
    setRequests(prev=>prev.filter(r=>r.id!==id)); deleteOneRequest(id);
    await delMedia(id);
    setMediaCache(c=>{const n={...c};delete n["img-"+id];return n;});
    showToast("Request deleted");
  };

  // Guides
  const saveGuideHandler=async(g,imgB64)=>{
    if(imgB64){const ok=await saveImg(g.id,imgB64);g.hasImg=ok;if(ok)setMediaCache(c=>({...c,["img-"+g.id]:imgB64}));}
    setGuides(prev=>{
      const ex=prev.some(x=>x.id===g.id);
      const next=ex?prev.map(x=>x.id===g.id?g:x):[g,...prev];
      saveGuides(next);return next;
    });
    if(g.hasImg && FB_OK && !isAdminSignedIn()) showToast("⚠ Sign in with Google so customers can see this poster","error");
    else showToast("Guide saved");
  };
  const deleteGuideHandler=async(id)=>{
    setGuides(prev=>{const next=prev.filter(g=>g.id!==id);saveGuides(next);return next;});
    await delMedia(id);
    setMediaCache(c=>{const n={...c};delete n["img-"+id];return n;});
    showToast("Guide deleted");
  };

  const saveProdHandler=async(saved,cachePatch)=>{
    setProducts(prev=>{
      const next=prev.find(p=>p.id===saved.id)?prev.map(p=>p.id===saved.id?saved:p):[...prev,saved];
      saveProd(next);
      return next;
    });
    if(cachePatch&&Object.keys(cachePatch).length)setMediaCache(c=>({...c,...cachePatch}));
    showToast("Product saved!");
  };
  const deleteProdHandler=async id=>{
    const prod=products.find(p=>p.id===id);
    setProducts(prev=>{const next=prev.filter(p=>p.id!==id);saveProd(next);return next;});
    if(prod&&Array.isArray(prod.media)){ for(const m of prod.media) await delMediaItem(m.key); }
    await delMedia(id);
    setMediaCache(c=>{const n={...c};delete n["img-"+id];delete n["vid-"+id];(prod?.media||[]).forEach(m=>delete n["m-"+m.key]);return n;});
    showToast("Product deleted");
  };
  const updateOrderHandler=async updated=>{
    const old=orders.find(o=>o.id===updated.id);
    const prevStatus=old?old.status:"";
    const pph=Number(settings.loyaltyPointsPerHundred||10);
    // ── On DELIVERY (first time): all rewards are granted HERE and nowhere else. ──
    if(updated.status==="Delivered" && prevStatus!=="Delivered"){
      // (a) buyer earns loyalty points on the amount actually paid
      if(settings.loyaltyEnabled!==false && updated.userUid && !updated.pointsEarned){
        const amt=updated.amountDue??(updated.total+updated.fee);
        const pts=Math.floor((Number(amt)||0)/100*pph);
        if(pts>0){ adminCreditLoyalty(updated.userUid, pts, "earn:"+updated.id, "Order "+(updated.orderNo||updated.id)); updated={...updated,pointsEarned:pts}; }
      }
      // (b) referrer earns their reward, credited straight to their wallet
      if(updated.referralCode){ creditReferralOnDelivery(updated.referralCode, settings, updated.id); }
    }
    // ── On CANCEL (first time): restock + claw back anything this order earned. ──
    if(updated.status==="Cancelled" && prevStatus!=="Cancelled"){
      if(!old?.restocked && !updated.restocked){ updated={...updated,restocked:true}; restock(updated); }
      // reverse the buyer's earned points (only meaningful if they were credited on a prior delivery)
      if(Number(updated.pointsEarned)>0 && updated.userUid){
        adminCreditLoyalty(updated.userUid, -Number(updated.pointsEarned), "earnrev:"+updated.id, "Order cancelled");
        updated={...updated,pointsEarned:0,pointsReversed:true};
      }
      // free the referral code used on this order (and claw back the referrer's reward if it was paid)
      if(updated.referralCode){ reverseReferralOnCancel(updated.referralCode); }
      // refund any wallet points the buyer SPENT on this order (they shouldn't lose points on a cancelled order)
      if(Number(updated.loyaltyDiscount)>0 && updated.userUid && !updated.loyaltyRefunded){
        const coinVal=Number(settings.loyaltyRedeemValue||1)||1;
        const back=Math.ceil(Number(updated.loyaltyDiscount)/coinVal);
        adminCreditLoyalty(updated.userUid, back, "redeemrefund:"+updated.id, "Points refunded (order cancelled)");
        updated={...updated,loyaltyRefunded:true};
      }
    }
    setOrders(prev=>prev.map(o=>o.id===updated.id?updated:o));
    await saveOneOrder(updated);
    // Notify the customer by email when the order moves to a new milestone (if they opted in)
    if(updated.status!==prevStatus){
      const evMap={Confirmed:"confirmed",Shipped:"shipped",Delivered:"delivered"};
      const ev=evMap[updated.status];
      if(ev) sendCustomerEmail(updated, settings, ev);
    }
  };
  const deleteOrderHandler=async order=>{
    setOrders(prev=>prev.filter(o=>o.id!==order.id));
    const r=await dbGet("nemo-orders"); const arr=r?JSON.parse(r):[]; await dbSet("nemo-orders",JSON.stringify(arr.filter(x=>x.id!==order.id)));
    // Removing the order also removes its payment screenshot (stored on the order) — frees Firebase space.
    if(FB_OK&&order.userUid){ try{ await FB_DB.ref("orders/"+order.userUid+"/"+order.id).remove(); }catch(e){} }
  };
  const cleanupOldOrders=async months=>{
    const cutoff=Date.now()-months*30*24*60*60*1000;
    const old=orders.filter(o=>(o.status==="Delivered"||o.status==="Cancelled") && new Date(o.placedAt||0).getTime()<cutoff);
    for(const o of old){ await deleteOrderHandler(o); }
    return old.length;
  };

  // Keep each product's rating/count in sync with its REAL reviews
  const recomputeProductRating=(pid, reviews)=>{
    const count=reviews.length;
    const avg=count?reviews.reduce((s,r)=>s+r.rating,0)/count:0;
    setProducts(prev=>{
      const next=prev.map(p=>p.id===pid?{...p,reviewCount:count,ratingAvg:Math.round(avg*10)/10}:p);
      saveProd(next);
      return next;
    });
  };

  const placeOrder=(o)=>{
    setCart([]);
    setOrders(prev=>[o,...prev]);
    saveOneOrder(o);
    // NOTE: loyalty points are earned ONLY when the order is delivered (see updateOrderHandler),
    // never at placement — an unpaid/cancelled order earns nothing.
    // Atomically decrement stock in the cloud (prevents overselling across devices)
    const sold={};
    o.items.forEach(it=>{sold[it.id]=(sold[it.id]||0)+it.qty;});
    if(FB_OK){
      Object.keys(sold).forEach(pid=>{
        try{
          FB_DB.ref("products/"+pid+"/stockCount").transaction(cur=>{
            const c=(typeof cur==="number")?cur:DEFAULT_STOCK;
            return Math.max(0, c - sold[pid]);
          });
        }catch(e){}
      });
    }
    setProducts(prev=>{
      const next=prev.map(p=>sold[p.id]?{...p,stockCount:Math.max(0,(p.stockCount??DEFAULT_STOCK)-sold[p.id])}:p);
      if(!FB_OK) saveProd(next);
      else dbSet("nemo-products",JSON.stringify(next)); // local cache only; cloud handled by transaction
      return next;
    });
  };

  // Customer reports a Dead-on-Arrival fish → flags the order (best-effort cloud write) and routes them to WhatsApp
  const reportDoa=async(order)=>{
    if(order.doa&&order.doa.status&&order.doa.status!=="Requested") return; // don't overwrite an in-progress/resolved request
    const updated={...order,doa:{status:"Requested",requestedAt:new Date().toISOString(),note:""}};
    setOrders(prev=>prev.map(o=>o.id===updated.id?updated:o));
    await saveOneOrder(updated);
    showToast("DOA request noted — please send your video on WhatsApp");
  };

  // Customer submits payment proof → order moves to "Payment Review"
  const submitPayment=async(order,pay)=>{
    const updated={...order,...pay,status:"Payment Review",paymentStatus:"Submitted",paidAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    setOrders(prev=>prev.map(o=>o.id===updated.id?updated:o));
    await saveOneOrder(updated);
    // Notify owner (email copy via EmailJS) + WhatsApp handled in the panel optionally
    sendOrderEmail(updated, settings.orderEmail||BUSINESS_EMAIL, settings);
    return updated;
  };

  // Restock items from a cancelled order
  const restock=(o)=>{
    const back={};
    (o.items||[]).forEach(it=>{back[it.id]=(back[it.id]||0)+it.qty;});
    if(FB_OK){ Object.keys(back).forEach(pid=>{ try{ FB_DB.ref("products/"+pid+"/stockCount").transaction(cur=>(typeof cur==="number"?cur:0)+back[pid]); }catch(e){} }); }
    setProducts(prev=>{
      const next=prev.map(p=>back[p.id]?{...p,stockCount:(p.stockCount??0)+back[p.id]}:p);
      if(!FB_OK) saveProd(next); else dbSet("nemo-products",JSON.stringify(next));
      return next;
    });
  };

  // Auto-cancel an unpaid order past its window (idempotent)
  const cancelUnpaid=async(order)=>{
    if(order.status!=="Awaiting Payment")return;
    const updated={...order,status:"Cancelled",paymentStatus:"Unpaid — auto-cancelled",updatedAt:new Date().toISOString()};
    setOrders(prev=>prev.map(o=>o.id===updated.id?updated:o));
    await saveOneOrder(updated);
    restock(order);
  };

  // Sweep for expired unpaid orders every 30s + on order changes
  useEffect(()=>{
    const sweep=()=>{
      const now=Date.now();
      orders.forEach(o=>{ if(o.status==="Awaiting Payment" && o.paymentDeadline && now>o.paymentDeadline){ cancelUnpaid(o); } });
    };
    sweep();
    const t=setInterval(sweep,30000);
    return()=>clearInterval(t);
  },[orders]);

  const cartCount=useMemo(()=>cart.reduce((s,i)=>s+i.qty,0),[cart]);
  const cartTotal=useMemo(()=>cart.reduce((s,i)=>s+i.price*i.qty,0),[cart]);
  const cartMap=useMemo(()=>{ const m={}; cart.forEach(i=>{m[i.id]=(m[i.id]||0)+i.qty;}); return m; },[cart]);
  const isAdminPage=["admin-login","admin"].includes(page);
  // Load all orders when entering admin; load the user's own orders when they sign in
  // ADMIN: live listener on ALL orders (reflects new orders + customer payments instantly)
  useEffect(()=>{
    if(page!=="admin") return;
    loadInterestCounts().then(setInterestCounts);
    if(FB_OK && FB_DB){
      const ref=FB_DB.ref("orders");
      const cb=ref.on("value",snap=>{
        const v=snap.val(); const all=[];
        if(v) Object.values(v).forEach(byUser=>{ if(byUser&&typeof byUser==="object") Object.values(byUser).forEach(o=>{ if(o&&o.id) all.push(o); }); });
        all.sort((x,y)=>(y.placedAt||"").localeCompare(x.placedAt||""));
        setOrders(all);
        try{ localStorage.setItem("nemo-orders",JSON.stringify(all)); }catch(e){}
      },err=>{ /* permission denied = not signed in as admin; fall back to one-shot */ loadOrders().then(o=>o&&setOrders(o)); });
      return ()=>ref.off("value",cb);
    } else {
      loadOrders().then(o=>o&&setOrders(o));
    }
  },[page,fbReady]);

  // CUSTOMER: live listener on THEIR orders (reflects admin status updates instantly)
  useEffect(()=>{
    if(!user || page==="admin") return;
    const uid=userKey(user);
    if(!uid) return;
    if(FB_OK && FB_DB){
      const ref=FB_DB.ref("orders/"+uid);
      const cb=ref.on("value",snap=>{
        const v=snap.val();
        const mine=v?Object.values(v).filter(o=>o&&o.id).sort((x,y)=>(y.placedAt||"").localeCompare(x.placedAt||"")):[];
        setOrders(mine);
        try{ localStorage.setItem("nemo-orders",JSON.stringify(mine)); }catch(e){}
      },err=>{ loadUserOrders(uid).then(o=>o&&setOrders(o)); });
      return ()=>ref.off("value",cb);
    } else {
      loadUserOrders(uid).then(o=>o&&setOrders(o));
    }
  },[user,page,fbReady]);

  // WALLET: load balance for the signed-in customer, sweeping in any pending
  // referral rewards + shipping refunds (idempotent). Re-runs when their orders change.
  useEffect(()=>{
    const uid=userKey(user);
    if(!uid){ setWalletPts(0); return; }
    let alive=true;
    // Make sure this customer has a referral code provisioned (one-time, idempotent).
    getMyReferralCode(uid).catch(()=>{});
    // ── Unified, live wallet: subscribe to the authoritative cloud loyalty node so any
    //    admin credit (delivery reward, referral payout, shipping refund) or the customer's
    //    own redemption reflects in the UI instantly — same source of truth for every user. ──
    if(FB_OK && FB_DB){
      const ref=FB_DB.ref("loyalty/"+uid);
      const cb=ref.on("value",s=>{
        if(!alive) return;
        const v=s&&s.val();
        const pts=(v&&Number(v.points))||0;
        try{ localStorage.setItem("nemo-lp-"+uid, JSON.stringify(v||{points:0,history:[]})); }catch(e){}
        setWalletPts(pts);
      },()=>{ /* read denied / offline → fall back to cached value */ if(alive) setWalletPts(loadLoyaltyLocal(uid).points||0); });
      return ()=>{ alive=false; try{ ref.off("value",cb); }catch(e){} };
    }
    // Offline fallback — one-shot read of the local cache.
    setWalletPts(loadLoyaltyLocal(uid).points||0);
    return ()=>{alive=false;};
  },[user,settings.loyaltyRedeemValue,settings.referralCoins,fbReady]);

  if(loading)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,gap:16,fontFamily:"'Nunito',sans-serif"}}>
      <div style={{fontSize:52}}>🐠</div>
      <Spinner/>
      <div style={{fontSize:13,color:C.textSub}}>Loading {STORE_NAME}…</div>
    </div>
  );

  return(
    <div className="nemo-app" style={{fontFamily:"'Nunito',sans-serif",background:C.bg,maxWidth:430,margin:"0 auto",position:"relative",overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <style>{STYLES}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {!isAdminPage&&<DesktopNav page={page} nav={nav} cartCount={cartCount} user={user} settings={settings} onSecretTap={handleSecretTap}/>}
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        {page==="home"     &&<HomePage nav={nav} products={products} mediaCache={mediaCache} addToCart={addToCart} cartMap={cartMap} setCategory={setCategory} onSecretTap={handleSecretTap} setQuery={setQuery} query={query} user={user} settings={settings} settingsReady={settingsReady} favorites={favorites} onFav={toggleFav} interestedSet={interestedSet} onInterest={markInterested} orders={orders} showcase={showcase} onShowcaseSubmit={handleShowcaseSubmit} restockSet={restockSet} onRestock={handleRestock} walletPts={walletPts} testimonials={testimonials} onTestimonialSubmit={handleTestimonialSubmit}/>}
        {page==="shop"     &&<ShopPage nav={nav} products={products} mediaCache={mediaCache} query={query} setQuery={setQuery} category={category} setCategory={setCategory} addToCart={addToCart} cartMap={cartMap} favorites={favorites} onFav={toggleFav} interestedSet={interestedSet} onInterest={markInterested} restockSet={restockSet} onRestock={handleRestock}/>}
        {page==="detail"   &&<DetailPage product={selProduct} media={selProduct?getProductMedia(selProduct,mediaCache):{images:[],video:null}} addToCart={addToCart} cart={cart} nav={nav} prevPage={prevPageRef.current} user={user} orders={orders} goAuth={()=>goAuth("detail")} onReviewsChanged={recomputeProductRating} onReviewed={markReviewed} autoReview={reviewIntent===selProduct?.id} isFav={selProduct?favorites.includes(selProduct.id):false} onFav={toggleFav} isInterested={selProduct?interestedSet.includes(selProduct.id):false} onInterest={markInterested} restockSet={restockSet} onRestock={handleRestock}/>}
        {page==="cart"     &&<CartPage cart={cart} updateQty={updateQty} total={cartTotal} nav={nav} settings={settings}/>}
        {page==="checkout" &&(user
          ? <CheckoutPage cart={cart} total={cartTotal} nav={nav} onOrderPlaced={placeOrder} onSubmitPayment={submitPayment} onCancelled={cancelUnpaid} user={user} settings={settings} orders={orders}/>
          : <PhoneAuth mode="checkout" settings={settings} onSuccess={(u)=>{setUser(u);if(u.keep!==false)saveUser(u);nav("checkout");}} onBack={()=>nav("cart")}/>)}
        {page==="orders"   &&(user
          ? <OrderHistoryPage user={user} orders={orders} products={products} mediaCache={mediaCache} nav={nav} onLogout={handleLogout} onWriteReview={startReview} reviewedSet={reviewedSet} onSubmitPayment={submitPayment} onCancelled={cancelUnpaid} onReportDoa={reportDoa} settings={settings} favorites={favorites}/>
          : <PhoneAuth mode="signin" settings={settings} onSuccess={(u)=>{setUser(u);setReviewedSet(loadReviewedSet(userKey(u)));if(u.keep!==false)saveUser(u);nav("home");}} onBack={()=>nav("home")}/>)}
        {page==="auth"     &&<PhoneAuth mode="signin" settings={settings} onSuccess={handleLogin} onBack={()=>nav("home")}/>}
        {page==="request"  &&<RequestPage nav={nav} user={user} onSubmit={submitRequest}/>}
        {page==="guides"   &&<CareGuidesPage nav={nav} guides={guides} mediaCache={mediaCache}/>}
        {page==="saved"    &&<SavedPage nav={nav} products={products} mediaCache={mediaCache} favorites={favorites} addToCart={addToCart} cartMap={cartMap} onFav={toggleFav} interestedSet={interestedSet} onInterest={markInterested} user={user} restockSet={restockSet} onRestock={handleRestock}/>}
        {page==="about"    &&<AboutPage nav={nav} settings={settings}/>}
        {typeof page==="string"&&page.indexOf("policy-")===0&&<PolicyPage nav={nav} settings={settings} which={page.slice(7)}/>}
        {page==="admin-login"&&<AdminLogin onSuccess={()=>nav("admin")} onBack={()=>nav("home")} settings={settings}/>}
        {page==="admin"   &&<AdminHub products={products} orders={orders} requests={requests} guides={guides} settings={settings} interestCounts={interestCounts} mediaCache={mediaCache} showToast={showToast} showcase={showcase} onDeleteShowcase={async id=>{await deleteShowcasePhoto(id);setShowcase(s=>s.filter(x=>x.id!==id));}} onApproveShowcase={handleApproveShowcase} testimonials={testimonials} onDeleteTestimonial={handleDeleteTestimonial}
          onSaveProd={saveProdHandler} onDeleteProd={deleteProdHandler} onUpdateOrder={updateOrderHandler} onDeleteOrder={deleteOrderHandler} onCleanupOrders={cleanupOldOrders} onDeleteRequest={deleteRequest} onSaveGuide={saveGuideHandler} onDeleteGuide={deleteGuideHandler} onSaveSettings={saveSettingsHandler} onReviewsChanged={recomputeProductRating} onBack={()=>nav("home")} onAdminSignIn={adminGoogleSignIn}/>}
      </div>
      {!isAdminPage&&<BottomNav page={page} nav={nav} cartCount={cartCount}/>}
    </div>
  );
}


