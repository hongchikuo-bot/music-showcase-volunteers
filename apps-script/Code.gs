/**
 * ============================================================================
 *  Music Showcase · 志工認領 — Google Sheet 後端
 *  Music Showcase Volunteer Board — Google Sheets backend
 * ============================================================================
 *
 *  這個檔案的用途：把 Google Sheet 當成資料庫，讓所有志工看到的認領狀態即時同步。
 *  部署步驟請看同資料夾的 README.md「雲端同步」段落。
 *
 *  API 契約（前端 index.html 會呼叫這些）：
 *    GET  ?action=list                        → { ok:true, needs:[...] }
 *    POST { action:'claim',      id, person } → { ok:true, need, needs }
 *    POST { action:'unclaim',    id, index  } → { ok:true, need, needs }
 *    POST { action:'add',        need       } → { ok:true, need, needs }
 *    POST { action:'replaceAll', needs      } → { ok:true, needs }
 *    POST { action:'init',       needs      } → 只在表為空時寫入種子資料
 *
 *  錯誤會以 { ok:false, error:'...' } 回傳，前端認得 'full' 與 'duplicate' 兩種。
 */

var SHEET_NAME = 'needs';

var HEADERS = [
  'id', 'cat',
  'title_zh', 'title_en',
  'desc_zh', 'desc_en',
  'skills_zh', 'skills_en',
  'date', 'time',
  'place_zh', 'place_en',
  'slots', 'contact', 'claimants'
];

var COL = {
  id: 1, cat: 2, titleZh: 3, titleEn: 4, descZh: 5, descEn: 6,
  skillsZh: 7, skillsEn: 8, date: 9, time: 10, placeZh: 11, placeEn: 12,
  slots: 13, contact: 14, claimants: 15
};

/* ---------------------------------------------------------------- helpers */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f6efe3');
    sh.setFrozenRows(1);
    sh.setColumnWidth(COL.claimants, 320);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function str_(v) { return (v === null || v === undefined) ? '' : String(v); }

function parseClaimants_(raw) {
  try {
    var a = JSON.parse(str_(raw) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function rowToNeed_(r) {
  return {
    id:        str_(r[COL.id - 1]),
    cat:       str_(r[COL.cat - 1]),
    title:   { zh: str_(r[COL.titleZh - 1]), en: str_(r[COL.titleEn - 1]) },
    desc:    { zh: str_(r[COL.descZh  - 1]), en: str_(r[COL.descEn  - 1]) },
    skills:  { zh: str_(r[COL.skillsZh - 1]), en: str_(r[COL.skillsEn - 1]) },
    date:      str_(r[COL.date - 1]),
    time:      str_(r[COL.time - 1]),
    place:   { zh: str_(r[COL.placeZh - 1]), en: str_(r[COL.placeEn - 1]) },
    slots:     Number(r[COL.slots - 1]) || 1,
    contact:   str_(r[COL.contact - 1]),
    claimants: parseClaimants_(r[COL.claimants - 1])
  };
}

function needToRow_(n) {
  var t = n.title || {}, d = n.desc || {}, s = n.skills || {}, p = n.place || {};
  return [
    str_(n.id), str_(n.cat),
    str_(t.zh), str_(t.en),
    str_(d.zh), str_(d.en),
    str_(s.zh), str_(s.en),
    str_(n.date), str_(n.time),
    str_(p.zh), str_(p.en),
    Number(n.slots) || 1, str_(n.contact),
    JSON.stringify(n.claimants || [])
  ];
}

function readAll_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (str_(values[i][0]).trim() === '') continue;
    out.push(rowToNeed_(values[i]));
  }
  return out;
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, COL.id, last - 1, 1).getValues();
  var want = str_(id);
  for (var i = 0; i < ids.length; i++) {
    if (str_(ids[i][0]) === want) return i + 2;
  }
  return -1;
}

