/**
 * Nemo Aqua Store — automatic backup + GST-ready order export (with items, DOA/returns) + product listing.
 * Runs inside nemoaquastore@gmail.com and writes to THAT account's Google Drive.
 *
 * WHAT IT DOES:
 *   DAILY (~2 AM IST): refreshes the ORDER export.
 *     - "Nemo Orders FY2026-27": one spreadsheet per Financial Year (Apr–Mar), a TAB per month.
 *        Each order = a summary row + item sub-rows (name / qty / rate). GST breakup (CGST/SGST/IGST)
 *        for ITC, plus parcel weight, delivery date, and DOA/return details in the same row.
 *        A "Products & Stock" tab (current stock, sold/returned qty, selling price) lives in the same file.
 *        (Open -> File > Download > Microsoft Excel (.xlsx) for a real Excel file.)
 *   MONTHLY (1st, ~3 AM IST): full JSON backup of the whole database
 *     -> Drive/Nemo Backups/nemo-full-backup.json  (overwrites the same file; keeps Drive small),
 *     and also refreshes the order export.
 *
 * ────────────────────────────── ONE-TIME SETUP ──────────────────────────────
 *  1. Sign in to Google as  nemoaquastore@gmail.com
 *  2. https://script.google.com -> New project. Delete the sample, paste this file, Save.
 *  3. Project Settings (gear) -> Script Properties -> Add:  SA_KEY  =  <the ENTIRE service-account JSON>
 *  4. Run  setup  once -> authorise. Installs daily + monthly schedules and runs one full export now.
 *  5. Check Drive -> "Nemo Backups".   Re-test: run  runNow.   Stop: run  removeSchedule.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ───────────────────────────── CONFIG ─────────────────────────────
var DB_URL       = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';
var FOLDER_NAME  = 'Nemo Backups';
var BACKUP_FILE  = 'nemo-full-backup.json';
var TZ           = 'Asia/Kolkata';
var NODES = ['orders','products','settings','guides','showcase','reviews','media',
             'requests','loyalty','userrefs','favorites','experienceReviews'];
var KEEP_DATED_COPIES = 2;      // extra dated JSON safety copies (0 = only the single overwriting file)
var BASE_PACK_KG = 0.5;         // base packing weight added per parcel (matches the app)
// ───────────────────────────────────────────────────────────────────

function setup() {
  removeSchedule();
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('monthlyRun').timeBased().onMonthDay(1).atHour(3).create();
  monthlyRun();
  Logger.log('Setup done. Orders refresh daily; full backup on the 1st.');
}
function runNow() { monthlyRun(); }
function removeSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'monthlyRun' || h === 'dailyRun') ScriptApp.deleteTrigger(t);
  });
}
function dailyRun() { exportSheets_(getFolder_(FOLDER_NAME), getAccessToken_()); Logger.log('Daily export refreshed.'); }
function monthlyRun() {
  var token = getAccessToken_(), data = {};
  NODES.forEach(function (n) { var v = fetchNode_(n, token); if (v !== null) data[n] = v; });
  var folder = getFolder_(FOLDER_NAME);
  writeFullBackup_(folder, data);
  exportSheets_(folder, token, data);
  Logger.log('Full backup complete: ' + Object.keys(data).join(', '));
}

function exportSheets_(folder, token, data) {
  data = data || {};
  var orders   = data.orders   != null ? data.orders   : (fetchNode_('orders', token)   || {});
  var settings = data.settings != null ? data.settings : (fetchNode_('settings', token) || {});
  var loyalty  = data.loyalty  != null ? data.loyalty  : (fetchNode_('loyalty', token)  || {});
  var products = data.products != null ? data.products : (fetchNode_('products', token) || {});
  var flat = flattenOrders_(orders);
  buildFyWorkbooks_(folder, flat, settings, loyalty, products);
}

function fetchNode_(name, token) {
  var res = UrlFetchApp.fetch(DB_URL + '/' + name + '.json?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
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

// ════════ ORDER EXPORT — 1 spreadsheet / FY, 1 tab / month, summary row + item sub-rows ════════
var OH = ['Order ID','Invoice No','Date','Customer / Item','State','Qty','Rate','Weight kg',
  'Taxable Rs','Discount Rs','Shipping Rs','CGST','SGST','IGST','GST Total','Total Rs',
  'Payment Mode','Payment Ref','Courier','Tracking','Delivered On','Delivered?','Cancelled?','Returned?',
  'Reason (customer)','Approval Reason','Resolution','Refund Rs','Wallet Balance Rs'];
var W = OH.length;
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildFyWorkbooks_(folder, orders, settings, loyalty, productsNode) {
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
      var rows = [OH];
      byFy[fy][mk].sort(function (a, b) { return new Date(a.placedAt) - new Date(b.placedAt); })
        .forEach(function (o) {
          rows.push(orderSummaryRow_(o, sellerState, defRate, wallet));
          (o.items || []).forEach(function (i) {
            var line = new Array(W).fill('');
            line[3] = '   • ' + i.name + (i.variantLabel ? ' (' + i.variantLabel + ')' : '');
            line[5] = Number(i.qty) || 0;              // Qty
            line[6] = Number(i.price) || 0;            // Rate (unit)
            line[15] = (Number(i.price) || 0) * (Number(i.qty) || 0); // line Total
            rows.push(line);
          });
        });
      sh.getRange(1, 1, rows.length, W).setValues(rows);
      sh.getRange(1, 1, 1, W).setFontWeight('bold');
      sh.setFrozenRows(1);
    });
    // Product listing lives in the SAME file as a separate tab.
    buildProductsTab_(ss, productsNode, orders);
    orderTabs_(ss);
    var def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  });
}

function orderSummaryRow_(o, sellerState, defRate, wallet) {
  var a = o.address || {};
  var grand = (o.amountDue != null) ? o.amountDue : ((o.total || 0) + (o.fee || 0));
  var qty = (o.items || []).reduce(function (s, i) { return s + (Number(i.qty) || 0); }, 0);
  var discount = (Number(o.couponDiscount) || 0) + (Number(o.referralDiscount) || 0) + (Number(o.loyaltyDiscount) || 0);

  var buyerState = String(a.stateCode || pincodeStateCode_(a.pincode) || '');
  var inter = !!(sellerState && buyerState && sellerState !== buyerState);
  var taxable = 0, tax = 0;
  (o.items || []).forEach(function (i) {
    var rate = (i.gstRate != null) ? Number(i.gstRate) : defRate;
    var gross = (Number(i.price) || 0) * (Number(i.qty) || 0);
    var tv = gross / (1 + rate / 100); taxable += tv; tax += (gross - tv);
  });
  var fee = Number(o.fee) || 0;
  if (fee > 0) { var stv = fee / (1 + defRate / 100); taxable += stv; tax += (fee - stv); }
  taxable = r2_(taxable); tax = r2_(tax);
  var cgst = inter ? 0 : r2_(tax / 2), sgst = inter ? 0 : r2_(tax - tax / 2), igst = inter ? tax : 0;

  var status = o.status || '';
  var delOn = o.deliveredAt || (status === 'Delivered' ? o.updatedAt : '') || '';
  var rr = o.returnReq || null, doa = o.doa || null;
  var returned = rr ? (['Resolved','Received & Verified','Shipped','Approved'].indexOf(rr.status) >= 0 ? 'Yes' : (rr.status || 'Requested'))
              : (doa && /^Approved/.test(doa.status || '') ? 'DOA' : '');
  var reasonCust = rr ? (rr.reason || '') : (doa ? (doa.claimReason || '') : '');
  var reasonAdmin = rr ? (rr.adminReason || '') : (doa ? (doa.adminReason || '') : '');
  var resolution = rr ? (rr.adminResolution || rr.resolution || '') : (doa ? (doa.resolution || doa.status || '') : '');
  var refund = rr ? (rr.refundAmount != null ? rr.refundAmount : '') : (doa ? (doa.refundAmount != null ? doa.refundAmount : '') : '');

  var row = new Array(W).fill('');
  row[0] = o._id; row[1] = o.orderNo || o._id; row[2] = fmt_(o.placedAt);
  row[3] = a.name || ''; row[4] = stateName_(buyerState) || a.state || '';
  row[5] = qty; row[6] = ''; row[7] = parcelWeight_(o);
  row[8] = taxable; row[9] = discount; row[10] = fee; row[11] = cgst; row[12] = sgst; row[13] = igst; row[14] = r2_(tax); row[15] = grand;
  row[16] = o.paymentMethod || (o.txnId ? 'Online' : ''); row[17] = o.txnId || '';
  row[18] = o.courierName || ''; row[19] = o.trackingNumber || ''; row[20] = delOn ? fmt_(delOn) : '';
  row[21] = (status === 'Delivered' ? 'Yes' : ''); row[22] = (status === 'Cancelled' ? 'Yes' : ''); row[23] = returned;
  row[24] = reasonCust; row[25] = reasonAdmin; row[26] = resolution; row[27] = refund;
  row[28] = (o.userUid && wallet[o.userUid] != null) ? wallet[o.userUid] : 0;
  return row;
}

// Parcel weight ≈ Σ(item packing weight × qty) + base packing (matches the app's estimate).
function parcelWeight_(o) {
  var w = 0;
  (o.items || []).forEach(function (i) {
    var pw = (i.variantPackagingWeight != null ? i.variantPackagingWeight : i.packagingWeight);
    if (pw == null) pw = (i.category === 'Live Fish') ? 0.2 : 0.1;
    w += (Number(pw) || 0) * (Number(i.qty) || 0);
  });
  return r2_(w + BASE_PACK_KG);
}

// ════════ PRODUCTS & STOCK tab (same spreadsheet; no vendor/purchase fields) ════════
var PH = ['Product', 'Category', 'Current Stock', 'Sold Qty', 'Returned Qty', 'Selling Price Rs'];
function buildProductsTab_(ss, productsNode, orders) {
  var products = [];
  for (var id in productsNode) { var p = productsNode[id]; if (p && typeof p === 'object') { p._id = id; products.push(p); } }
  var sold = {}, returned = {};
  orders.forEach(function (o) {
    var delivered = o.status === 'Delivered';
    (o.items || []).forEach(function (i) { if (delivered) sold[i.id] = (sold[i.id] || 0) + (Number(i.qty) || 0); });
    var rr = o.returnReq;
    if (rr && (rr.itemIds || []).length && ['Resolved', 'Received & Verified'].indexOf(rr.status) >= 0) {
      (rr.itemIds || []).forEach(function (pid) {
        var it = (o.items || []).filter(function (x) { return x.id === pid; })[0];
        if (it) returned[pid] = (returned[pid] || 0) + (Number(it.qty) || 0);
      });
    }
  });
  var sh = ss.getSheetByName('Products & Stock') || ss.insertSheet('Products & Stock');
  sh.clear();
  var rows = [PH].concat(products.sort(function (a, b) { return (a.category || '').localeCompare(b.category || ''); }).map(function (p) {
    return [p.name || '', p.category || '', (p.stockCount != null ? p.stockCount : ''), sold[p._id] || 0, returned[p._id] || 0, (p.price != null ? p.price : '')];
  }));
  sh.getRange(1, 1, rows.length, PH.length).setValues(rows);
  sh.getRange(1, 1, 1, PH.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

// ───────────────────────────── helpers ─────────────────────────────
function walletBalances_(loyalty, coinVal) {
  var out = {};
  for (var uid in loyalty) { var L = loyalty[uid]; if (L && typeof L === 'object') out[uid] = r2_((Number(L.points) || 0) * coinVal); }
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
  var pt = ss.getSheetByName('Products & Stock'); if (pt) { ss.setActiveSheet(pt); ss.moveActiveSheet(ss.getSheets().length); }
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
function getAccessToken_() {
  var raw = PropertiesService.getScriptProperties().getProperty('SA_KEY');
  if (!raw) throw new Error('Add the service-account JSON to Script Properties as SA_KEY.');
  var sa = JSON.parse(raw), tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  var now = Math.floor(Date.now() / 1000);
  var claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: tokenUri, iat: now, exp: now + 3600 };
  var toSign = b64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url_(JSON.stringify(claim));
  var jwt = toSign + '.' + b64url_(Utilities.computeRsaSha256Signature(toSign, sa.private_key));
  var res = UrlFetchApp.fetch(tokenUri, { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }, muteHttpExceptions: true });
  var body = JSON.parse(res.getContentText());
  if (!body.access_token) throw new Error('Auth failed: ' + res.getContentText());
  return body.access_token;
}
function b64url_(v) { return Utilities.base64EncodeWebSafe(v).replace(/=+$/, ''); }
