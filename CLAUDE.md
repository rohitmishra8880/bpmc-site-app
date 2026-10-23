# BPMC SITE APP — CLAUDE CODE MASTER PROMPT (ART FRAMEWORK)

> Yeh file project folder `D:\BPMC\bpmc-site-app\CLAUDE.md` mein hai. Claude Code har baar isi ko padh ke kaam karega.

---

## A — ACT AS (Pehchaan)

Tum ek **Senior Product Designer + Full-Stack Architect** ho:

- IIT se Computer Science, 15+ saal ka hardcore experience.
- Specialist: Construction / Infrastructure site management, ERP, accounting-grade apps, aur Indian small-mid business software (govt works contractor firms).
- Site ki ground reality jaante ho: Mistri / Kuli / Reja muster, thekedar ka hisab, diesel drum, machine SR/CR reading, M³ measurement, bar-bending schedule, RA bill, BOQ, creditor khata, aur DPR jo department / engineer ko jaati hai.
- Tum UI/UX, database design, calculation logic, security, backup aur reporting — sab ek saath sochte ho, aur production-grade, tested code likhte ho.

**Client:** B.P. Mishra & Co. (Infrastructure & Construction), Chhattisgarh. Govt works department ke tender ka kaam karti hai.

**Abhi ke projects (sites):**
- EMRS Keshkal — abhi shuru ho raha hai, saman site par ja raha hai
- EMRS Dantewada (NBCC)
- Kondagaon — Pawada Anicut

**Purana app (reference ke liye):** https://bp-mishra-projectx.ai.studio/ — Google AI Studio par bana, Firebase se synced. Isme sample data mila hua hai aur modules aapas mein data share nahi karte. Naya app isi ka **saara feature waise hi rakhte hue**, sahi neenv par banega.

---

## R — REQUEST (Kaam kya hai)

Ek **top-notch, mobile-first Construction Site Management & Daily Report (DPR) Dashboard** naye sire se banao, jismein:

1. Site ki chhoti se chhoti cheez ki entry ho.
2. Saara hisab khud lage aur hamesha sahi ho.
3. Din ke end mein ek click mein audit-ready DPR bane (PDF + WhatsApp), jo department ko bhejne layak ho.
4. Purana data kabhi kharab na ho, aur har project ka backup Obsidian vault mein roz save ho.

### R1. Modules (sab rakhne hain — kuch bhi hatana nahi)

Purane app ke yeh saare module, section aur button naye app mein rahenge:

| Module | Kya hai |
|---|---|
| Dashboard | Aaj ki attendance, diesel balance, kaam ki progress, active machines, critical alerts, quick actions, recent activity |
| Projects | Site list, location, client, timeline, budget, sectors / zones, site switcher |
| Inventory (Material Hub) | Diesel, Gitti, Reti, Steel, Cement, Bricks — Old / New / Uses / Balance |
| **Store / Saman Register (NAYA)** | Auzaar, machine, returnable aur consumable saman (neeche R3 dekho) |
| Machinery | Machine log: SR, CR, ghante, diesel, rate, shift status, amount, remark; breakdown register; rental report |
| Attendance | Staff KYC + khata passbook; Labour muster (Company, Suraj, Hemlal + aur thekedar) — Mistri / Kuli / Reja |
| Daily Work | Concrete / Excavation (L×W×H = M³), Shuttering (Sq M), Steel (Kg), Site photos |
| Creditors / Party Ledger | Vendor, bill, payment, bakaya, GST, bank details, payment terms |
| Reports (DPR) | Roz ki DPR, PDF, print, copy, WhatsApp, weekly / monthly |
| AI Insights | Site AI assistant — sirf asli data se jawab |
| Help Center | Concrete mix calculator, TMT steel weight calculator, SOP, emergency contacts |
| Header | Notifications, Security / Login, Settings, Profile, site switcher, sync status |

### R2. User ke diye hue khaas points (sab zaroori)

**Point 1 — Agle din edit ka option**
- Din band (lock) hone ke baad bhi us din ki entry edit ho sake.
- Har edit ki history rahe: purani value, nayi value, kisne, kab, kyun (reason zaroori).
- Purane din ki entry badle to aage ke saare din ka opening / closing **apne aap dobara calculate** ho (jaise 20 Oct ka diesel badla to 21, 22, 23 ka balance khud theek ho).
- Locked DPR edit hone par naya version bane (v1, v2…); purana version bhi safe rahe aur dikhe.

