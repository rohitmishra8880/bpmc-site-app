// Phase 0: sirf connection check. Asli hisab Phase 1 se (@bpmc/core bundle hoke yahan aayega).

/** Firestore REST se ek document padh ke dekhta hai ki Apps Script → Firestore raasta khula hai. */
function phase0Ping() {
  // Live wale script mein Script property FIREBASE_PROJECT_ID = bpmc-site-live set hogi.
  const projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID') || 'bpmc-site-test';
  const url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents/_health/ping';
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  Logger.log('Firestore status: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
}
