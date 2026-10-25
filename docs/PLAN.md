# BPMC Site App — Master Plan v3 (24 Oct 2026)

> Status: **DRAFT v3 — Rohit ke final OK ka intezaar.** OK tak koi app code nahi (CLAUDE.md T7.1).
> "Pakka" = tay / tested. "Andaza" = Phase 0 mein verify karna hai.
>
> **v2 → v3 (Rohit ke jawab, 24 Oct):**
> - ❗ **Hisab phone par nahi — server par.** Server = **Google Apps Script + Google Sheet** (free, Rohit ke Google account mein).
> - **Photos Google Drive mein.**
> - **Backup:** best tareeka chunna tha → Apps Script seedha "AI obsidian" Drive folder mein likhega (laptop on hona zaroori nahi). GitHub Actions doosri copy. Laptop agent hata diya.
> - Obsidian bilkul theek hai — woh sirf notes app hai, files simple `.md` / `.json` / `.pdf` hain. Koi dikkat nahi.
> - "2 din" = 24 Oct ki entry 26 Oct raat 11:59 tak ✅ pakka.
> - Monthly machine: poora mahina chali to **poora monthly rate** (30 / 31 / 28 din kuch bhi); na chalne ke din × (rate ÷ 30) minus.
> - Machine hisab mein **advance / site se liya saman minus**.
> - Inventory mein **Oil & Lubricants** + item add / edit / delete, unit chunna, remark.
> - Koi paid plan nahi (v2 se) — sab free.

---