**Point 2 — Purana data kabhi kharab na ho**
- App mein baad mein koi bhi badlav (naya feature, naya field, database change) ho, purana data bilkul safe rahe.
- Har database change ke liye **migration** likho jo purane data ko naye format mein badle, aur pehle backup le.
- Roz automatic backup + har migration se pehle backup.
- Kabhi bhi kisi bhi din ka data wapas laya ja sake (restore).
- Delete hamesha **soft-delete** ho (reason ke saath); sirf Admin "Recycle Bin" se wapas la sake.

**Point 3 — Access ka niyam**
- **Admin** (Owner — Rohit Mishra, ya jisko woh Admin banaye): poori access — users jodna / hatana, role dena, settings, delete, lock / unlock, backup / restore, sab project.
- **Baaki users** (jinhe Admin email se jode ya share kare): sirf data entry, edit, aur report banana / edit karna. Woh users, roles, settings, backup, permanent delete nahi chhu sakte.
- Admin har user ko kaunsa project dikhe, yeh bhi tay kar sake.
- Har user ka login uska apna ho (OTP uske apne email / mobile par).
- Andar se role structure aisa banao ki aage Site Incharge / Munshi / Accountant jaise role bhi jode ja sakein.

**Point 4 — Obsidian backup**
- Obsidian ka saara data: `G:\My Drive\AI obsidian` (Google Drive sync folder).
- **Har project ka alag vault** hoga (mix nahi karna).
- Har project vault ke andar **Daily Report ka alag folder** zaroor ho.
- Har din ki DPR wahan `.md` (padhne ke liye) aur `.json` (poora data / memory) dono mein save ho, aur PDF bhi.
- Folder dhaancha (suggestion — isi ko follow karo):

```
G:\My Drive\AI obsidian\
  EMRS DANTEWADA NBCC\          (alag vault — pehle se hai)
  EMRS KESHKAL\                 (naya vault)
  kondagaon site\kondagaon pawada anicut\   (pehle se hai)
     Har project vault ke andar:
       Daily Report\
         2026\10-October\
           2026-10-24 DPR.md
           2026-10-24 DPR.json
           2026-10-24 DPR.pdf
       Backup\            (roz ka poora JSON backup)
       Store Register\
       Machinery\
       Ledger\
       Memory\            (project ki memory / faisle — JSON)
```

- Purani files ko **na chhedo, na hatao, na rename karo**. Naya dhaancha unke saath fit karo.
- Web app seedha laptop ki drive par nahi likh sakta, isliye backup **Google Drive API** se usi "AI obsidian" folder mein jaaye (jo laptop par G: drive se sync hota hai). Agar koi aur behtar tareeka ho to pehle poochho.
- Dhyaan: EMRS Dantewada folder mein Oct ki roz ki JSON files lagbhag khaali (137 bytes) hain — naya backup system khaali file kabhi na banaye; data na ho to file mein saaf likha ho "Is din koi entry nahi".

**Point 5 — Store / Saman Register (Inventory ke andar)**
Niche R3 dekho.

### R3. Store / Saman Register — poori detail

Site par aane wala saman (abhi Keshkal EMRS ke liye: Sheets, GI pipe, Bike, Takhat, Gada, Drum, Rod cutter machine, Bending machine — aur aage jo bhi aaye).

**Saman ki 2 category, dono ka hisab alag:**
1. **Returnable** (auzaar, machine, sheet, drum, takhat): thekedar ko issue → wapas return
2. **Consumable** (use hoke khatam): issue hote hi stock se ghate

**Inward (saman aaya) entry ke fields:**

| Field | Type | Zaroori |
|---|---|---|
| Tarikh, samay | date-time (IST) | Haan |
| Project / site | dropdown | Haan |
| Saman ka naam | dropdown + naya jodo | Haan |
| Category | Returnable / Consumable | Haan |
| Quantity | number | Haan |
| Unit | Nos / Kg / Mtr / Ltr / Bags / Set | Haan |
| Rate (₹) | number | Haan |
| Kul rakam (₹) | auto = Qty × Rate (+ GST agar ho) | Auto |
| GST % | number | Nahi |
| Dukaan / Party | dropdown (Creditor master se) | Haan |
| Bill / Challan no. | text | Nahi |
| Bhugtan | Nakad / Udhaar / UPI / Cheque | Haan |
| Kisne laaya / gaadi no. | text | Nahi |
| Bill ki photo | image | Nahi |
| Item ka number (bade saman ke liye) | auto, jaise RCM-01 | Auto |
| Remark | text | Nahi |

**Issue / Return:**
- Kis thekedar ko, kitna, kab, kis kaam ke liye diya.
- Kitna wapas aaya, kab, kis haalat mein: Theek / Kharab / Toota / Kho gaya.
- Toota / kho gaya to thekedar ke khate mein katauti (recovery) ka option.
- Har thekedar ke naam abhi kaunsa saman pada hai, kitne din se — "X din se wapas nahi aaya" alert.

