// BPMC server (Google Apps Script) — PLAN.md §1, §2.4.
// Asli hisab yahin hota hai; phone sirf entry karta hai. Formule BPMCCore (packages/core) se.
// Firestore REST ko owner ke account se likhta hai, isliye `days/` jaise collection sirf yahi likh sakta hai.

var ENTRY_STATUS_PENDING = 'PENDING';

// ---------------- config ----------------
function fsProject_() {
  // Live wale script mein Script property FIREBASE_PROJECT_ID = bpmc-site-live
  return PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID') || 'bpmc-site-test';
}
function fsRoot_() {
  return 'projects/' + fsProject_() + '/databases/(default)/documents';
}
function fsUrl_(suffix) {
  return 'https://firestore.googleapis.com/v1/' + fsRoot_() + suffix;
}
function fsCall_(method, suffix, body) {
  var res = UrlFetchApp.fetch(fsUrl_(suffix), {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404) return null;
  if (code >= 300) throw new Error('Firestore ' + method + ' ' + suffix + ' → ' + code + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

// ---------------- Firestore value ⇄ JS ----------------
function enc_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc_) } };
  var fields = {};
  Object.keys(v).forEach(function (k) { fields[k] = enc_(v[k]); });
  return { mapValue: { fields: fields } };
}
function encFields_(obj) {
  var f = {};
  Object.keys(obj).forEach(function (k) { f[k] = enc_(obj[k]); });
  return f;
}
function dec_(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec_);
  if ('mapValue' in v) return decFields_(v.mapValue.fields || {});
  return null;
}
function decFields_(fields) {
  var o = {};
  Object.keys(fields || {}).forEach(function (k) { o[k] = dec_(fields[k]); });
  return o;
}
function docOf_(raw) {
  var parts = raw.name.split('/');
  return { id: parts[parts.length - 1], name: raw.name, updateTime: raw.updateTime, data: decFields_(raw.fields) };
}

// ---------------- read / write helpers ----------------
function getDoc_(path) {
  var raw = fsCall_('get', '/' + path);
  return raw ? docOf_(raw) : null;
}
/** Top-level collection ke saare document */
function listDocs_(col) {
  var out = [];
  var token = '';
  do {
    var r = fsCall_('get', '/' + col + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    (r && r.documents || []).forEach(function (d) { out.push(docOf_(d)); });
    token = r && r.nextPageToken;
  } while (token);
  return out;
}
/** parent (jaise "projects/KSK") ke andar collection, optional ek barabari wala filter */
function query_(parent, col, field, value) {
  var sq = { from: [{ collectionId: col }] };
  if (field) sq.where = { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc_(value) } };
  var r = fsCall_('post', '/' + parent + ':runQuery', { structuredQuery: sq }) || [];
  return r.filter(function (x) { return x.document; }).map(function (x) { return docOf_(x.document); });
}
/** Sab ya kuch nahi (atomic), 500 tak */
function commit_(writes) {
  for (var i = 0; i < writes.length; i += 450) {
    fsCall_('post', ':commit', { writes: writes.slice(i, i + 450) });
  }
}
/** Har write alag — ek fail ho to baaki chalte rahein (status DONE ke liye) */
function batchWrite_(writes) {
  var failed = 0;
  for (var i = 0; i < writes.length; i += 450) {
    var r = fsCall_('post', ':batchWrite', { writes: writes.slice(i, i + 450) });
    (r.status || []).forEach(function (s) { if (s.code) failed++; });
  }
  return failed;
}
function fullName_(path) {
  return fsRoot_() + '/' + path;
}

// ---------------- hisab loop (har 5 min) ----------------
/**
 * Har project ke PENDING stock movement uthao → sabse purani badli tarikh se aaj tak
 * opening / aaya / kharch / closing dobara (BPMCCore.buildStockLedger) → days/{date}.stock likho
 * → entry par serverStatus = DONE (sirf agar beech mein phone ne dobara na badla ho).
 */
