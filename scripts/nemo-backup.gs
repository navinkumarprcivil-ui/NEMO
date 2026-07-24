/**
 * Nemo Aqua Store — automatic backup + GST-ready order export + inventory export.
 * Runs inside nemoaquastore@gmail.com and writes to THAT account's Google Drive.
 *
 * WHAT IT DOES:
 *   DAILY (~2 AM IST): refreshes the ORDER export + INVENTORY export.
 *     - "Nemo Orders FY2026-27": one spreadsheet per Financial Year (Apr–Mar),
 *        a TAB per month, with full GST breakup (CGST/SGST/IGST) for ITC filing.
 *     - "Nemo Inventory": current stock, sold/returned qty, prices (one sheet).
 *     (Open a sheet -> File > Download > Microsoft Excel (.xlsx) for a real Excel file.)
 *   MONTHLY (1st, ~3 AM IST): full JSON backup of the whole database
 *     -> Drive/Nemo Backups/nemo-full-backup.json  (overwrites the same file; keeps Drive small),
 *     and also refreshes the order + inventory exports.
 *
 * ────────────────────────────── ONE-TIME SETUP ──────────────────────────────
 *  1. Sign in to Google as  nemoaquastore@gmail.com
 *  2. https://script.google.com  ->  New project. Delete the sample, paste this file, Save.
 *  3. Project Settings (gear) -> Script Properties -> Add:
 *          Property:  SA_KEY
 *          Value:     <paste the ENTIRE service-account JSON>
 *  4. Run  setup  once -> authorise (Drive + external requests).
 *     Installs the daily + monthly schedules AND runs one full export now.
 *  5. Check Drive -> "Nemo Backups".
 *
 *  Re-test any time: run  runNow.   Stop it: run  removeSchedule.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ───────────────────────────── CONFIG ─────────────────────────────
var DB_URL       = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';
var FOLDER_NAME  = 'Nemo Backups';
var BACKUP_FILE  = 'nemo-full-backup.json';
var TZ           = 'Asia/Kolkata';
var NODES = ['orders','products','settings','guides','showcase','reviews','media',
             'requests','loyalty','userrefs','favorites','experienceReviews'];
var KEEP_DATED_COPIES = 2;   // extra dated JSON safety copies (0 = only the single overwriting file)
// ───────────────────────────────────────────────────────────────────

function setup() {
  removeSchedule();
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('monthlyRun').timeBased().onMonthDay(1).atHour(3).create();
  monthlyRun();
  Logger.log('Setup done. Orders+inventory refresh daily; full backup on the 1st.');
}
function runNow() { monthlyRun(); }
function removeSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'monthlyRun' || h === 'dailyRun') ScriptApp.deleteTrigger(t);
  });
}

/** DAILY — refresh order + inventory exports only. */
function dailyRun() {
  var token = getAccessToken_();
  exportSheets_(getFolder_(FOLDER_NAME), token);
  Logger.log('Daily export refreshed.');
}

/** MONTHLY — full DB backup + exports. */
function monthlyRun() {
  var token = getAccessToken_();
  var data = {};
  NODES.forEach(function (n) { var v = fetchNode_(n, token); if (v !== null) data[n] = v; });
  var folder = getFolder_(FOLDER_NAME);
  writeFullBackup_(folder, data);
  exportSheets_(folder, token, data);   // reuse the data we already fetched
  Logger.log('Full backup complete: ' + Object.keys(data).join(', '));
}

/** Fetch the pieces the exports need, then build the sheets. */
function exportSheets_(folder, token, data) {
  data = data || {};
  var orders   = data.orders   != null ? data.orders   : (fetchNode_('orders', token)   || {});
  var settings = data.settings != null ? data.settings : (fetchNode_('settings', token) || {});
  var loyalty  = data.loyalty  != null ? data.loyalty  : (fetchNode_('loyalty', token)  || {});
  var products = data.products != null ? data.products : (fetchNode_('products', token) || {});
  var flatOrders = flattenOrders_(orders);
  buildFyWorkbooks_(folder, flatOrders, settings, loyalty);
  buildInventorySheet_(folder, products, flatOrders);
}