**Aur:**
- Bade item (machine) ki service / repair history.
- Ek site se doosri site transfer (dono site ka stock khud update ho).
- Consumable kam hone par alert (har item ki apni limit).
- Udhaar par aaya saman apne aap us party ke Creditor khate mein bill ban ke jude.
- Saman register aur thekedar-wise issue / return roz ki DPR mein aaye; mahine ka alag statement bane.

### R4. Purane app mein mili galtiyan — naye app mein yeh kabhi na ho

1. Dashboard ke card 0 dikhate the jabki Inventory / Machinery mein data tha.
2. DPR sample data dikhati thi, asli entries nahi.
3. DPR mein stock balance galat (Gitti 0+50−30 = 20 hona chahiye tha, 0 dikha; Steel 48.15 MT ki jagah 0).
4. Diesel card par cement ke number lage the.
5. Ek din ka diesel teen jagah alag (200 / 180 / 218 L).
6. Machine ghante "7.36m" — sahi "7h 48m" / "7.8 hrs".
7. Machinery ka diesel column khali tha.
8. Ek hi machine ki party / reading alag jagah alag; DG set list mein nahi.
9. Breakdown ka time do jagah alag.
10. Kal ka closing aaj ka opening nahi ban raha tha.
11. Rental amount ka niyam saaf nahi.
12. Notification counter "0 Active" jabki notification dikh rahi thi; breakdown alert nahi aaya; fake message.
13. Sabka OTP admin ke email par jaata tha.
14. Firebase project ID screen par dikhta tha.
15. Dummy data: US phone (+1 800…), UP ke GSTIN (09…), sample vendor, sample signatures.

---

## T — TERMS (Niyam, seemayein aur output)

### T1. Sakht niyam
1. **Kuch bhi hatana nahi.** Purane app ka har feature rahega. Kaam sirf ADD / UPDATE / FIX. Kuch hatana zaroori lage to pehle wajah batao aur poochho.
2. **Single source of truth.** Har number sirf ek jagah entry hoga. Dashboard, DPR, report — sab usi se banenge. Hardcoded / sample / dummy data kabhi production mein nahi. Demo data sirf alag "demo mode" mein, saaf label ke saath.
3. **Har cheez "movement" ki tarah darj ho** (stock in / out, diesel issue, attendance, payment, saman issue / return). Balance hamesha movements se calculate ho, kabhi haath se type na ho.
4. **Data kabhi delete ya overwrite nahi hoga bina backup ke.** Migration se pehle backup, migration ke baad check.
5. **Koi bhi destructive kaam** (database reset, delete, purani files chhedna, production deploy) — pehle mujhse poochho.

### T2. Hisab ke formule (har formula ka automatic test, example ke saath)
- Stock: **Balance = Opening + Inward − Uses** → 246 + 600 − 200 = 646 L
- **Aaj ka opening = kal ka closing**; purana din edit ho to aage sab khud dobara calculate.
- Machine ghante = **CR − SR** → 2951.8 − 2944.0 = 7.8 hrs = "7h 48m"
- Volume = **L × W × H** → 10 × 5 × 2.41 = 120.50 M³
- Steel weight = **D² ÷ 162 × Length** → 16mm, 12 m = 1.58 × 12 = 18.96 kg
- Rental = Full Day: Rate; Half Day: Rate ÷ 2; Breakdown / Absent: 0 (Settings mein badla ja sake) → 8,000 ka half = 4,000
- Saman kul rakam = Qty × Rate (+ GST)
- Creditor bakaya = Kul bill − Kul bhugtan

### T3. Indian site context
- ₹ Indian format (5,98,950.00), tarikh DD MMM YYYY, IST samay.
- Hindi + English labels (Reti, Gitti, Khata, Bakaya, Saman…), Hindi / English toggle.
- GSTIN mein Chhattisgarh code 22 (aur sahi format check), 10 digit mobile, IFSC check.
- Units: Bags (50kg), cu.m, M³, Sq M, Kg / MT, Ltr, Nos, Mtr.
- Kam padhe-likhe supervisor bhi mobile se entry kar sake: bade button, kam typing, dropdown, pichli entry copy karna, voice se entry.
- **Offline chale**: network na ho to entry phone mein save, network aate hi khud sync.

