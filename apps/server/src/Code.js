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

    var ctx = { today: today, started: started, materialIds: materialIds, machines: null, rental: null };

    listDocs_('projects').forEach(function (p) {
      var parent = 'projects/' + p.id;
      var pStock = query_(parent, 'stockMoves', 'serverStatus', ENTRY_STATUS_PENDING);
      var pLogs = query_(parent, 'machineLogs', 'serverStatus', ENTRY_STATUS_PENDING);
      var pDeds = query_(parent, 'machineDeductions', 'serverStatus', ENTRY_STATUS_PENDING);
      var pMuster = query_(parent, 'labourMuster', 'serverStatus', ENTRY_STATUS_PENDING);
      var pStaff = query_(parent, 'staffAttendance', 'serverStatus', ENTRY_STATUS_PENDING);
      var pPass = query_(parent, 'staffPassbook', 'serverStatus', ENTRY_STATUS_PENDING);
      var pLabAtt = query_(parent, 'labourAttendance', 'serverStatus', ENTRY_STATUS_PENDING);
      var pLabPass = query_(parent, 'labourPassbook', 'serverStatus', ENTRY_STATUS_PENDING);
      var all = pStock.concat(pLogs, pDeds, pMuster, pStaff, pPass, pLabAtt, pLabPass);
      if (!all.length) return;
      var out = {};
      if (pStock.length) {
        out.stock = hisabStock_(parent, pStock, ctx);
        out.udhaar = hisabUdhaar_(parent, p.id, pStock);
      }
      if (pLogs.length || pDeds.length) out.machines = hisabMachines_(parent, pLogs, pDeds, ctx);
      if (pMuster.length || pStaff.length || pPass.length || pLabAtt.length) out.attendance = hisabAttendance_(parent, pMuster.concat(pLabAtt), pStaff, pPass, ctx);
      if (pLabAtt.length || pLabPass.length) out.labour = hisabLabour_(parent, pLabAtt, pLabPass, ctx);
      out.notMarked = markDone_(all);
      log.projects[p.id] = out;
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

/** Entry par DONE — sirf agar server ke padhne ke baad phone ne dobara na badla ho */
function markDone_(docs) {
  if (!docs.length) return 0;
  return batchWrite_(docs.map(function (d) {
    return {
      update: { name: d.name, fields: { serverStatus: enc_('DONE') } },
      updateMask: { fieldPaths: ['serverStatus'] },
      updateTransforms: [{ fieldPath: 'serverAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { updateTime: d.updateTime },
    };
  }));
}

/** field ki range (from..to dono shamil) */
function rangeQuery_(parent, col, field, from, to) {
  var sq = {
    from: [{ collectionId: col }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: enc_(from) } },
      { fieldFilter: { field: { fieldPath: field }, op: 'LESS_THAN_OR_EQUAL', value: enc_(to) } },
    ] } },
  };
  var r = fsCall_('post', '/' + parent + ':runQuery', { structuredQuery: sq }) || [];
  return r.filter(function (x) { return x.document; }).map(function (x) { return docOf_(x.document); });
}

/** Stock: sabse purani badli tarikh se aaj tak opening / aaya / kharch / closing → days/{date}.stock */
function hisabStock_(parent, pending, ctx) {
  // Kahan se dobara: sabse purani PENDING tarikh, khula edit-window (D−2), aur Admin ke khole din
  var from = BPMCCore.addDays(ctx.today, -BPMCCore.EDIT_WINDOW_DAYS);
  pending.forEach(function (d) { if (d.data.businessDate && d.data.businessDate < from) from = d.data.businessDate; });
  query_(parent, 'unlocks').forEach(function (u) {
    if (u.data.expiresAt && u.data.expiresAt > ctx.started && u.id < from) from = u.id;
  });
  var moves = query_(parent, 'stockMoves')
    .filter(function (d) { return d.data.businessDate && d.data.itemId && d.data.type; })
    .map(function (d) {
      return { id: d.id, itemId: d.data.itemId, businessDate: d.data.businessDate, type: d.data.type, qty: Number(d.data.qty) || 0, deleted: !!d.data.deleted };
    });
  var items = ctx.materialIds.slice();
  moves.forEach(function (m) { if (items.indexOf(m.itemId) < 0) items.push(m.itemId); });
  items.sort();
  var ledger = BPMCCore.buildStockLedger(moves, from, ctx.today, items);
  commit_(ledger.map(function (day) {
    return {
      update: { name: fullName_(parent + '/days/' + day.date), fields: { stock: enc_(day.items), date: enc_(day.date) } },
      updateMask: { fieldPaths: ['stock', 'date'] },
      updateTransforms: [{ fieldPath: 'stockComputedAt', setToServerValue: 'REQUEST_TIME' }],
    };
  }));
  return { pending: pending.length, from: from, days: ledger.length };
}