function fetchNode_(name, token) {
  var res = UrlFetchApp.fetch(DB_URL + '/' + name + '.json?access_token=' + encodeURIComponent(token),
                              { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var t = res.getContentText();
  if (!t || t === 'null') return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// ───────────────── Full JSON backup (single overwriting file) ─────────────────
function writeFullBackup_(folder, data) {
  var json = JSON.stringify(data, null, 2);
  var it = folder.getFilesByName(BACKUP_FILE);
  if (it.hasNext()) it.next().setContent(json); else folder.createFile(BACKUP_FILE, json, MimeType.PLAIN_TEXT);
  if (KEEP_DATED_COPIES > 0) {
    var name = 'nemo-backup-' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.json';
    var dup = folder.getFilesByName(name);
    if (dup.hasNext()) dup.next().setContent(json); else folder.createFile(name, json, MimeType.PLAIN_TEXT);
    pruneDated_(folder, KEEP_DATED_COPIES);
  }
}
function pruneDated_(folder, keep) {
  var files = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (/^nemo-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) files.push(f); }
  files.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  for (var i = keep; i < files.length; i++) files[i].setTrashed(true);
}

// ═════════════ ORDER EXPORT (GST-ready) — 1 spreadsheet / FY, 1 tab / month ═════════════
var ORDER_HEADERS = ['Order ID','Invoice No','Date','Customer','State','Items','Qty',
  'Taxable Rs','Discount Rs','Shipping Rs','CGST','SGST','IGST','GST Total','Total Rs',
  'Payment Mode','Payment Ref','Courier','Tracking','Delivered?','Cancelled?','Returned?',
  'Return Reason','Wallet Balance Rs'];
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildFyWorkbooks_(folder, orders, settings, loyalty) {
  var sellerState = String((settings.gstin || '').slice(0, 2) || '33');
  var defRate = (settings.gstRate != null) ? Number(settings.gstRate) : 18;
  var coinVal = Number(settings.loyaltyRedeemValue || 1) || 1;
  var wallet = walletBalances_(loyalty, coinVal);

  var byFy = {};
  orders.forEach(function (o) {
    var d = new Date(o.placedAt || o.updatedAt || Date.now()); if (isNaN(d)) d = new Date();
    var fy = fyLabel_(d), mk = Utilities.formatDate(d, TZ, 'yyyy-MM');
    if (!byFy[fy]) byFy[fy] = {};
    if (!byFy[fy][mk]) byFy[fy][mk] = [];
    byFy[fy][mk].push(o);
  });

  Object.keys(byFy).forEach(function (fy) {
    var ss = getOrCreateSheet_(folder, 'Nemo Orders FY' + fy);
    Object.keys(byFy[fy]).sort().forEach(function (mk) {
      var tab = MON[parseInt(mk.split('-')[1], 10) - 1] + ' ' + mk.split('-')[0];
      var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
      sh.clear();
      var rows = byFy[fy][mk]
        .sort(function (a, b) { return new Date(a.placedAt) - new Date(b.placedAt); })
        .map(function (o) { return orderRow_(o, sellerState, defRate, wallet); });
      sh.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]).setFontWeight('bold');
      if (rows.length) sh.getRange(2, 1, rows.length, ORDER_HEADERS.length).setValues(rows);
      sh.setFrozenRows(1);
    });
    orderTabs_(ss);
    var def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  });
}

function orderRow_(o, sellerState, defRate, wallet) {
  var a = o.address || {};
  var grand = (o.amountDue != null) ? o.amountDue : ((o.total || 0) + (o.fee || 0));
  var qty = (o.items || []).reduce(function (s, i) { return s + (Number(i.qty) || 0); }, 0);
  var items = (o.items || []).map(function (i) {
    return i.name + (i.variantLabel ? ' (' + i.variantLabel + ')' : '') + ' x' + i.qty + ' = Rs.' + (i.price * i.qty);
  }).join(' | ');
  var discount = (Number(o.couponDiscount) || 0) + (Number(o.referralDiscount) || 0) + (Number(o.loyaltyDiscount) || 0);

  // ── GST (prices are GST-inclusive, same rule as the invoice): taxable + tax on items + shipping ──
  var buyerState = String(a.stateCode || pincodeStateCode_(a.pincode) || '');
  var inter = !!(sellerState && buyerState && sellerState !== buyerState);
  var taxable = 0, tax = 0;
  (o.items || []).forEach(function (i) {
    var rate = (i.gstRate != null) ? Number(i.gstRate) : defRate;
    var gross = (Number(i.price) || 0) * (Number(i.qty) || 0);
    var tv = gross / (1 + rate / 100);
    taxable += tv; tax += (gross - tv);
  });
  var fee = Number(o.fee) || 0;
  if (fee > 0) { var stv = fee / (1 + defRate / 100); taxable += stv; tax += (fee - stv); }
  taxable = r2_(taxable); tax = r2_(tax);
  var cgst = inter ? 0 : r2_(tax / 2), sgst = inter ? 0 : r2_(tax - tax / 2), igst = inter ? tax : 0;

  var status = o.status || '';
  var rr = o.returnReq || null;
  var returned = rr ? (['Resolved','Received & Verified','Shipped','Approved'].indexOf(rr.status) >= 0 ? 'Yes' : rr.status || 'Requested') : '';
  var returnReason = rr ? (rr.reason || rr.note || '') : (o.doa ? ('DOA: ' + (o.doa.status || '')) : '');

  return [ o._id, o.orderNo || o._id, fmt_(o.placedAt),
    a.name || '', stateName_(buyerState) || a.state || '', items, qty,
    taxable, discount, fee, cgst, sgst, igst, r2_(tax), grand,
    (o.paymentMethod || (o.txnId ? 'Online' : '')) , o.txnId || '',
    o.courierName || '', o.trackingNumber || '',
    (status === 'Delivered' ? 'Yes' : ''), (status === 'Cancelled' ? 'Yes' : ''), returned,
    returnReason, (o.userUid && wallet[o.userUid] != null) ? wallet[o.userUid] : 0 ];
}