## Phase 2 — haal (24 Oct 2026, chal raha hai)
- ✅ Inventory / Diesel: material tabs (Oil ke saath), 4 card server ke hisab se, aaya (party, bill, bhugtan, rate, GST, unit) / kharch, edit (reason) / hatao
- ✅ Machinery: daily log (SR prefill = pichhla CR, status, diesel, breakdown samay + kaaran), advance / katauti, mahine ka bill (server)
- ✅ Machine log ka diesel usi save mein stockMoves USE (ek hi jagah — galti #5, #7); diesel 0 = movement 0 (hatta nahi)
- ✅ Server: machine din ka hisab (days/.machines), machineBills (Day/Hour/Month, site se bahar + na chalne ke din minus, advance minus), udhaar maal → ledger BILL
- ✅ Tests: core 71, rules 31, **server e2e 12/12** (Apps Script code emulator par — `npm run test:server`)
- ✅ Logo (G:\My Drive\B.P MISHRA PROFILE\logo\BPMC_logo.png se copy, original nahi chhua): header, sidebar, login, favicon, Dashboard watermark
- 📌 Rohit: **har DPR mein logo watermark** (Phase 3 PDF / print / Obsidian) — yahi logo
- 📌 Rohit (24 Oct): **App UI sirf English.** DPR mein labels **English / हिंदी** (slash se), jaise "Opening Stock / पुराना स्टॉक". App mein Hindi toggle nahi chahiye.
- ✅ Attendance (TDD): thekedar muster (Company + masters ke thekedar, Mistri / Kuli / Reja), staff P / HD / A (badalne par reason), staff ledger (Advance / Salary / staff ka kharcha); server: days/.labour, days/.staff, staffBalances (din-rate = salary ÷ 30); Dashboard card
- ✅ Inventory stock calculation saaf number ("0 + 200 − 0")
- 📌 Rohit: har kaam TDD se (pehle failing test, phir code) + unit + integration; bina maange badlav se pehle poochhna
- ✅ Staff + Contractor masters mein poori bank detail (account holder, bank, account no. 9–18 ank, IFSC)
- ✅ **Labour Attendance bana (TDD — core 93, rules 39, server e2e 24):** weekly sheet, add labour, contractor ka har-hafte tareeka, OT, labour + staff payment (mode / company account / ref), Company bank accounts master, contractor "paisa kaun"; backup / restore / Recycle Bin mein naye collections
- 📝 **Labour Attendance — design (Rohit ke jawab 24 Oct, OK mila):**
  - Naam: "Labour muster" → **"Labour attendance"**.
  - **Labour list** (project-wise): naam, type (Mistri / Kuli / Reja), din ka rate ₹, Aadhaar aakhri 4 (optional), group = Company ya kaunsa contractor. Weekly sheet se hi "＋ Add labour" (wahi detail poochhe).
  - **Weekly sheet (Mon–Sun):** rows = labour ka naam (type); columns = Mon 21 … Sun 27, har din P / HD / A + OT ghante; daayein: kul din, OT ghante, rate, amount.
  - **Overtime ✅ ghante mein:** OT paisa = din ka rate ÷ 8 × OT ghante (₹600/din, 2 ghante = ₹150). Amount = din × rate + OT.
  - **Company labour:** hamesha naam-wise.
  - **Contractor labour ✅ har hafte poochhe:** us hafte ke liye "Naam-wise" ya "Sirf gin-ti (Mistri / Kuli / Reja + OT)".
  - **Paisa kaun ✅ dono ho sakta hai:** contractor Master mein "Labour ka paisa: Hum dete hain / Contractor deta hai". Contractor deta hai → sirf record, hamare dene mein nahi judta.
  - **Hisab ✅ har section mein alag:** labour + staff ka hisab Attendance mein; machine malik ka Machinery mein; supplier ka Creditors mein; contractor ka kaam (Sq M / Sq Ft naap) + advance Daily Work / Creditors mein.
  - **Har payment / advance ke saath:** tarikh, rakam, mode (Cash / UPI / NEFT / RTGS / Cheque), kis company account se, ref no. / cheque no., remark. Naya master: **Company bank accounts**.
  - **Hafte ka bhugtan:** har labour: kamai − advance = dena → "Pay" entry.
  - TDD: core (weekly din / OT / amount / dena), rules, server e2e — pehle fail, phir code.
- ✅ Store / Saman Register (25 Oct 2026, TDD): aaya (rate + GST + party + payment + bill + gaadi + samay), thekedar ko issue, wapas (Theek / Kharab / Toota / Kho gaya), kharch, doosri site transfer (us site ka TRANSFER_IN server banata hai), bade saman ke number (RCM-01, master ka prefix), service / repair history, consumable limit + "X din se wapas nahi" alert (Settings `store.overdueDays`, default 7), mahine ka statement (server `storeSummary/m_YYYY-MM`). Udhaar → party khate mein bill (`ledger/st_`); toota / kho gaya → thekedar ki katauti (`ledger/sr_`, default qty × aakhri kharid rate, badal sakte hain). Tests: core 109, rules 45, server e2e 44.
  - Baaki: bill ki photo (Daily Work ke photo ke saath — Drive); transfer sirf un site mein jo user ko dikhti hain.
  - Live run (25 Oct, Keshkal test): Sheet / Rod cutter (RCM-01, RCM-02) / GI pipe — aaya, issue, wapas (2 toote → Suraj par ₹1,800 katauti), kharch, Dantewada transfer — sab hisab sahi.
- ✅ Reports & PDF (25 Oct 2026, Rohit: "very imp"): naya Reports page + har module par "⬇ PDF" — Staff attendance & khata (mahina), Labour company / contractor (hafta ya mahina, OT, paid, baaki + head-count), Machinery (mahina: SR / CR / ghante / diesel / amount + rental bill), Material stock (tarikh se tarikh), Store register (mahina), Party / thekedar ledger (chalta baaki). Safed A4 kagaz, logo watermark, sign line; browser "Save as PDF" (Hindi sahi, free). Core `latestMarks`, `runningLedger`, `reportFileName` (TDD).
  - **Niyam:** har naye module (Daily Work → contractor ka kaam day-wise, Creditors → ledger payments, DPR) ka PDF usi waqt banega.
- ⏳ Baaki Phase 2: Daily Work + Drive photos (+ uska PDF), Creditors (+ PDF)

## Phase 1 — haal (24 Oct 2026) ✅
- ✅ core formule + jaanch (GSTIN / mobile / IFSC) — 61 tests
- ✅ Firestore rules (roles, project, 2-din lock, audit-in-batch, masters audit, soft-delete) — 27 emulator tests
- ✅ Design v2 OK (purane AI Studio app jaisa left sidebar)
- ✅ Web app test par: https://bpmc-site-test.web.app — Google / email-link login, access gate, Projects, Masters (Oil ke saath), Users & Roles, Edit History
- ✅ Server (Apps Script): core bundle, Firestore REST, `runHisab` (har 5 min, stock → days/), `bootstrapPhase1`, `installTriggers`
- ✅ Rohit ne bootstrap + triggers chalaye, Google login test par chala (24 Oct, 13:52)
- ✅ Settings & Backup screen; `dailyBackup` (roz ~11:30 IST) → har vault ka `Backup\<date> full.json`, same naam ho to v2, likh ke padh ke jaanch
- ✅ Recycle Bin page + Admin 'din kholo'; restore (restorePreview → RESTORE_CONFIRM → restoreRun, pehle backup); migration (core planMigration/verifyMigration + server runner); GitHub Actions encrypted doosri copy (secrets baaki)
- ⏳ Baaki: Rohit ke GitHub secrets; ek asli restore test

## Phase 0 — haal (24 Oct 2026) ✅
- Repo: https://github.com/rohitmishra8880/bpmc-site-app (private) — commit `c2abce3`
- Firebase `bpmc-site-test`: Spark, Firestore asia-south1, Google login ON. `bpmc-site-live` abhi baaki.
- Apps Script "BPMC Server (test)" + Sheet bana; Firestore REST connection verified (404 NOT_FOUND = access theek).
- Tests 2/2 pass, web build pass, emulator (JDK 21) pass — sab cache D: par.
- Obsidian: teeno vault ke `Memory\2026-10-24 app-phase0.json` likha (EMRS KESHKAL vault naya bana).

## 0. Setup ka haal

| Cheez | Haal |
|---|---|
| Node.js / npm / Git | v24.19.0 / 12.0.2 / 2.55.0 ✅ |
| npm cache | `D:\BPMC\.cache\npm` ✅ verified |
| TEMP / TMP | `D:\BPMC\.cache\temp` via `scripts\dev-env.ps1` ✅ verified |
| JDK 21 | `D:\BPMC\.tools\jdk21` (Temurin 21.0.12.1, checksum match) ✅ |
| Firebase CLI, clasp (Apps Script CLI) | `npx` se, project ke andar — global nahi |
| C: ka purana npm cache (4.9 GB) | nahi hataya — dusre tools (`@claude-flow/cli`, `chrome-devtools-mcp`) isse jude hain |

---

## 1. Architecture — 3 hisse, sab free

```
 PHONE (PWA app)                 FIRESTORE (free)                  GOOGLE APPS SCRIPT (free, Rohit ka account)
 ───────────────                 ────────────────                  ─────────────────────────────────────────
 sirf ENTRY + DIKHANA   ──────▶  entries / movements   ◀──────▶   ASLI HISAB (server)
 offline save, sync              (offline sync, rules)             • balance, opening/closing, recalc
 koi hisab nahi                  days/ dpr/ (sirf server           • machine rental, advance minus
                                 likhe)                            • DPR + PDF + versions
                                                                   • photos → Google Drive
                                                                   • Obsidian vault backup (Drive)
                                                                   • Google Sheet mein khata (dekhne ke liye)
                                                                   • email alerts
```

**Har hissa kya karta hai:**
1. **Phone app** — sirf entry form + dikhana. Network na ho to entry phone mein save, network aate hi upload. Balance / amount phone **calculate nahi karta**; server ka bheja hua number dikhata hai. Naya number aane tak "⏳ hisab ho raha" likha aata hai.
2. **Firestore** — data ka ghar + offline sync. Phone sirf entry likh sakta hai; hisab wale collection (`days`, `dpr`, `machineBills`) **sirf server likh sakta hai** (rules mein pakka).
3. **Apps Script** — server. Rohit ke Google account mein, ek Google Sheet ke saath juda. Har 5 minute naye / badle entry uthata hai, hisab karta hai, wapas Firestore mein likhta hai. Phone par "Abhi hisab karo" button bhi — dabate hi turant.

**Google Sheet database kyun nahi, sirf hisab + report kyun?** (pakka faisla, wajah ke saath)
- Sheet offline kaam nahi karti — site par network jaata hai.
- 5–10 log ek saath likhein to Sheet mein entry kat / ulat sakti hai; security niyam (kaun kya chhue) bhi nahi lag sakte.
- Isliye: **entry Firestore mein, hisab Apps Script mein, Sheet mein saaf khata** (Stock register, Machine bill, Party khata, Thekedar saman) — Rohit Sheet khol ke sab dekh / print / Excel download kar sakte hain. Sheet par sirf server likhta hai (haath se badlav agle run mein theek ho jata hai, taaki do sach na banein).

**Formule ek hi jagah:** `packages/core` (TypeScript) — wahi code bundle hoke Apps Script mein jaata hai (`clasp` se). Tests isi par chalte hain. Phone mein formula nahi.

**Libraries (free):** React 19, TypeScript, Vite, Tailwind, vite-plugin-pwa, Firebase JS SDK (offline cache), react-hook-form + zod, i18next, dayjs, Vitest, @firebase/rules-unit-testing, Playwright, @google/clasp, esbuild.

```
bpmc-site-app/
  packages/core/        ← formule + hisab engine (tested)
  apps/web/             ← phone app (entry + dikhana)
  apps/server/          ← Apps Script (core + Firestore REST + Drive + Sheet)
  .github/workflows/    ← doosra backup
  firestore.rules, scripts/, docs/
```

---

## 2. Database ka dhaancha (Firestore)

### 2.1 Har entry par common fields
`schemaVersion, projectId, businessDate (IST YYYY-MM-DD), createdBy, createdAt, createdDevice, updatedBy, updatedAt, rev, lastAuditId, deleted {at, by, reason} | null, serverStatus (PENDING / DONE / ERROR)`

### 2.2 Global collections
| Collection | Kya | Kaun likhe |
|---|---|---|
| `users/{email}` | naam, mobile, role, projectIds[], active, signature | Admin |
| `roles/{roleId}` | permissions (§4) | Admin |
| `settings/global` | company, rental niyam, shift ghante (8), alert limits | Admin |
| `projects/{pid}` | naam, code (KSK/DNT/KDG), location, client, timeline, budget, zones[], vault folder | Admin |
| `masters_materials` | Diesel, Gitti, Reti, Steel, Cement, Bricks, **Oil & Lubricants** … (§2.8) | **Users add / edit; delete = soft (reason)** |
| `masters_machines` | machine, owner (party), rateType, rate, driver, "kab se lagu" | Admin / users (setting) |
| `masters_contractors`, `masters_parties`, `masters_storeItems`, `masters_staff` | thekedar, vendor, saman, staff | 〃 |

### 2.3 Project ke andar — sab "movement"
`projects/{pid}/…`

| Sub-collection | Ek document = | Kaun likhe |
|---|---|---|
| `stockMoves` | material / diesel / oil — IN / USE / TRANSFER / ADJUST, qty + unit, rate, party, remark, machineId (agar machine ko diya) | phone |
| `machineLogs` | machine ka ek din — SR, CR, diesel, runStatus, breakdown samay, remark | phone |
| `machineDeductions` | **advance / site se diya saman** (§2.6) | phone |
| `labourMuster`, `staffAttendance`, `staffPassbook` | haazri, len-den | phone |
| `workEntries` | M³ / Sq M / Kg kaam | phone |
| `storeMoves`, `assets/{tag}` | saman register, RCM-01 | phone |
| `ledger` | party / thekedar khata entry | phone |
| `photos` | photo info (GPS, samay, Drive fileId) | phone + server |
| `auditLog` | har badlav ka record — sirf naya ban sakta hai | phone (rules se pakka) |
| `unlocks/{date}` | Admin ne din khola | Admin |
| `days/{date}` | din ka hisab: opening / in / out / closing | **sirf server** |
| `machineBills/{machine}_{YYYY-MM}` | mahine ka rental − advance = dena | **sirf server** |
| `dpr/{date}/versions/{v}` | DPR copy + PDF (Drive link) | **sirf server** |
| `serverRuns` | server ne kab kya hisab kiya, error | **sirf server** |

### 2.4 Hisab kaise pakka (single source of truth)
- **Phone ek "save" = ek batch:** entry + jude movement + audit ek saath (sab ya kuch nahi). Machine log ka diesel → usi batch mein `stockMoves` USE. Udhaar saman → party `ledger` BILL. Toota / kho gaya → thekedar RECOVERY. Transfer → A OUT + B IN.
- **Server (Apps Script) har run mein:** naye / badle entry uthao → jis sabse purani tarikh par badlav hua wahan se aaj tak `days/` dobara → machine bill dobara → jo locked din badle unki DPR ka naya version → Sheet update → entry par `serverStatus = DONE`.
- Balance = Opening + Inward − Uses; aaj ka opening = kal ka closing — **sirf server**. (galti #3, #10)
- Ek project ka hisab ek waqt mein ek hi run kare (LockService).
- Server Firestore ko Rohit ke account (owner) se likhta hai — isliye uske liye rules ki rok nahi, aur phone hisab wale collection chhoo nahi sakta.

### 2.5 Edit, lock, Admin ka Edit History ✅ (pakka niyam)
- Din D ki entry **D, D+1, D+2 raat 11:59 IST** tak koi bhi user edit kar sakta hai (24 Oct → 26 Oct raat 11:59). Har edit par chhota reason (dropdown).
- Uske baad din **apne aap LOCK**. Sirf Admin kholta hai (reason + kab tak, default aaj raat tak). Phir lock.
- **Admin ka Edit History section:** kisne kaunsi entry kholi, kya badla (purani → nayi), tarikh + samay, device, reason; Admin ne kaunsa din kab khola. Koi bhi (Admin bhi) mita nahi sakta.
- DPR Submit → v1. Baad mein badlav → server naya version (v2…) banata hai, note ke saath; purana safe.

### 2.6 Machine hisab ✅ (Rohit ka niyam)
Machine master: **rateType** DAY / MONTH / HOUR, rate, owner party, "kab se lagu".
Roz entry: **runStatus** FULL / HALF / HOUR / BREAKDOWN / ABSENT (+ kyun).

**DAY rate** (₹8,000/din): FULL 8,000 · HALF 4,000 · HOUR ghante × (8,000 ÷ 8) · BREAKDOWN / ABSENT 0.

**HOUR rate** (₹1,200/ghanta): ghante (CR − SR) × 1,200 → 7.8 × 1,200 = 9,360. BREAKDOWN / ABSENT 0.

**MONTH rate** (₹1,00,000/mahina):
- Din-rate = monthly ÷ **30** (hamesha) = 3,333.33.
- Poore mahine chali → **poora 1,00,000** (mahina 30, 31 ya 28 din ka — farak nahi).
- Na chalne ke din (breakdown / absent / koi bhi reason) → **din × 3,333.33 minus**.
  - Example: 2 din breakdown → 1,00,000 − 6,666.67 = **93,333.33**
  - HALF din = ½ din minus; HOUR = (8 − ghante) ÷ 8 din minus.
  - Minus kabhi 0 se neeche nahi.
- **Mahine ke beech aayi / gayi ✅ (Rohit):** jitne din site par nahi thi utne din × din-rate minus.
  - 20 Oct ko aayi → 1,00,000 − (1–19 = 19 din × 3,333.33) = **36,666.67**
  - 10 Oct ko gayi → 1,00,000 − (11–31 = 21 din) = **30,000**

**Advance / site se liya — bill mein minus** (`machineDeductions`):
| Type | Example |
|---|---|
| Driver ko advance | ₹2,000 nakad driver ko |
| Owner ko advance | ₹20,000 UPI owner ko |
| Machine banane ke liye site se | repair ka saman store se (store movement se juda) / nakad mistri ko |
| Site se diesel / oil (agar rate "diesel owner ka" hai) | machine master mein option: diesel site ka / owner ka |

**Mahine ka machine bill** (server banata hai):
`Rental (upar ke niyam se) − Advance − Site se liya = Dena (net payable)` → owner party ke khate mein bill. PDF + Sheet mein.

### 2.7 Photos → Google Drive
1. Phone photo khichta hai (GPS + samay), compress karke Firestore mein bhejta hai (offline ho to baad mein).
2. Server (Apps Script) photo ko **Rohit ki Drive** mein project vault ke `Photos\2026\10-October\` mein rakhta hai, Firestore se bhari copy hata ke sirf Drive link + chhota thumbnail rakhta hai.
3. Isse Firestore free jagah bachti hai; photos Drive (15 GB free, Rohit ke account ka) mein. Drive ki jagah 80% bharne par alert.

### 2.8 Inventory — Oil & Lubricants + item manage ✅
- Naye item group: **Oil & Lubricants** — Engine oil, Hydraulic oil, Gear oil, Grease, Coolant, Brake oil … (aur user jode).
- Material item par user ke liye **Add / Edit / Delete** button. Delete = soft-delete + reason (Recycle Bin se Admin wapas la sake). Jis item par entry ho chuki, uska naam badle to purani entry bhi naye naam se dikhegi (ID se juda).
- **Quantity / unit:** har item ki base unit (Ltr / Kg / Nos …) + entry ke waqt unit chunna: Ltr, ml, Kg, Nos, Bucket (20 L), Drum (210 L), Barrel, Bags (50 kg), cu.m, MT. App khud base unit mein badalta hai (2 Bucket = 40 Ltr). Container ka size item par set kar sakte hain.
- **Remark** har entry par (likhna zaroori nahi).
- Oil machine ko diya → us machine ke log / service history mein bhi dikhe; "site ka oil" ho to machine bill mein minus ka option.
- Min stock limit → kam hone par alert.

### 2.9 Migration
`schemaVersion` har document par. Migration: backup → dry-run report → chalaao → check (gin-ti + jod) → `migrations/` record. Pehle test, phir live (OK ke baad).

---

## 3. Screens (mobile-first)

Neeche tab bar: **Dashboard · Entry (+) · DPR · Store · More**. Header: site switcher, sync (🟢 / 🟡 offline / ⏳ hisab ho raha), alerts, profile.

| # | Screen | Andar kya |
|---|---|---|
| 1 | Login | **Google login (mukhya)** / email link (backup — Spark par roz 5 email) |
| 2 | Dashboard | attendance, diesel balance, progress, active machines, alerts, quick actions, recent activity |
| 3 | Projects | list, detail, zones, timeline, budget, switcher |
| 4 | Inventory / Material Hub | Old / New / Uses / Balance; **Oil & Lubricants**; item add / edit / delete; unit + remark |
| 5 | Store / Saman Register | Inward, Issue, Return, Transfer, Consume; thekedar-wise baaki; RCM-01 + service; monthly statement |
| 6 | Machinery | daily log, breakdown register, **advance / deduction**, **monthly machine bill**, rental report |
| 7 | Attendance | labour muster, staff haazri, KYC + passbook |
| 8 | Daily Work | M³, Sq M, Kg, photos |
| 9 | Creditors / Party Ledger | khata, bill, payment, bakaya, GST |
| 10 | DPR | preview → Submit → PDF / print / WhatsApp; versions; weekly / monthly |
| 11 | Alerts | breakdown, low stock, saman wapas nahi, backup, jagah bhar rahi |
| 12 | AI Insights | Phase 4 (free vikalp, §8) |
| 13 | Help Center | concrete mix, TMT weight, SOP, contacts |
| 14–21 | Admin | Settings · Users & Roles · **Edit History** · Activity Log · Recycle Bin · Din kholna · Backup & Restore · Server status (aakhri hisab kab) |
| 22 | Profile | naam, signature, Hindi / English |

### 3.1 Dashboard ka design (frontend design — top quality) ✅
Rohit ki maang: dashboard ka design ekdum badhiya ho. Iske niyam:
- **Pehle design, phir code:** Phase 1 mein Dashboard + 2 entry screen ka clickable design (phone + laptop) banega → Rohit OK kare → tab hi baaki screens isi design system par.
- **Site ke liye bana look:** gehra slate / site-board rang + safety-yellow accent; status ke rang har jagah ek jaise (🟢 theek, 🟠 dhyaan, 🔴 critical). Dhoop mein padh sake — high contrast, "Dhoop mode".
- **Bade number:** diesel, stock, haazri — bade, saaf, ek line mein barabar (tabular) number; ₹ Indian format; unit hamesha number ke saath.
- **Font:** Hindi + English dono ke liye ek hi parivaar (jaise Mukta / Hind — free Google Fonts), taaki toggle par layout na hile.
- **Kam padhe-likhe ke liye:** 48px+ bade button, icon + shabd dono, kam typing, ek screen par ek kaam.
- **Card par click = poora hisab:** har dashboard card dabane par wahi movements ki list jisse number bana (galti #1, #4 kabhi nahi).
- **Light / Dark** dono, phone pehle, laptop par wide layout (sidebar + 3-column cards).
- **Design check:** har phase mein design critique + accessibility (contrast, touch size) review; "frontend-design" skill (Anthropic, free plugin) bhi use kar sakte hain.

---

## 4. Roles & access
| Permission | Admin | Site User |
|---|---|---|
| entry create / edit (2 din window, reason) | ✅ | ✅ |
| material item add / edit / soft-delete | ✅ | ✅ |
| entry soft-delete (2 din window, reason) | ✅ | ✅ |
| DPR banana / submit / share | ✅ | ✅ |
| locked din kholna, Edit History, Activity Log, Recycle Bin, Users, Roles, Settings, Backup | ✅ | ❌ |
| permanent delete | ❌ kisi ko nahi | ❌ |

Admin user ko email se jodta hai + project deta hai; login usi user ke email / Google par. Pehla Admin: rohitmishra.p@gmail.com. Role = permission list → aage Munshi / Accountant / Site Incharge bina code badle.

---

## 5. Backup ✅ (best tareeka chuna)

| Parat | Kaun | Kab | Kahan |
|---|---|---|---|
| A. **Obsidian vault** | Apps Script | DPR submit / naya version par + roz raat 11:30 IST | Rohit ki Drive → `AI obsidian\<project vault>\…` → laptop G: par khud sync |
| B. **Poora JSON backup** | Apps Script | roz raat | har vault ka `Backup\` folder |
| C. **Doosri copy** | GitHub Actions (private repo) | roz 11:45 PM IST | encrypted JSON, 90 din (Google account mein dikkat ho tab bhi bacha rahe) |
| D. Drive ka apna version history + Trash | Google | lagatar | 30 din |

```
G:\My Drive\AI obsidian\<project vault>\
  Daily Report\2026\10-October\2026-10-24 DPR.md | .json | .pdf
  Backup\2026-10-24 full.json
  Photos\2026\10-October\
  Store Register\  Machinery\  Ledger\  Memory\
```
- Laptop on hona zaroori **nahi** — Apps Script Google ke server par chalta hai.
- Purani files (Dantewada root ki `DPR_2026-10-xx.json` waghaira) **nahi chhuega**; same naam ho to `… v2`.
- Khaali file kabhi nahi — entry na ho to "Is din koi entry nahi".
- `EMRS KESHKAL` vault naya; Kondagaon: `kondagaon site\kondagaon pawada anicut`.
- Restore: backup chuno → preview → OK → restore (pehle current ka backup).

---

## 6. Free limits *(Phase 0 mein official docs se check kiya, 24 Oct 2026)*

**Phase 0 ki jaanch ke pakke nateeje:**
- ✅ **Firebase Storage Spark par band hai** (Blaze zaroori) — photos Drive mein rakhne ka faisla sahi.
- ⚠️ **Email link login: Spark par roz sirf 5 email.** Isliye **Google login mukhya** (koi limit nahi); email link sirf bina-Gmail wale ke liye backup.
- ✅ Apps Script (gmail account): triggers roz **90 min**, URL fetch roz **20,000**. Google ke mutabik yeh limits bina bataye badal sakti hain — server runtime roz monitor hoga.
| Cheez | Free limit | Hamara use |
|---|---|---|
| Firestore | 1 GiB, roz 50K read / 20K write | photos Drive mein, server sirf badla hua padhe |
| Apps Script (gmail account) | ek run 6 min, triggers roz 90 min, URL fetch roz 20,000, email roz 100 | har 5 min run ~5 sec → roz ~25 min |
| Firebase Auth | Google login: koi limit nahi · email link: roz 5 email | Google login mukhya |
| Google Drive | 15 GB (Rohit ka account, Gmail ke saath share) | photos + PDF; 80% par alert |
| Hosting | 10 GB, roz 360 MB | kaafi |
| GitHub Actions (private) | 2,000 min / mahina | roz ~2 min |

---

## 7. Phase plan
| Phase | Kya banega |
|---|---|
| **0. Taiyari** | git + private GitHub repo, monorepo, 2 Firebase project (test + live, Spark, card nahi), Apps Script project + Sheet (test + live), clasp, Firestore se Apps Script ka connection test, free limits verify |
| **1. Neenv** | `core` formule + tests, login, roles + rules + rules tests, projects (Keshkal, Dantewada, Kondagaon), masters (Oil & Lubricants ke saath), audit + Edit History, 2-din lock + Admin unlock, soft-delete + Recycle Bin, server run loop, backup A–C, migration framework |
| **2. Entry** | Attendance, Inventory (unit / remark / add-edit-delete), Store / Saman, Machinery (Day / Month / Hour + advance + monthly bill), Daily Work + Drive photos, Creditors; offline |
| **3. Report** | Dashboard, DPR (submit, version, PDF, WhatsApp), alerts (app + email), Obsidian DPR, Sheet khata |
| **4. Extra** | Help Center, AI Insights, poori Hindi, voice entry, weekly / monthly report |

Har phase ke end: test link, kya bana, tests, agla phase, risk + Obsidian `Memory\` JSON.

**Tests (pass bina aage nahi):** 246+600−200 = 646 · 2951.8−2944.0 = 7h 48m · 10×5×2.41 = 120.50 M³ · 16mm×12m = 18.96 kg · Day 8,000 half = 4,000 · Hour 7.8×1,200 = 9,360 · Month 1,00,000 Oct (31 din) poora chala = 1,00,000 · Feb (28) poora = 1,00,000 · 2 din breakdown = 93,333.33 · Advance 20,000 minus → 73,333.33 · 2 Bucket (20 L) = 40 Ltr · Gitti 0+50−30 = 20 · 20 Oct edit → 21–23 Oct theek · 27 Oct ko 24 Oct ka edit → mana · Admin unlock ke baad → ho jaye · phone `days/` likhe → mana.

---

## 8. Free plan ki seemayein
- **Hisab 5 min tak der se** (ya "Abhi hisab karo" button). Turant phone par number nahi badlega — "⏳" dikhega.
- **Network na ho** to entry phone mein save rahegi, par naya balance network aane + server run ke baad.
- **Push notification nahi** — app mein alert + Admin ko **email alert** (free) + WhatsApp share button.
- **Drive 15 GB** Gmail ke saath share hai — photos se bharega, alert milega.
- **AI Insights:** paid API nahi lenge. Phase 4 mein free vikalp (Gemini free tier — seemit, aur free tier ka data Google use kar sakta hai — ya bina AI "smart summary").

---

## 9. Khule sawaal
Abhi koi nahi. (Mahine ke beech machine wala niyam §2.6 mein tay ho gaya.)

---

## 10. 3 mahine baad: Cloud par transfer (reminder set ✅)
Free version **24 Oct 2026 → 24 Jan 2027** chalega. **24 Jan 2027, subah 10 baje** reminder aayega (Claude app ka scheduled task `bpmc-cloud-upgrade-reminder`; app band ho to agli baar khulne par). Memory mein bhi save hai.

Code aaj se hi aisa banega ki shift aasaan ho: hisab `packages/core` mein (Apps Script → Cloud Functions bina formula badle), photo / backup ke liye alag adapter.

**Cloud (Firebase Blaze) mein kya addon aur fayda** *(kharcha reminder ke waqt aaj ke rate se dobara nikalenge)*:
| Addon | Fayda site par |
|---|---|
| Cloud Functions | hisab **turant** (5 min wait nahi), "⏳" khatam |
| Push notification | breakdown / low diesel ka alert **turant phone par**, app band ho tab bhi |
| Firebase Storage | photos alag store, Firestore / Drive ki jagah ki chinta nahi |
| Firestore PITR + roz managed backup | kisi bhi minute ka data wapas (7 din), 14 hafte ke backup |
| Mobile SMS OTP | bina email wale supervisor bhi mobile se login |
| AI Insights (Claude API) | "is hafte diesel zyada kyun laga?" jaise sawaal ka asli data se jawab |
| Scheduled reports | roz / hafte ki DPR khud email / WhatsApp par |
| Zyada limits | zyada users / sites / photos bina rukawat |

Transfer ka tareeka: poora backup → test project par Blaze + migration → check → live. Khud se koi paid plan ON nahi hoga — Rohit ka OK zaroori.
- ✅ Labour edit / Left site (purana hisab safe), payment edit / delete (2 din, phir Admin unlock), labour hafta-wise + staff mahina-wise statement (server) — TDD: core 99, rules 42, server e2e 26