/** Udhaar par aaya maal → us party ke khate mein BILL (ledger/sm_<moveId>). Entry hati / udhaar nahi rahi → bill bhi hata. */
function hisabUdhaar_(parent, pid, pending) {
  var writes = [];
  var now = new Date();
  pending.forEach(function (d) {
    var m = d.data;
    if (m.type !== 'IN') return;
    var path = parent + '/ledger/sm_' + d.id;
    var existing = getDoc_(path);
    var isUdhaar = m.payMode === 'UDHAAR' && m.partyId && !m.deleted;
    if (!isUdhaar) {
      if (existing && !existing.data.deleted) {
        writes.push({
          update: { name: fullName_(path), fields: encFields_({ deleted: { by: 'server', reason: m.deleted ? 'Stock entry was deleted' : 'No longer on credit', at: now }, rev: (existing.data.rev || 1) + 1, updatedAt: now, updatedBy: 'server' }) },
          updateMask: { fieldPaths: ['deleted', 'rev', 'updatedAt', 'updatedBy'] },
        });
      }
      return;
    }
    var amt = BPMCCore.lineAmount(Number(m.qty) || 0, m.ratePaise || 0, m.gstPct || 0);
    writes.push({
      update: {
        name: fullName_(path),
        fields: encFields_({
          projectId: pid, businessDate: m.businessDate, type: 'BILL', partyId: m.partyId, partyName: m.partyName || null,
          amountPaise: amt.totalPaise, basePaise: amt.basePaise, gstPaise: amt.gstPaise,
          billNo: m.billNo || null, itemName: m.itemName || m.itemId, qty: m.qty, source: 'stockMoves/' + d.id,
          remark: m.ratePaise ? null : 'No rate entered — amount is 0; add the rate in the stock entry',
          deleted: null, serverStatus: 'DONE', createdBy: existing ? existing.data.createdBy : 'server', createdAt: existing ? existing.data.createdAt : now,
          updatedBy: 'server', updatedAt: now, rev: existing ? (existing.data.rev || 1) + 1 : 1, lastAuditId: null,
        }),
      },
    });
  });
  if (writes.length) commit_(writes);
  return writes.length;
}

/** Machine: din ka hisab (days/{date}.machines) + mahine ka bill (machineBills/{machine}_{YYYY-MM}) */
function hisabMachines_(parent, pLogs, pDeds, ctx) {
  if (!ctx.machines) {
    ctx.machines = {};
    listDocs_('masters_machines').forEach(function (m) { ctx.machines[m.id] = m.data; });
  }
  loadSettings_(ctx);
  return hisabMachinesInner_(parent, pLogs, pDeds, ctx);
}

/** settings/global.rental ek baar padho (machine bill aur staff din-rate dono ke liye) */
function loadSettings_(ctx) {
  if (!ctx.rental) {
    var g = getDoc_('settings/global');
    var r = g && g.data.rental || {};
    ctx.rental = {
      shiftHours: r.shiftHours || 8, halfDayFactor: r.halfDayFactor != null ? r.halfDayFactor : 0.5,
      idleDayFactor: r.idleDayFactor || 0, monthDivisor: r.monthDivisor || 30,
    };
  }
}

