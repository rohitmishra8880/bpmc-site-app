# Phase 0 — Rohit ke haath ke kaam (sirf ek baar)

Yeh kaam aapke Google / GitHub account se login maangte hain, isliye main khud nahi kar sakta.
**Har Google login (Firebase, Apps Script, Drive) `rohitmishra.p@gmail.com` se hi karna** — `bpmishraprojectx@gmail.com` se nahi. Sab **free** hai — kahin card / billing mat daalna. Har step ke baad mujhe chat mein "ho gaya" bol dena.

---

## 1. Firebase — 2 project (test + live) · ~10 min
1. Kholo: https://console.firebase.google.com → **Create a project**.
2. Naam: `bpmc-site-test` → Google Analytics **OFF** → Create. Plan **Spark (free)** hi rehne do (Upgrade mat dabana).
3. Project ke andar:
   - **Build → Firestore Database → Create database** → location **asia-south1 (Mumbai)** → **Production mode** → Create.
   - **Build → Authentication → Get started → Sign-in method** → **Google** Enable (support email: aapka) → Save. Phir **Email/Password** → sirf **Email link (passwordless sign-in)** ON → Save.
   - **Project settings (⚙) → Your apps → Web (</>)** → naam `bpmc-web` → Register. Jo `firebaseConfig` dikhe (apiKey, authDomain, projectId, appId) — chat mein bhej do. *(Yeh secret password nahi hai, par phir bhi GitHub par nahi jayega — `.env.local` mein rakhunga.)*
4. Yahi sab dobara `bpmc-site-live` naam se. Live ka config abhi rakh lo, Phase 1 ke end tak use nahi hoga.

## 2. Terminal se Firebase login · 1 min
Claude app ke Terminal panel mein yeh chalao (browser khulega, apne Gmail se Allow):
```bash
npx --prefix D:\BPMC\bpmc-site-app firebase login
```

## 3. Apps Script (server) · 2 min
1. Kholo: https://script.google.com/home/usersettings → **Google Apps Script API** ko **ON**.
2. Terminal mein (browser khulega, Allow):
```bash
npx --prefix D:\BPMC\bpmc-site-app clasp login
```

## 4. GitHub private repo · 3 min
1. Kholo: https://github.com/new → naam `bpmc-site-app` → **Private** → README / .gitignore **mat** jodna → Create.
2. Repo ka URL chat mein bhej do (jaise `https://github.com/<aapka-naam>/bpmc-site-app`).
3. Pehli baar push par Git ek browser window kholega — GitHub se login karke Allow.

---

**Uske baad main karunga:** `.firebaserc` mein test / live jodna, Apps Script + Google Sheet (test) banana, Apps Script → Firestore connection test, aur pehla GitHub push — phir Phase 0 ka demo.