function runHisab() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  var started = new Date();
  var log = { projects: {}, error: null };
  try {
    var today = BPMCCore.toBusinessDateIST(started);
    var materialIds = listDocs_('masters_materials')
      .filter(function (m) { return !m.data.deleted; })
      .map(function (m) { return m.id; });

    listDocs_('projects').forEach(function (p) {
      var parent = 'projects/' + p.id;
      var pending = query_(parent, 'stockMoves', 'serverStatus', ENTRY_STATUS_PENDING);
      if (!pending.length) return;

      // Kahan se dobara: sabse purani PENDING tarikh, khula edit-window (D−2), aur Admin ke khole din
      var from = BPMCCore.addDays(today, -BPMCCore.EDIT_WINDOW_DAYS);
      pending.forEach(function (d) { if (d.data.businessDate && d.data.businessDate < from) from = d.data.businessDate; });
      query_(parent, 'unlocks').forEach(function (u) {
        if (u.data.expiresAt && u.data.expiresAt > started && u.id < from) from = u.id;
      });

      var all = query_(parent, 'stockMoves');
      var moves = all
        .filter(function (d) { return d.data.businessDate && d.data.itemId && d.data.type; })
        .map(function (d) {
          return { id: d.id, itemId: d.data.itemId, businessDate: d.data.businessDate, type: d.data.type, qty: Number(d.data.qty) || 0, deleted: !!d.data.deleted };
        });
      var items = materialIds.slice();
      moves.forEach(function (m) { if (items.indexOf(m.itemId) < 0) items.push(m.itemId); });
      items.sort();

      var ledger = BPMCCore.buildStockLedger(moves, from, today, items);
      commit_(ledger.map(function (day) {
        return {
          update: { name: fullName_(parent + '/days/' + day.date), fields: { stock: enc_(day.items), date: enc_(day.date) } },
          updateMask: { fieldPaths: ['stock', 'date'] },
          updateTransforms: [{ fieldPath: 'stockComputedAt', setToServerValue: 'REQUEST_TIME' }],
        };
      }));

      var failed = batchWrite_(pending.map(function (d) {
        return {
          update: { name: d.name, fields: { serverStatus: enc_('DONE') } },
          updateMask: { fieldPaths: ['serverStatus'] },
          updateTransforms: [{ fieldPath: 'serverAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { updateTime: d.updateTime },
        };
      }));
      log.projects[p.id] = { pending: pending.length, from: from, days: ledger.length, notMarked: failed };
    });
  } catch (e) {
    log.error = String(e && e.message || e);
    throw e;
  } finally {
    try {
      if (Object.keys(log.projects).length || log.error) {
        commit_([{
          update: { name: fullName_('serverRuns/' + Utilities.formatDate(started, 'Asia/Kolkata', "yyyyMMdd'T'HHmmss")), fields: encFields_({ startedAt: started, ms: new Date() - started, projects: log.projects, error: log.error }) },
        }]);
      }
    } finally {
      lock.releaseLock();
    }
  }
}

/** Ek baar chalao: hisab har 5 minute + roz raat 11:30 IST backup (purane trigger hata ke). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runHisab' || t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runHisab').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(23).nearMinute(30).inTimezone('Asia/Kolkata').create();
  Logger.log('runHisab har 5 minute chalega; dailyBackup roz raat ~11:30 IST');
}

// ---------------- roz ka backup → Obsidian vault (Google Drive) ----------------
// G:\My Drive\AI obsidian\<project vault>\Backup\<YYYY-MM-DD> full.json
// Niyam: purani file kabhi na chhuo / hatao / rename karo; same naam ho to " v2"; khaali file kabhi nahi.

var OBSIDIAN_ROOT = 'AI obsidian';
var PROJECT_COLLECTIONS = ['stockMoves', 'machineLogs', 'machineDeductions', 'labourMuster', 'staffAttendance', 'staffPassbook',
  'workEntries', 'storeMoves', 'ledger', 'photos', 'auditLog', 'unlocks', 'days', 'machineBills'];
var GLOBAL_COLLECTIONS = ['users', 'roles', 'settings', 'projects', 'masters_materials', 'masters_machines', 'masters_contractors',
  'masters_parties', 'masters_storeItems', 'masters_staff', 'auditLog'];

function obsidianRoot_() {
  var it = DriveApp.getRootFolder().getFoldersByName(OBSIDIAN_ROOT);
  if (!it.hasNext()) throw new Error('My Drive mein "' + OBSIDIAN_ROOT + '" folder nahi mila');
  return it.next();
}
/** "kondagaon site/kondagaon pawada anicut" jaisa raasta — jo folder nahi hai sirf wahi banata hai */
function folderPath_(parent, path) {
  return path.split('/').filter(String).reduce(function (f, name) {
    var it = f.getFoldersByName(name);
    return it.hasNext() ? it.next() : f.createFolder(name);
  }, parent);
}
/** Naya file — same naam pehle se ho to " v2", " v3"… (purani ko kabhi overwrite nahi) */
function createNewFile_(folder, baseName, ext, content, mime) {
  var name = baseName + ext;
  for (var v = 2; folder.getFilesByName(name).hasNext(); v++) name = baseName + ' v' + v + ext;
  var file = folder.createFile(name, content, mime);
  // Likhne ke baad padh ke jaancho — khaali / toota file nahi chahiye
  var back = file.getBlob().getDataAsString();
  if (!back || back.length < 20) throw new Error(name + ' khaali bana');
  if (ext === '.json') JSON.parse(back);
  return file;
}
function plain_(doc) {
  return { id: doc.id, updateTime: doc.updateTime, data: doc.data };
}

/**
 * Har project ka poora data + saari master list ek JSON mein, us project ke vault ke Backup\ folder mein.
 * Raat ka trigger, migration se pehle, aur restore se pehle — teeno yahi chalate hain.
 */
function dailyBackup(reason) {
  var started = new Date();
  var date = BPMCCore.toBusinessDateIST(started);
  var why = typeof reason === 'string' ? reason : 'roz ka backup';
  var root = obsidianRoot_();
  var global = {};
  GLOBAL_COLLECTIONS.forEach(function (c) { global[c] = listDocs_(c).map(plain_); });

  var results = {};
  global.projects.forEach(function (p) {
    var parent = 'projects/' + p.id;
    var cols = {};
    var entries = 0;
    PROJECT_COLLECTIONS.forEach(function (c) {
      cols[c] = query_(parent, c).map(plain_);
      if (c !== 'days' && c !== 'auditLog') entries += cols[c].length;
    });
    var payload = {
      type: 'bpmc-full-backup',
      schemaVersion: BPMCCore.CORE_SCHEMA_VERSION,
      firebaseProject: fsProject_(),
      project: p,
      businessDate: date,
      takenAt: started.toISOString(),
      reason: why,
      counts: Object.keys(cols).reduce(function (o, c) { o[c] = cols[c].length; return o; }, {}),
      note: entries === 0 ? 'Is project mein abhi koi entry nahi — sirf project aur master list ka backup' : null,
      collections: cols,
      global: global,
    };
    var vault = (p.data.vault || p.data.name || p.id);
    var folder = folderPath_(root, vault + '/Backup');
    var file = createNewFile_(folder, date + ' full', '.json', JSON.stringify(payload, null, 1), MimeType.PLAIN_TEXT);
    results[p.id] = { file: vault + '/Backup/' + file.getName(), bytes: file.getSize(), entries: entries };
  });

  commit_([{
    update: {
      name: fullName_('backupRuns/' + Utilities.formatDate(started, 'Asia/Kolkata', "yyyyMMdd'T'HHmmss")),
      fields: encFields_({ at: started, businessDate: date, reason: why, ms: new Date() - started, projects: results, ok: true }),
    },
  }]);
  Logger.log('Backup ho gaya: ' + JSON.stringify(results));
  return results;
}

// ---------------- pehli baar ka data (bootstrap) ----------------
/**
 * Sirf jo nahi hai wahi banata hai — kuch overwrite nahi karta (currentDocument.exists = false).
 * Koi dummy / sample data nahi: sirf Admin, role, 3 asli project aur aam material.
 */
function bootstrapPhase1() {
  var who = 'server-bootstrap';
  var now = new Date();
  var meta = { rev: 1, createdBy: who, createdAt: now, updatedBy: who, updatedAt: now, deleted: null, lastAuditId: null };
  function m(o) { var x = {}; Object.keys(meta).forEach(function (k) { x[k] = meta[k]; }); Object.keys(o).forEach(function (k) { x[k] = o[k]; }); return x; }

  var docs = {
    'roles/site_user': { permissions: ['entry.create', 'entry.edit', 'entry.delete', 'masters.edit', 'report.generate'], label: 'Site User' },
    'users/rohitmishra.p@gmail.com': m({ name: 'Rohit Mishra', role: 'admin', projectIds: [], active: true }),
    'settings/global': {
      company: { name: 'B.P. Mishra & Co.', state: 'Chhattisgarh', stateCode: '22' },
      rental: { shiftHours: 8, halfDayFactor: 0.5, idleDayFactor: 0, monthDivisor: 30 },
      editWindowDays: 2,
    },
    'projects/KSK': m({ name: 'EMRS Keshkal', code: 'BPMC-KSK', place: 'Keshkal', client: '', startDate: '', endDate: '', budgetPaise: 0, zones: [], vault: 'EMRS KESHKAL', status: 'ACTIVE' }),
    'projects/DNT': m({ name: 'EMRS Dantewada (NBCC)', code: 'BPMC-DNT', place: 'Dantewada', client: 'NBCC', startDate: '', endDate: '', budgetPaise: 0, zones: [], vault: 'EMRS DANTEWADA NBCC', status: 'ACTIVE' }),
    'projects/KDG': m({ name: 'Kondagaon — Pawada Anicut', code: 'BPMC-KDG', place: 'Kondagaon', client: '', startDate: '', endDate: '', budgetPaise: 0, zones: [], vault: 'kondagaon site/kondagaon pawada anicut', status: 'ACTIVE' }),
    'masters_materials/diesel': m({ name: 'Diesel', group: 'FUEL', baseUnit: 'Ltr', conversions: { Drum: 200 }, minStock: 100 }),
    'masters_materials/gitti': m({ name: 'Aggregate (Gitti)', group: 'MATERIAL', baseUnit: 'cu.m', conversions: {}, minStock: null }),
    'masters_materials/reti': m({ name: 'Sand (Reti)', group: 'MATERIAL', baseUnit: 'cu.m', conversions: {}, minStock: null }),
    'masters_materials/steel': m({ name: 'Steel (TMT)', group: 'MATERIAL', baseUnit: 'MT', conversions: {}, minStock: null }),
    'masters_materials/cement': m({ name: 'Cement', group: 'MATERIAL', baseUnit: 'Bags', conversions: {}, minStock: 50 }),
    'masters_materials/bricks': m({ name: 'Bricks (Flyash & Red)', group: 'MATERIAL', baseUnit: 'Nos', conversions: {}, minStock: null }),
    'masters_materials/engine-oil': m({ name: 'Engine oil 15W-40', group: 'OIL', baseUnit: 'Ltr', conversions: { Bucket: 20, Drum: 210 }, minStock: null }),
    'masters_materials/hydraulic-oil': m({ name: 'Hydraulic oil 68', group: 'OIL', baseUnit: 'Ltr', conversions: { Bucket: 20, Drum: 210 }, minStock: null }),
    'masters_materials/grease': m({ name: 'Grease (MP-3)', group: 'OIL', baseUnit: 'Kg', conversions: {}, minStock: null }),
    'masters_materials/gear-oil': m({ name: 'Gear oil 90', group: 'OIL', baseUnit: 'Ltr', conversions: {}, minStock: null }),
  };

  var paths = Object.keys(docs);
  var writes = [];
  paths.forEach(function (path) {
    writes.push({ update: { name: fullName_(path), fields: encFields_(docs[path]) }, currentDocument: { exists: false } });
  });
  var created = [];
  for (var i = 0; i < writes.length; i += 450) {
    var r = fsCall_('post', ':batchWrite', { writes: writes.slice(i, i + 450) });
    (r.status || []).forEach(function (s, j) { if (!s.code) created.push(paths[i + j]); });
  }
  if (created.length) {
    commit_(created.map(function (path) {
      return {
        update: { name: fullName_('auditLog/boot-' + path.replace(/[\/.@]/g, '_')), fields: encFields_({ entity: path, action: 'CREATE', rev: 1, by: who, at: now, reason: null, device: 'Apps Script' }) },
        currentDocument: { exists: false },
      };
    }));
  }
  Logger.log('Naye bane (' + created.length + '): ' + created.join(', '));
  Logger.log('Pehle se the (chhue nahi): ' + paths.filter(function (p) { return created.indexOf(p) < 0; }).join(', '));
}

/** Phase 0 ka connection check — ab bhi kaam ka */
function phase0Ping() {
  var r = fsCall_('get', '/_health/ping');
  Logger.log('Firestore pahunch: ' + (r === null ? 'theek (document nahi hai, 404)' : 'theek'));
}