// ═════════════ INVENTORY EXPORT ═════════════
// Columns marked (app) don't exist in the app yet — they stay blank until we add them; you can
// also fill them by hand. Category / Current Stock / Selling Price / Sold / Returned are automatic.
var INV_HEADERS = ['Product','SKU (app)','Barcode (app)','Category','Brand (app)','Supplier (app)',
  'Opening Stock (app)','Purchased Qty (app)','Sold Qty','Returned Qty','Damaged Qty (app)',
  'Current Stock','Reorder Level (app)','Purchase Price (app)','Selling Price'];

function buildInventorySheet_(folder, productsNode, orders) {
  var products = [];
  for (var id in productsNode) { var p = productsNode[id]; if (p && typeof p === 'object') { p._id = id; products.push(p); } }

  var sold = {}, returned = {};
  orders.forEach(function (o) {
    var delivered = o.status === 'Delivered';
    (o.items || []).forEach(function (i) { if (delivered) sold[i.id] = (sold[i.id] || 0) + (Number(i.qty) || 0); });
    var rr = o.returnReq;
    if (rr && (rr.itemIds || []).length && ['Resolved','Received & Verified'].indexOf(rr.status) >= 0) {
      (rr.itemIds || []).forEach(function (pid) {
        var it = (o.items || []).filter(function (x) { return x.id === pid; })[0];
        if (it) returned[pid] = (returned[pid] || 0) + (Number(it.qty) || 0);
      });
    }
  });

  var ss = getOrCreateSheet_(folder, 'Nemo Inventory');
  var sh = ss.getSheetByName('Inventory') || ss.getSheets()[0];
  sh.setName('Inventory'); sh.clear();
  var rows = products.sort(function (a, b) { return (a.category || '').localeCompare(b.category || ''); }).map(function (p) {
    return [ p.name || '', p.sku || '', p.barcode || '', p.category || '', p.brand || '', p.supplier || '',
      (p.openingStock != null ? p.openingStock : ''), (p.purchasedQty != null ? p.purchasedQty : ''),
      sold[p._id] || 0, returned[p._id] || 0, (p.damagedQty != null ? p.damagedQty : ''),
      (p.stockCount != null ? p.stockCount : ''), (p.reorderLevel != null ? p.reorderLevel : ''),
      (p.purchasePrice != null ? p.purchasePrice : ''), (p.price != null ? p.price : '') ];
  });
  sh.getRange(1, 1, 1, INV_HEADERS.length).setValues([INV_HEADERS]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, INV_HEADERS.length).setValues(rows);
  sh.setFrozenRows(1);
}

// ───────────────────────────── helpers ─────────────────────────────
function walletBalances_(loyalty, coinVal) {
  var out = {};
  for (var uid in loyalty) {
    var L = loyalty[uid];
    if (L && typeof L === 'object') out[uid] = r2_((Number(L.points) || 0) * coinVal);
  }
  return out;
}

function flattenOrders_(node) {
  var out = [];
  for (var k in node) {
    var v = node[k];
    if (!v || typeof v !== 'object') continue;
    if (v.items || v.placedAt || v.status) { v._id = v.orderNo || k; out.push(v); }
    else { for (var oid in v) { var o = v[oid]; if (o && typeof o === 'object') { o._id = o.orderNo || oid; out.push(o); } } }
  }
  return out;
}

function fyLabel_(d) { var y = d.getFullYear(), m = d.getMonth(); var s = (m >= 3) ? y : y - 1; return s + '-' + ('0' + ((s + 1) % 100)).slice(-2); }
function orderTabs_(ss) {
  var fyOrder = [3,4,5,6,7,8,9,10,11,0,1,2], sheets = ss.getSheets().slice(), pos = 1;
  fyOrder.forEach(function (mIdx) {
    var label = MON[mIdx] + ' ';
    sheets.forEach(function (sh) { if (sh.getName().indexOf(label) === 0) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); } });
  });
}
function fmt_(v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function getFolder_(name) { var it = DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : DriveApp.createFolder(name); }
function getOrCreateSheet_(folder, name) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss;
}