/* ------------------------------------------------------------------ doGet */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'list' || action === 'ping') {
      return json_({ ok: true, needs: readAll_() });
    }
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ----------------------------------------------------------------- doPost */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 避免兩位志工同時按下認領造成搶號 / prevents a race between two claims
    lock.waitLock(20000);

    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action;
    var sh = getSheet_();

    if (action === 'claim')    return json_(handleClaim_(sh, body));
    if (action === 'unclaim')  return json_(handleUnclaim_(sh, body));
    if (action === 'add')      return json_(handleAdd_(sh, body));
    if (action === 'replaceAll') return json_(handleReplaceAll_(sh, body));
    if (action === 'init')     return json_(handleInit_(sh, body));

    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------------------------------------------------------- actions */

function handleClaim_(sh, body) {
  var p = body.person || {};
  var name = str_(p.name).trim();
  var contact = str_(p.contact).trim();
  if (!name || !contact) return { ok: false, error: 'missing name/contact' };

  var row = findRow_(sh, body.id);
  if (row === -1) return { ok: false, error: 'task not found' };

  var n = rowToNeed_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  n.claimants = n.claimants || [];

  if (n.claimants.length >= n.slots) return { ok: false, error: 'full' };
  for (var i = 0; i < n.claimants.length; i++) {
    if (str_(n.claimants[i].name).toLowerCase() === name.toLowerCase()) {
      return { ok: false, error: 'duplicate' };
    }
  }

  n.claimants.push({
    name: name,
    contact: contact,
    avail: str_(p.avail),
    note: str_(p.note),
    at: new Date().toISOString()
  });

  sh.getRange(row, COL.claimants).setValue(JSON.stringify(n.claimants));
  return { ok: true, need: n, needs: readAll_() };
}

function handleUnclaim_(sh, body) {
  var row = findRow_(sh, body.id);
  if (row === -1) return { ok: false, error: 'task not found' };

  var n = rowToNeed_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  n.claimants = n.claimants || [];

  var idx = Number(body.index);
  if (body.name) {
    for (var i = 0; i < n.claimants.length; i++) {
      if (str_(n.claimants[i].name).toLowerCase() === str_(body.name).toLowerCase()) { idx = i; break; }
    }
  }
  if (!(idx >= 0) || idx >= n.claimants.length) return { ok: false, error: 'claimant not found' };

  n.claimants.splice(idx, 1);
  sh.getRange(row, COL.claimants).setValue(JSON.stringify(n.claimants));
  return { ok: true, need: n, needs: readAll_() };
}

function handleAdd_(sh, body) {
  var n = body.need || {};
  if (!n.id) n.id = 'n' + new Date().getTime().toString(36);
  if (findRow_(sh, n.id) !== -1) return { ok: false, error: 'id already exists' };
  sh.appendRow(needToRow_(n));
  return { ok: true, need: n, needs: readAll_() };
}

function handleReplaceAll_(sh, body) {
  var list = body.needs;
  if (!Array.isArray(list)) return { ok: false, error: 'needs must be an array' };

  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();

  if (list.length) {
    var rows = list.map(needToRow_);
    sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
  return { ok: true, needs: readAll_() };
}

function handleInit_(sh, body) {
  var existing = readAll_();
  if (existing.length) return { ok: true, needs: existing, skipped: true };
  return handleReplaceAll_(sh, body);
}

/* --------------------------------------------------------------- utilities */

/** 在 Apps Script 編輯器手動執行這個，可以把目前這張表清空重來 */
function RESET_SHEET() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  Logger.log('已清空 ' + SHEET_NAME + ' 工作表');
}

/** 手動執行這個可以看目前有幾筆需求、幾筆認領 */
function SHOW_STATUS() {
  var all = readAll_();
  var filled = 0, slots = 0;
  all.forEach(function (n) {
    slots += n.slots;
    filled += (n.claimants || []).length;
  });
  Logger.log('需求 ' + all.length + ' 筆 / 人力 ' + filled + ' of ' + slots + ' 已認領');
}