function hisabMachinesInner_(parent, pLogs, pDeds, ctx) {
  var dates = {};
  var months = {};
  pLogs.forEach(function (d) { if (d.data.businessDate) { dates[d.data.businessDate] = 1; months[d.data.businessDate.slice(0, 7)] = 1; } });
  pDeds.forEach(function (d) { if (d.data.businessDate) months[d.data.businessDate.slice(0, 7)] = 1; });

  var writes = [];
  Object.keys(dates).forEach(function (date) {
    var logs = latestPerMachine_(query_(parent, 'machineLogs', 'businessDate', date));
    var machines = {};
    var tot = { dieselLtr: 0, hours: 0, amountPaise: 0, running: 0, breakdown: 0 };
    Object.keys(logs).forEach(function (mid) {
      var l = logs[mid].data;
      var m = ctx.machines[mid] || { name: l.machineName || mid };
      var r = BPMCCore.machineDay({ businessDate: date, status: l.status, sr: l.sr, cr: l.cr, dieselLtr: l.dieselLtr }, m, ctx.rental);
      machines[mid] = r;
      tot.dieselLtr += r.dieselLtr;
      tot.hours += r.hours || 0;
      tot.amountPaise += r.amountPaise || 0;
      if (l.status === 'BREAKDOWN') tot.breakdown++;
      else if (l.status !== 'ABSENT') tot.running++;
    });
    tot.hours = Math.round(tot.hours * 100) / 100;
    writes.push({
      update: { name: fullName_(parent + '/days/' + date), fields: { machines: enc_(machines), machineTotals: enc_(tot), date: enc_(date) } },
      updateMask: { fieldPaths: ['machines', 'machineTotals', 'date'] },
      updateTransforms: [{ fieldPath: 'machinesComputedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  });

  var bills = 0;
  Object.keys(months).forEach(function (month) {
    var end = month + '-' + ('0' + BPMCCore.daysInMonth(month)).slice(-2);
    var logsByM = {};
    rangeQuery_(parent, 'machineLogs', 'businessDate', month + '-01', end).forEach(function (d) {
      (logsByM[d.data.machineId] = logsByM[d.data.machineId] || []).push(d);
    });
    var dedsByM = {};
    rangeQuery_(parent, 'machineDeductions', 'businessDate', month + '-01', end).forEach(function (d) {
      (dedsByM[d.data.machineId] = dedsByM[d.data.machineId] || []).push({ kind: d.data.kind, amountPaise: d.data.amountPaise || 0, deleted: !!d.data.deleted });
    });
    Object.keys(logsByM).concat(Object.keys(dedsByM)).filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (mid) {
      var m = ctx.machines[mid];
      if (!m || m.kind === 'COMPANY' || !m.rateType || m.ratePaise == null) return;
      var perDay = {};
      (logsByM[mid] || []).forEach(function (d) {
        if (d.data.deleted) return;
        var cur = perDay[d.data.businessDate];
        if (!cur || d.updateTime > cur.updateTime) perDay[d.data.businessDate] = d;
      });
      var logs = Object.keys(perDay).map(function (k) {
        var l = perDay[k].data;
        var hours = null;
        try { if (l.sr != null && l.cr != null) hours = BPMCCore.machineHours(l.sr, l.cr); } catch (e) { hours = null; }
        return hours === null ? { businessDate: l.businessDate, status: l.status } : { businessDate: l.businessDate, status: l.status, hours: hours };
      });
      var fields;
      try {
        var b = BPMCCore.monthlyBill({
          rateType: m.rateType, ratePaise: m.ratePaise, month: month, logs: logs, deductions: dedsByM[mid] || [],
          onSiteFrom: m.siteFrom || undefined, onSiteTo: m.siteTo || undefined,
        }, ctx.rental);
        b.offSiteDays = BPMCCore.daysInMonth(month) - b.siteDays;
        b.ratePaise = m.ratePaise;
        b.rateType = m.rateType;
        b.machineName = m.name;
        b.error = null;
        fields = b;
      } catch (e) {
        fields = { month: month, machineName: m.name, error: String(e.message || e) };
      }
      writes.push({
        update: { name: fullName_(parent + '/machineBills/' + mid + '_' + month), fields: encFields_(fields) },
        updateTransforms: [{ fieldPath: 'computedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      bills++;
    });
  });
  if (writes.length) commit_(writes);
  return { dates: Object.keys(dates).length, bills: bills };
}

/**
 * Haazri: days/{date}.labour (thekedar-wise Mistri / Kuli / Reja), days/{date}.staff (P / HD / A gin-ti),
 * aur jis staff ki haazri / khata badla uska poora khata → staffBalances/{staffId}.
 */
function hisabAttendance_(parent, pMuster, pStaff, pPass, ctx) {
  var writes = [];
  var musterDates = {};
  pMuster.forEach(function (d) { if (d.data.businessDate) musterDates[d.data.businessDate] = 1; });
  var labourMaster = null;
  Object.keys(musterDates).forEach(function (date) {
    var latest = latestBy_(query_(parent, 'labourMuster', 'businessDate', date), 'contractorId');
    var counts = Object.keys(latest).map(function (k) {
      var m = latest[k].data;
      return { contractorId: m.contractorId, mistri: Number(m.mistri) || 0, kuli: Number(m.kuli) || 0, reja: Number(m.reja) || 0 };
    });
    // Naam-wise haazri (labourAttendance) — har labour ki us din ki sabse nayi entry
    var namedDocs = latestBy_(query_(parent, 'labourAttendance', 'businessDate', date), 'labourId');
    if (Object.keys(namedDocs).length && !labourMaster) labourMaster = labourMap_(parent);
    var named = Object.keys(namedDocs).map(function (lid) {
      var a = namedDocs[lid].data;
      var m = labourMaster[lid] || {};
      return { group: m.group || a.group || 'COMPANY', type: m.type || a.type || 'KULI', mark: a.mark };
    });
    var labour = BPMCCore.labourDay(BPMCCore.combineLabour(counts, named));
    writes.push({
      update: { name: fullName_(parent + '/days/' + date), fields: { labour: enc_(labour), date: enc_(date) } },
      updateMask: { fieldPaths: ['labour', 'date'] },
      updateTransforms: [{ fieldPath: 'labourComputedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  });

  var staffDates = {};
  var staffIds = {};
  pStaff.forEach(function (d) { if (d.data.businessDate) staffDates[d.data.businessDate] = 1; if (d.data.staffId) staffIds[d.data.staffId] = 1; });
  pPass.forEach(function (d) { if (d.data.staffId) staffIds[d.data.staffId] = 1; });
  Object.keys(staffDates).forEach(function (date) {
    var latest = latestBy_(query_(parent, 'staffAttendance', 'businessDate', date), 'staffId');
    var c = { present: 0, halfDay: 0, absent: 0, marked: 0 };
    Object.keys(latest).forEach(function (k) {
      var mk = latest[k].data.mark;
      c.marked++;
      if (mk === 'P') c.present++;
      else if (mk === 'HD') c.halfDay++;
      else c.absent++;
    });
    writes.push({
      update: { name: fullName_(parent + '/days/' + date), fields: { staff: enc_(c), date: enc_(date) } },
      updateMask: { fieldPaths: ['staff', 'date'] },
    });
  });

  Object.keys(staffIds).forEach(function (sid) {
    var master = getDoc_('masters_staff/' + sid);
    var perDay = {};
    query_(parent, 'staffAttendance', 'staffId', sid).forEach(function (d) {
      if (d.data.deleted) return;
      var cur = perDay[d.data.businessDate];
      if (!cur || d.updateTime > cur.updateTime) perDay[d.data.businessDate] = d;
    });
    var attendance = Object.keys(perDay).map(function (k) { return { businessDate: k, mark: perDay[k].data.mark }; });
    var payments = query_(parent, 'staffPassbook', 'staffId', sid).map(function (d) {
      return { businessDate: d.data.businessDate, kind: d.data.kind, amountPaise: d.data.amountPaise || 0, deleted: !!d.data.deleted };
    });
    loadSettings_(ctx);
    var khataInput = { salaryPaise: master && master.data.salaryPaise != null ? master.data.salaryPaise : null, attendance: attendance, payments: payments, divisor: ctx.rental.monthDivisor };
    var k = BPMCCore.staffKhata(khataInput);
    // Purana hisab: mahina-wise P / HD / A, kamai, diya, chalta baaki
    k.months = BPMCCore.staffMonthly(khataInput);
    k.staffName = master ? master.data.name : sid;
    k.salaryPaise = master ? master.data.salaryPaise || null : null;
    writes.push({
      update: { name: fullName_(parent + '/staffBalances/' + sid), fields: encFields_(k) },
      updateTransforms: [{ fieldPath: 'computedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  });
  if (writes.length) commit_(writes);
  return { musterDays: Object.keys(musterDates).length, staffDays: Object.keys(staffDates).length, staff: Object.keys(staffIds).length };
}

/** Project ki labour list: id → { name, type, ratePaise, group } */
function labourMap_(parent) {
  var out = {};
  query_(parent, 'labour').forEach(function (d) { out[d.id] = d.data; });
  return out;
}

/** Ek labour ki entries: har din ki sabse nayi (hataayi chhod ke) → core ke LabourMark */
function labourMarks_(docs) {
  var perDay = {};
  docs.forEach(function (d) {
    if (d.data.deleted) return;
    var cur = perDay[d.data.businessDate];
    if (!cur || d.updateTime > cur.updateTime) perDay[d.data.businessDate] = d;
  });
  return Object.keys(perDay).map(function (k) {
    var a = perDay[k].data;
    return { businessDate: k, mark: a.mark, otHours: Number(a.otHours) || 0, ratePaise: a.ratePaise != null ? a.ratePaise : null };
  });
}

/**
 * Naam-wise labour: hafte ka hisab (labourWeeks/{Monday}) aur har labour ka khata (labourBalances/{labourId}).
 * Kamai = din × rate + OT ghante × rate ÷ 8; khata = kamai − advance / bhugtan.
 */
function hisabLabour_(parent, pLabAtt, pLabPass, ctx) {
  loadSettings_(ctx);
  var master = labourMap_(parent);
  var shift = ctx.rental.shiftHours;
  var writes = [];

  var weeks = {};
  pLabAtt.forEach(function (d) { if (d.data.businessDate) weeks[BPMCCore.weekStart(d.data.businessDate)] = 1; });
  Object.keys(weeks).forEach(function (ws) {
    var byLabour = {};
    rangeQuery_(parent, 'labourAttendance', 'businessDate', ws, BPMCCore.addDays(ws, 6)).forEach(function (d) {
      (byLabour[d.data.labourId] = byLabour[d.data.labourId] || []).push(d);
    });
    var labour = {};
    var total = 0;
    Object.keys(byLabour).forEach(function (lid) {
      var e = BPMCCore.labourEarning(labourMarks_(byLabour[lid]), (master[lid] || {}).ratePaise || 0, shift);
      labour[lid] = e;
      total += e.amountPaise;
    });
    writes.push({
      update: { name: fullName_(parent + '/labourWeeks/' + ws), fields: encFields_({ weekStart: ws, labour: labour, totalPaise: total }) },
      updateTransforms: [{ fieldPath: 'computedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  });

  var ids = {};
  pLabAtt.concat(pLabPass).forEach(function (d) { if (d.data.labourId) ids[d.data.labourId] = 1; });
  Object.keys(ids).forEach(function (lid) {
    var m = master[lid] || {};
    var marks = labourMarks_(query_(parent, 'labourAttendance', 'labourId', lid));
    var payments = query_(parent, 'labourPassbook', 'labourId', lid).map(function (d) {
      return { kind: d.data.kind, businessDate: d.data.businessDate, amountPaise: d.data.amountPaise || 0, deleted: !!d.data.deleted };
    });
    var k = BPMCCore.labourKhata({ ratePaise: m.ratePaise || 0, marks: marks, payments: payments, shiftHours: shift });
    // Purana hisab: hafta-wise kamai, diya, chalta baaki
    k.weeks = BPMCCore.labourStatement({ ratePaise: m.ratePaise || 0, marks: marks, payments: payments, shiftHours: shift });
    k.name = m.name || lid;
    k.group = m.group || null;
    writes.push({
      update: { name: fullName_(parent + '/labourBalances/' + lid), fields: encFields_(k) },
      updateTransforms: [{ fieldPath: 'computedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  });
  if (writes.length) commit_(writes);
  return { weeks: Object.keys(weeks).length, labour: Object.keys(ids).length };
}

/** Har key (thekedar / staff) ki sabse nayi, na-hataayi entry */
function latestBy_(docs, key) {
  var out = {};
  docs.forEach(function (d) {
    if (d.data.deleted || !d.data[key]) return;
    var cur = out[d.data[key]];
    if (!cur || d.updateTime > cur.updateTime) out[d.data[key]] = d;
  });
  return out;
}

/** Ek machine ke ek din mein ek hi log gino (offline se do ban gaye to sabse naya) */
function latestPerMachine_(docs) {
  var out = {};
  docs.forEach(function (d) {
    if (d.data.deleted || !d.data.machineId) return;
    var cur = out[d.data.machineId];
    if (!cur || d.updateTime > cur.updateTime) out[d.data.machineId] = d;
  });
  return out;
}

/** Ek baar chalao: hisab har 5 minute + roz raat 11:30 IST backup (purane trigger hata ke). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runHisab' || t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runHisab').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(23).nearMinute(30).inTimezone('Asia/Kolkata').create();
  Logger.log('runHisab runs every 5 minutes; dailyBackup nightly at ~11:30 PM IST');
}

// ---------------- roz ka backup → Obsidian vault (Google Drive) ----------------
// G:\My Drive\AI obsidian\<project vault>\Backup\<YYYY-MM-DD> full.json
// Niyam: purani file kabhi na chhuo / hatao / rename karo; same naam ho to " v2"; khaali file kabhi nahi.

var OBSIDIAN_ROOT = 'AI obsidian';
var PROJECT_COLLECTIONS = ['stockMoves', 'machineLogs', 'machineDeductions', 'labourMuster', 'staffAttendance', 'staffPassbook',
  'workEntries', 'storeMoves', 'ledger', 'photos', 'auditLog', 'unlocks', 'days', 'machineBills',
  'labour', 'labourAttendance', 'labourPassbook', 'labourBalances', 'labourWeeks', 'staffBalances'];
var GLOBAL_COLLECTIONS = ['users', 'roles', 'settings', 'projects', 'masters_materials', 'masters_machines', 'masters_contractors',
  'masters_parties', 'masters_storeItems', 'masters_staff', 'masters_companyAccounts', 'auditLog'];

function obsidianRoot_() {
  var it = DriveApp.getRootFolder().getFoldersByName(OBSIDIAN_ROOT);
  if (!it.hasNext()) throw new Error('Folder "' + OBSIDIAN_ROOT + '" not found in My Drive');
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
  if (!back || back.length < 20) throw new Error(name + ' was written empty');
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
  var why = typeof reason === 'string' ? reason : 'nightly backup';
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
      note: entries === 0 ? 'No entries in this project yet — backup contains the project and master data only' : null,
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
  Logger.log('Backup complete: ' + JSON.stringify(results));
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
  Logger.log('Created (' + created.length + '): ' + created.join(', '));
  Logger.log('Already existed (left untouched): ' + paths.filter(function (p) { return created.indexOf(p) < 0; }).join(', '));
}

// ---------------- restore (kisi din ka data wapas) ----------------
// Kaise chalayein (Apps Script editor):
//   1. Project Settings → Script properties: RESTORE_PROJECT = KSK, RESTORE_FILE = 2026-10-24 full.json
//   2. restorePreview chalao → log mein dekho kya badlega
//   3. Theek lage to RESTORE_CONFIRM = KSK/2026-10-24 full.json likho, phir restoreRun chalao
// restoreRun pehle naya backup leta hai. Backup ke baad bani entry delete nahi hoti — soft-delete (Recycle Bin).
// auditLog aur days/ ko chhuta nahi (days server dobara banata hai).

var RESTORE_COLLECTIONS = ['stockMoves', 'machineLogs', 'machineDeductions', 'labourMuster', 'staffAttendance', 'staffPassbook',
  'workEntries', 'storeMoves', 'ledger', 'photos', 'labourAttendance', 'labourPassbook'];

function restoreInput_() {
  var props = PropertiesService.getScriptProperties();
  var pid = props.getProperty('RESTORE_PROJECT');
  var fileName = props.getProperty('RESTORE_FILE');
  if (!pid || !fileName) throw new Error('Set Script properties RESTORE_PROJECT and RESTORE_FILE');
  var p = getDoc_('projects/' + pid);
  if (!p) throw new Error('Project ' + pid + ' not found');
  var folder = folderPath_(obsidianRoot_(), (p.data.vault || p.data.name) + '/Backup');
  var it = folder.getFilesByName(fileName);
  if (!it.hasNext()) throw new Error('Backup file not found: ' + fileName);
  var backup = JSON.parse(it.next().getBlob().getDataAsString());
  if (backup.type !== 'bpmc-full-backup' || backup.project.id !== pid) throw new Error('This file is not a backup of this project');
  return { pid: pid, fileName: fileName, backup: backup, props: props };
}

/** Backup JSON mein samay ISO string ban jaata hai — wapas Timestamp banao ("2026-10-24" jaisi tarikh string hi rahe) */
function reviveDates_(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) return new Date(v);
  if (Array.isArray(v)) return v.map(reviveDates_);
  if (v && typeof v === 'object') {
    Object.keys(v).forEach(function (k) { v[k] = reviveDates_(v[k]); });
  }
  return v;
}

function restorePlan_(input) {
  var parent = 'projects/' + input.pid;
  var plan = { put: [], softDelete: [], same: 0, perCol: {} };
  RESTORE_COLLECTIONS.forEach(function (c) {
    var old = {};
    (input.backup.collections[c] || []).forEach(function (d) { old[d.id] = d; });
    var nowDocs = query_(parent, c);
    var now = {};
    nowDocs.forEach(function (d) { now[d.id] = d; });
    var stat = { wapas: 0, recycleBin: 0, same: 0 };
    Object.keys(old).forEach(function (id) {
      var cur = now[id];
      if (cur && JSON.stringify(cur.data) === JSON.stringify(old[id].data)) { stat.same++; plan.same++; return; }
      plan.put.push({ path: parent + '/' + c + '/' + id, col: c, id: id, data: old[id].data, cur: cur });
      stat.wapas++;
    });
    nowDocs.forEach(function (d) {
      if (!old[d.id] && !d.data.deleted) { plan.softDelete.push({ path: parent + '/' + c + '/' + d.id, col: c, id: d.id, cur: d }); stat.recycleBin++; }
    });
    plan.perCol[c] = stat;
  });
  return plan;
}

function restorePreview() {
  var input = restoreInput_();
  var plan = restorePlan_(input);
  Logger.log('Restore preview — ' + input.pid + ' ← ' + input.fileName + ' (backup: ' + input.backup.takenAt + ')');
  Logger.log('Restored from backup: ' + plan.put.length + ' · created after backup → Recycle Bin: ' + plan.softDelete.length + ' · unchanged: ' + plan.same);
  Logger.log(JSON.stringify(plan.perCol));
  Logger.log('If this looks right, set Script property RESTORE_CONFIRM = ' + input.pid + '/' + input.fileName + ' and run restoreRun.');
}

function restoreRun() {
  var input = restoreInput_();
  var want = input.pid + '/' + input.fileName;
  if (input.props.getProperty('RESTORE_CONFIRM') !== want) throw new Error('Run restorePreview first, then set RESTORE_CONFIRM = ' + want);
  dailyBackup('before restore (' + want + ')');
  var plan = restorePlan_(input);
  var now = new Date();
  var who = Session.getActiveUser().getEmail() || 'server-restore';
  var reason = 'Restored from backup ' + input.fileName + ' (' + who + ')';
  var writes = [];
  function audit(col, id, rev) {
    var aid = 'restore-' + Utilities.getUuid();
    writes.push({ update: { name: fullName_('projects/' + input.pid + '/auditLog/' + aid), fields: encFields_({ entity: col + '/' + id, action: 'RESTORE', rev: rev, by: who, at: now, reason: reason, device: 'Apps Script' }) } });
    return aid;
  }
  plan.put.forEach(function (x) {
    var rev = (x.cur && x.cur.data.rev || x.data.rev || 1) + 1;
    var data = reviveDates_(JSON.parse(JSON.stringify(x.data)));
    data.rev = rev;
    data.serverStatus = 'PENDING';
    data.lastAuditId = audit(x.col, x.id, rev);
    data.updatedBy = who;
    data.updatedAt = now;
    writes.push({ update: { name: fullName_(x.path), fields: encFields_(data) } });
  });
  plan.softDelete.forEach(function (x) {
    var rev = (x.cur.data.rev || 1) + 1;
    writes.push({
      update: { name: fullName_(x.path), fields: encFields_({ deleted: { by: who, reason: reason, at: now }, rev: rev, serverStatus: 'PENDING', lastAuditId: audit(x.col, x.id, rev), updatedBy: who, updatedAt: now }) },
      updateMask: { fieldPaths: ['deleted', 'rev', 'serverStatus', 'lastAuditId', 'updatedBy', 'updatedAt'] },
    });
  });
  commit_(writes);
  input.props.deleteProperty('RESTORE_CONFIRM');
  Logger.log('Restore complete: ' + plan.put.length + ' restored, ' + plan.softDelete.length + ' moved to Recycle Bin. Totals will be recalculated on the next runHisab.');
}

// ---------------- migration ----------------
// Naya migration yahan jodo (BPMCCore.Migration jaisa). Chalane ka tareeka restore jaisa:
//   MIGRATION_ID set karo → migrationPreview → MIGRATION_CONFIRM = wahi id → migrationRun
var MIGRATIONS = [];

function migrationInput_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MIGRATION_ID');
  var m = MIGRATIONS.filter(function (x) { return x.id === id; })[0];
  if (!m) throw new Error('MIGRATION_ID "' + id + '" is not in the MIGRATIONS list');
  var docs = [];
  m.collections.forEach(function (c) {
    if (c.indexOf('projects/*/') === 0) {
      listDocs_('projects').forEach(function (p) {
        query_('projects/' + p.id, c.slice(11)).forEach(function (d) { docs.push({ path: 'projects/' + p.id + '/' + c.slice(11) + '/' + d.id, data: d.data, updateTime: d.updateTime }); });
      });
    } else {
      listDocs_(c).forEach(function (d) { docs.push({ path: c + '/' + d.id, data: d.data, updateTime: d.updateTime }); });
    }
  });
  return { m: m, docs: docs, props: props };
}

function migrationPreview() {
  var x = migrationInput_();
  var plan = BPMCCore.planMigration(x.m, x.docs);
  Logger.log(x.m.id + ' — ' + x.m.describe);
  Logger.log('Scanned: ' + plan.scanned + ' · will change: ' + plan.changes.length + ' · already migrated: ' + plan.alreadyDone + ' · errors: ' + plan.errors.length);
  plan.changes.slice(0, 5).forEach(function (c) { Logger.log(c.path + ': ' + JSON.stringify(c.before) + ' → ' + JSON.stringify(c.after)); });
  plan.errors.forEach(function (e) { Logger.log('ERROR ' + e.path + ': ' + e.error); });
}

function migrationRun() {
  var x = migrationInput_();
  if (x.props.getProperty('MIGRATION_CONFIRM') !== x.m.id) throw new Error('Run migrationPreview first, then set MIGRATION_CONFIRM = ' + x.m.id);
  if (getDoc_('migrations/' + x.m.id)) throw new Error(x.m.id + ' has already been run');
  var plan = BPMCCore.planMigration(x.m, x.docs);
  if (plan.errors.length) throw new Error(plan.errors.length + ' documents have errors — migration will not run. See migrationPreview.');
  dailyBackup('before migration ' + x.m.id);
  var times = {};
  x.docs.forEach(function (d) { times[d.path] = d.updateTime; });
  commit_(plan.changes.map(function (c) {
    return { update: { name: fullName_(c.path), fields: encFields_(c.after) }, currentDocument: { updateTime: times[c.path] } };
  }));
  var after = migrationInput_().docs;
  var check = BPMCCore.verifyMigration(plan, after);
  commit_([{ update: { name: fullName_('migrations/' + x.m.id), fields: encFields_({ at: new Date(), describe: x.m.describe, scanned: plan.scanned, changed: plan.changes.length, ok: check.ok, problems: check.problems }) } }]);
  x.props.deleteProperty('MIGRATION_CONFIRM');
  if (!check.ok) throw new Error('Post-migration check failed: ' + check.problems.join('; ') + ' — a backup is in the Obsidian vault; restore it');
  Logger.log('Migration ' + x.m.id + ' complete and verified: ' + plan.changes.length + ' changed');
}

/** Phase 0 ka connection check — ab bhi kaam ka */
function phase0Ping() {
  var r = fsCall_('get', '/_health/ping');
  Logger.log('Firestore reachable: ' + (r === null ? 'OK (document absent, 404)' : 'OK'));
}