// GST state name + pincode fallback (buyer state usually comes straight off the order now).
var GST_STATES = {'01':'JAMMU & KASHMIR','02':'HIMACHAL PRADESH','03':'PUNJAB','04':'CHANDIGARH','05':'UTTARAKHAND','06':'HARYANA','07':'DELHI','08':'RAJASTHAN','09':'UTTAR PRADESH','10':'BIHAR','11':'SIKKIM','12':'ARUNACHAL PRADESH','13':'NAGALAND','14':'MANIPUR','15':'MIZORAM','16':'TRIPURA','17':'MEGHALAYA','18':'ASSAM','19':'WEST BENGAL','20':'JHARKHAND','21':'ODISHA','22':'CHHATTISGARH','23':'MADHYA PRADESH','24':'GUJARAT','26':'DADRA & NAGAR HAVELI AND DAMAN & DIU','27':'MAHARASHTRA','29':'KARNATAKA','30':'GOA','31':'LAKSHADWEEP','32':'KERALA','33':'TAMIL NADU','34':'PUDUCHERRY','35':'ANDAMAN & NICOBAR','36':'TELANGANA','37':'ANDHRA PRADESH','38':'LADAKH'};
function stateName_(code) { return GST_STATES[code] || ''; }
function pincodeStateCode_(pin) {
  var p = parseInt(String(pin || '').replace(/\D/g, ''), 10);
  if (!p || isNaN(p) || p < 100000 || p > 999999) return '';
  var pre = Math.floor(p / 1000), c = '';
  if ((p>=605001&&p<=605014)||(p>=609602&&p<=609609)||p===533464||p===673310||p===673311) c='34';
  else if (pre===160) c='04'; else if (pre===403) c='30'; else if (pre===737) c='11';
  else if (pre===682) c='32'; else if (pre===795) c='14'; else if (pre===796) c='15';
  else if (pre===799) c='16'; else if (pre===194) c='38'; else if (pre===110) c='07';
  else if (pre>=121&&pre<=136) c='06'; else if (pre>=140&&pre<=160) c='03';
  else if (pre>=171&&pre<=177) c='02'; else if (pre>=180&&pre<=193) c='01';
  else if (pre>=246&&pre<=263) c='05'; else if (pre>=201&&pre<=285) c='09';
  else if (pre>=301&&pre<=345) c='08'; else if (pre>=360&&pre<=396) c='24';
  else if (pre>=400&&pre<=445) c='27'; else if (pre>=450&&pre<=488) c='23';
  else if (pre>=490&&pre<=497) c='22'; else if (pre>=500&&pre<=509) c='36';
  else if (pre>=510&&pre<=539) c='37'; else if (pre>=560&&pre<=591) c='29';
  else if (pre>=600&&pre<=643) c='33'; else if (pre>=670&&pre<=695) c='32';
  else if (pre>=700&&pre<=743) c='19'; else if (pre>=750&&pre<=770) c='21';
  else if (pre>=781&&pre<=788) c='18'; else if (pre>=790&&pre<=792) c='12';
  else if (pre>=793&&pre<=794) c='17'; else if (pre>=797&&pre<=798) c='13';
  else if (pre>=800&&pre<=813) c='10'; else if (pre>=814&&pre<=835) c='20';
  else if (pre>=836&&pre<=855) c='10';
  return c;
}

/** Mint a short-lived OAuth token from the service account (read Firebase via REST). */
function getAccessToken_() {
  var raw = PropertiesService.getScriptProperties().getProperty('SA_KEY');
  if (!raw) throw new Error('Add the service-account JSON to Script Properties as SA_KEY.');
  var sa = JSON.parse(raw);
  var tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  var now = Math.floor(Date.now() / 1000);
  var claim = { iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: tokenUri, iat: now, exp: now + 3600 };
  var toSign = b64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url_(JSON.stringify(claim));
  var jwt = toSign + '.' + b64url_(Utilities.computeRsaSha256Signature(toSign, sa.private_key));
  var res = UrlFetchApp.fetch(tokenUri, { method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }, muteHttpExceptions: true });
  var body = JSON.parse(res.getContentText());
  if (!body.access_token) throw new Error('Auth failed: ' + res.getContentText());
  return body.access_token;
}
function b64url_(v) { return Utilities.base64EncodeWebSafe(v).replace(/=+$/, ''); }