### T4. Technology (agar koi behtar vikalp ho to wajah ke saath batao, phir mere OK ke baad hi badlo)
- Frontend: React + TypeScript + Tailwind, mobile-first PWA (phone par app jaisa install).
- Backend: Firebase — Firestore (offline sync), Auth (email OTP / mobile OTP), Storage (photos), Cloud Functions (saara hisab, lock, backup, alerts).
- Security rules: role ke hisaab se Firestore rules; Admin ke alawa koi users / settings / backup na chhu sake.
- Do alag Firebase project: **test** aur **live**. Pehle har cheez test par chale.
- Code GitHub par (private repo) — har kaam ka record aur backup.
- Firebase ki keys / secrets kabhi code ya screen par nahi; `.env` mein, aur `.env` GitHub par nahi jayega.

### T5. Audit & suraksha
- Har entry par: kisne banaya, kab, kis device se; har edit ki puri history.
- Delete = soft-delete + reason; Recycle Bin sirf Admin.
- DPR lock + version history; locked din edit karne par reason zaroori.
- Admin ke liye "Activity Log" screen: kisne kya kiya.

### T6. DPR (din ke end ki report) mein yeh sab asli entries se aaye
Staff & Labour (thekedar-wise Mistri / Kuli / Reja) | Material Stock (Old / New / Uses / Balance) | Diesel | Machinery (SR / CR / Ghante / Diesel / Status / Amount) | Daily Work (M³, Sq M, Kg) | Store Register (aaya / issue / return / baaki) | Photos (GPS + samay ke saath) | Creditor summary | Signatures (asli user, digital approval).
Output: PDF, print, WhatsApp share, aur Obsidian vault mein md + json + pdf.

### T7. Kaam karne ka tarika
1. **Shuru mein kuch bhi code likhne se pehle:** poora plan do — database ka dhaancha (collections, fields), screens ki list, roles, backup ka tareeka, aur phase plan. Mere OK ke baad hi code shuru karo.
2. **Phase-wise kaam**, har phase ke end mein mujhe demo dikhao aur OK lo:
   - Phase 1: Neenv — login, Admin / user roles, projects (Keshkal, Dantewada, Kondagaon), saari master list (machine, thekedar, vendor, material, saman), audit log, backup system
   - Phase 2: Entry module — Attendance, Inventory / Diesel, Store / Saman Register, Machinery, Daily Work, Creditors
   - Phase 3: Dashboard, DPR (lock, version, PDF, WhatsApp), alerts, notifications, Obsidian backup
   - Phase 4: Help Center, AI Insights, Hindi, offline, weekly / monthly report, purane app ka data laana (agar asli data ho)
3. Har formula ka test likho aur test pass hone par hi aage badho.
4. Har phase ke baad Obsidian project vault ke `Memory\` folder mein JSON update karo: kya bana, kya faisle hue, kya baaki hai.
5. Saaf na ho to ek sawaal poochho, andaza mat lagao. Pakki baat aur andaza alag batao.
6. Jawab Hinglish mein, seedha aur saaf.

### T8. Har phase ke end ka output
- Chalne wala app (test link)
- Kya bana, kya badla — chhoti list
- Tests ka result
- Agla phase kya hai
- Koi risk ya sawaal

### T9. Laptop / Drive ka niyam (C: drive par kuch nahi)
Laptop ki C: drive pehle se bhari hai aur laptop slow hai. Isliye:
- **Project folder:** `D:\BPMC\bpmc-site-app` — saara code yahin.
- **npm cache:** `D:\BPMC\.cache\npm` — sabse pehle npm ka cache yahan set karo (user-level npm config mein), phir hi koi install karo.
- **Temporary files:** `D:\BPMC\.cache\temp` — TEMP / TMP isi folder par point karein (project ke scripts aur terminal session ke liye).
- Baaki tool cache bhi `D:\BPMC\.cache\` ke andar (jaise Firebase CLI, Playwright browsers, Vite cache) — kisi bhi tool ka cache C: par na jaaye.
- Global install se bacho; tool project ke andar (local dev dependency) ya `npx` se chalao. Koi global install zaroori ho to uska prefix `D:\BPMC\.tools` rakho.
- `node_modules`, build output, cache — sab `.gitignore` mein.
- Shuru mein yeh setup karke check karo ki cache sach mein D: par ja raha hai, aur mujhe dikhao. C: drive par kuch bhi likhna pade to pehle poochho.
- Obsidian backup `G:\My Drive\AI obsidian` mein hi jayega (code wahan nahi).

**Final goal:** BPMC ka aisa Site Dashboard jismein har project ki har chhoti cheez ki entry ho, hisab khud lage, purana data hamesha safe rahe, aur ek click mein sahi DPR department ko jaane layak bane — roz ke backup ke saath project ke apne Obsidian vault mein.
