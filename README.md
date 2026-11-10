# InternIQ — AI-Assisted Career & Internship Matching Platform

Working prototype of the senior-project system for **St. Mary's University Career Services** (Ethiopia). It is the demo surface for the full project: students upload a CV, an NLP pipeline reads it, every internship posting gets an explainable compatibility score, employers rank and shortlist applicants, and Career Services sees the whole register plus a measurement of the engine's own accuracy.

Stack: **React 18 + Vite 5** front end, **Node/Express** REST API, **PostgreSQL** data layer.

---

## 1. Quick start

The project is **not** in your home folder. Open a terminal and go to the full path first — on Windows, `cd` needs `/d` to change drive-relative paths:

```bat
cd /d C:\Users\dell\Documents\Qoder\2026-10-30\faabea18\interniq
```

Then:

```bat
npm install          # once, installs `concurrently` (the only root dependency)
npm run dev          # API on :4000 + web on :5173, one command
```

`server/` and `client/` dependencies are already installed in this checkout, so `npm run setup` is only needed on a fresh clone.

Open **http://localhost:5173** — the URL Vite prints is authoritative, so use whatever it reports. If another app on your machine already holds that port, Vite silently picks the next free one; to pin it:

```bat
cd client && npx vite --port 5180 --strictPort
```

### Two terminals (avoids needing `concurrently` at the root)

```bat
cd /d C:\Users\dell\Documents\Qoder\2026-10-30\faabea18\interniq\server && npm run dev
cd /d C:\Users\dell\Documents\Qoder\2026-10-30\faabea18\interniq\client && npm run dev
```

The client proxies `/api` to `:4000`, so either layout works.

### Open it on your phone

Vite binds to loopback by default, so a phone on the same Wi-Fi gets "site can't be reached". `npm run dev:mobile` is the same stack with `vite --host 0.0.0.0`, which also listens on your LAN address:

```bat
cd /d C:\Users\dell\Documents\Qoder\2026-10-30\faabea18\interniq
npm run dev:mobile
```

Read the **Network** line Vite prints (it looks like `http://192.168.x.x:5173/`) and open that on the phone. The `/api` proxy still resolves to the API on the same laptop, so nothing else changes. Windows already has an inbound **Allow** rule for `node.exe` on this machine; if yours does not, accept the firewall prompt or add a rule for the port. If it still will not load, the Wi-Fi is blocking device-to-device traffic — common on campus and guest networks — and you need either a phone hotspot with the laptop joined to it, or a tunnel.

> **Why the dev script passes `--watch-path=src`.** The API embeds PGlite, whose database files live in `server/data/pgdata` — inside the server package. A plain `node --watch src/index.js` watches the whole `server/` tree, so *every database write* (sign-in updates `last_login`, marking a notification read, submitting an application) restarts the API mid-request. The Vite proxy then reports `ECONNREFUSED` and the browser shows `Request failed (500)` at random, which looks like a matching-engine bug but is not. Restricting the watcher to `src/` fixes it; if you ever widen it again, expect the same failure mode. `npm start` has no watcher and is unaffected.

### Single-process mode

```bat
npm run build        # client/dist
npm start            # Express serves the API and the built SPA together on :4000
```

### Reset the demo data

```bash
npm run db:reset     # wipes and re-seeds; stop the API first
```

PGlite holds a **single-writer lock** on `server/data/pgdata`, so the API process must not be running while you reset.

---

## 2. Demo accounts

Every seeded account shares the password `InternIQ2026!`. The sign-in page lists them as one-click buttons (`GET /api/auth/demo-accounts`), so you never have to type during a presentation.

| Role | Email | Notes |
| --- | --- | --- |
| Student (CS, Y3) | `yonas.tesfaye@student.msu.edu.et` | richest CV, most scores to compare |
| Student (CS, Y4) | `yonas.girma@student.msu.edu.et` | |
| Student (ACCG) | `solomon.tebabo@student.msu.edu.et` | shows department-eligibility dampening |
| Employer | `talent@ethiotelecom.et` | own postings, ranked applicants |
| Employer | `campus@safaricom.et` | |
| Career Services admin | `career.services@msu.edu.et` | analytics, verifications, placements, Matching Lab |
| Alumni / mentor | `betelhem.girma@alumni.msu.edu.et` | extension role |

All data is fictional sample data generated for the demonstration.

---

## 3. What is in scope, what is an extension

The project document defines three roles and a paper-based process. Those are implemented as the core of the prototype. Anything beyond the document is **labelled in the UI** so requirement traceability stays intact.

| Document requirement | Where it lives |
| --- | --- |
| Student profile + CV upload and parsing | `/me` (CV Studio), `server/src/nlp/extract.js` |
| Skill extraction with evidence and confidence | CV Studio preview → `profile_skill` |
| Opportunity feed with match scores | `/internships`, sorted by match by default |
| Compatibility score explained, not a black box | posting page + employer ranking ("Why?") |
| Eligibility rules: department, GPA, year of study | enforced at apply time, dampened in ranking |
| Apply + track application status | `/applications`, append-only `application_event` |
| Employer posting management | `/employer/postings` |
| Employer screening and shortlisting | `/employer/applicants` |
| Career Services oversight and reporting | `/admin`, `/admin/verifications`, `/admin/placements` |
| Six departments and the 40-day requirement | seeded `department` table; posting form defaults to 40 days |
| Objective 7 — evaluate matching accuracy | `/admin/matching` (Matching Lab) |
| Notification of deadlines and status changes | bell menu, `/api/notifications/deadlines` |

**Extensions, visibly marked in the interface** (`ext` badge in the nav, an "extension" badge plus a warning banner inside the page):

- **Direct messaging** — §1.6.1 explicitly leaves real-time student↔employer chat outside the initial scope. It is present as a demonstration of the surrounding UX, and the page states that placement commitments belong in the application pipeline, because only application status changes produce the records Career Services reports on.
- **Alumni / mentor role and networking** — beyond the three documented roles; useful because the document's motivation includes professional guidance.

---

## 4. St. Mary's University identity

The interface is themed to the university rather than to a generic SaaS palette, because the demo is judged as *SMU's* system.

| Token | Value | Used for |
| --- | --- | --- |
| `--brand` | `#b41118` | primary buttons, crest field, active nav tab, avatar rings, hero mid-stop |
| `--brand-dark` | `#8d0d13` | hover/pressed states, gradient ends, employer accents |
| `--gold` | `#ffd202` | crest border, hero and login accent rule, extension badge, match bar tip |
| `--gold-dark` | `#d9ae00` | gold text on light backgrounds (contrast), bar gradient end |
| `--ink` | `#32373c` | body text, charcoal secondary buttons, mentor/ops avatars |
| `--canvas` | `#f5f4f2` | page background |

Every component reads these from `:root` in `client/src/styles.css` — there is no hard-coded brand hex in a component, so a future rebrand is one block. Headings and the wordmark use a serif display stack (`--font-display`), and the Amharic name renders through `--font-am` (`Nyala`, `Abyssinica SIL`, `Noto Sans Ethiopic`, `Kefa`), which falls back safely on machines without an Ethiopic font.

Provenance of the identity elements, all taken from the university's own public materials (smuc.edu.et): the red/gold/charcoal combination, the English name *St. Mary's University*, the Amharic name **ቅድስት ማርያም ዩኒቨርሲቲ**, the tagline **"Committed to Excellence"** (login page) and the motto **"If education goes wrong, nothing can go right"** (footer, and the sign-in panel).

> **The crest is a rendition, not the official artwork.** `Crest` in `client/src/components.jsx` is a hand-written SVG — a shield, sun and open book drawn in the university colours — chosen so the prototype ships no third-party copyrighted file. Before final submission, ask Career Services (or the Protocol/Communications Directorate) for permission to use the real logo and for the licensed `newlogo` asset; replacing it means swapping one component and the favicon in `client/index.html`, nothing else.



---

## 5. Layout

```
interniq/
  server/
    db/schema.sql          20 tables, 8 views, CHECK constraints on every enum
    db/seed.js             fictional corpus + deterministic demo password
    src/index.js           Express app, route mounts, static SPA in single-process mode
    src/bootstrap.js       create/migrate/seed, --force wipes pgdata
    src/db.js              PGlite connection
    src/http.js            auth middleware, async handler wrapper, error shape
    src/nlp/               extract.js  lexicon.js  vectors.js  match.js
    src/services/matching.js  score + cache invalidation for the board
    src/routes/            auth students internships applications network messages notifications admin
    smoke.mjs              role-by-role API harness
  client/
    src/App.jsx            routes + role guard
    src/Shell.jsx          nav, notifications
    src/pages/             Home Internships InternshipDetail Applications Profile Employer Admin People PersonProfile Messages Login
    src/styles.css         design system (custom properties, no framework)
```

51 endpoints across 8 routers; the contract deliberately mirrors an ASP.NET Web API surface (resource paths, JSON envelopes, 4xx with `{ error }`) so the front end would not need rewriting against a C# backend.

---

## 6. The matching engine

**CV reading** (`src/nlp/`): text normalisation → section splitting → alias matching with word boundaries → evidence snippet per skill → confidence score → skill level 1–5 → entity regexes (GPA, graduation year, city, phone) → unknown open-vocabulary terms reported rather than dropped. `.docx` CVs are parsed with `mammoth`; plain text pastes work too. Scanned PDFs are not OCR'd — the CV Studio says so on screen.

**Similarity**: TF-IDF (sublinear TF, smoothed IDF, L2-normalised) cosine similarity plus a Jaccard term on shared vocabulary.

**Composite score** (`src/nlp/match.js:22`):

| Component | Weight |
| --- | --- |
| Weighted skill coverage | 0.34 |
| Semantic similarity to the posting text | 0.20 |
| Department fit | 0.12 |
| Academic standing (GPA, year) | 0.12 |
| Logistics (city, format, duration, deadline) | 0.12 |
| Stated interest / affinity | 0.10 |

Each stored score keeps its per-component breakdown as JSONB, which is what the "Why?" disclosure renders.

A student outside a posting's department list is **dampened to 55%** rather than filtered out (`src/nlp/match.js:205`), so a genuinely skilled outlier can still surface and the application step still enforces the hard rule with an explanatory message.

The engine runs in JavaScript behind the same request/response shape a future Python + spaCy service would expose; replacing it is a swap of `src/nlp/` plus `src/services/matching.js`, not a rewrite of the app.

---

## 7. Objective 7: measuring the engine

`/admin/matching` (Matching Lab) grades the ranker against a hand-labelled set.

- Labels come from an **independent rule** over the seeded corpus — department eligible **and** at least half of the weighted required skills present at level 3+ — so the engine is not graded by its own scoring function.
- 170 labelled student↔posting pairs over 17 postings.
- Reported: mean average precision, Precision@k and Recall@k for k = 1, 3, 5, 10, the component weights in force, and the score distribution across real applications.
- Clean-seed reference point: **MAP ≈ 0.666, P@5 ≈ 40%**.
- Every judgement row can be overridden (`POST /api/admin/eval/label`), which recomputes the metrics — that is how the accuracy section of the write-up gets defended rather than asserted.

---

## 8. Testing

```bash
cd interniq/server && npm run smoke
```

`smoke.mjs` signs in as each role and walks the documented flows: discovery and scoring, the apply loop with eligibility enforcement, the application pipeline and its event trail, CV preview/commit, networking and messaging, notifications, employer posting CRUD plus ranked applicants and an acceptance, admin analytics/verifications/placements/eval/announce, and negative tests that a student cannot read admin data. It prints method, status and score per step and ends with `ALL CHECKS PASSED`.

It mutates the database, so run `npm run db:reset` afterwards if you want the pristine demo state back.

---

## 9. Installing it on a phone and sharing the link

The app is a PWA: `client/public/manifest.webmanifest`, four icon entries generated from the crest (`client/public/icon.svg`, rasterised to `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`) and `client/public/sw.js`. It registers only in production builds, so `npm run dev` never leaves a stale worker behind.

**Browsers only allow installation from a secure origin.** `http://localhost:5173` counts as secure on the laptop, but a LAN address like `http://192.168.10.154:5173` does not — installing on a phone requires the HTTPS URL from a deployment. That is the reason this section exists.

### Publish it (Render free tier)

`render.yaml` in the project root is a Render blueprint: it declares the build command, the start command, the health check and a generated `JWT_SECRET`, so connecting the repository is the whole setup.

1. Create a GitHub repository and push this folder to it as `main`:
   ```bat
   cd /d C:\Users\dell\Documents\Qoder\2026-10-30\faabea18\interniq
   git init && git add . && git commit -m "InternIQ prototype"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/interniq.git
   git push -u origin main
   ```
   `server/data/` is gitignored, so the local database and `jwt.key` never leave the machine.
2. On render.com: **New → Blueprint**, pick that repository. Render reads `render.yaml` and shows the service before deploying.
3. Wait for the build, then open the `https://interniq-xxxx.onrender.com` URL it gives you.

On the phone: open that URL in Chrome (Android) or Safari (iOS), then **Add to Home Screen** / **Install App**. It launches without browser chrome, with the crest icon and the three shortcuts (Search, Applications, CV Studio) under the icon.

### What the free tier actually does

- **It sleeps.** After ~15 idle minutes Render stops the service; the next request takes 30-60 seconds to wake. Tell the examiners before you tap the link in front of them, or load the URL a minute before you present.
- **The disk is ephemeral, and that is a feature here.** `prepareDatabase()` (`server/src/index.js:22`) applies `schema.sql` and regenerates the seed whenever the cluster is empty, so every cold start is a pristine demo: 48 accounts, 17 postings, 141 applications, 170 labelled evaluation pairs. Anything a friend registered disappears on the next restart. Do not treat the deployed instance as a system of record.
- **`JWT_SECRET` is generated by Render and persisted**, so signing in survives a restart. Without it the server would write a fresh secret to `server/data/jwt.key` on an empty disk and invalidate every session on each cold start.
- **The service worker never caches `/api`.** `sw.js` returns early for any `/api/` request, because match scores, applicant lists and messages are per-user and a shared cache would hand one signed-in visitor another visitor's data. HTML is network-first, hashed JS/CSS is cache-first, so a new deploy is picked up on the next navigation.
- **Offline opens the shell only.** The interface renders, the data calls fail visibly. That is intended for a demo whose whole purpose is live matching.

### Before you send the link to anyone

Registration and sign-in are open on the public instance, the login page prints the shared demo password, and there is no rate limiting or email verification. That is deliberate for a prototype with entirely fictional data, and it is also the first thing to change for a real deployment - see §10. It is your university's name on the page, so decide who you send it to; a link to a public URL is a link anyone can forward.



---

## 10. Portability notes for the final project

- **Embedded Postgres → server Postgres.** SQL is written against PostgreSQL semantics only (no PGlite-specific features). Migration means replacing `src/db.js` with a `pg.Pool` and pointing the same `schema.sql` at a real cluster; `TEXT[]`, `JSONB`, views and `RETURNING` all carry over unchanged.
- **JS NLP → Python/spaCy.** `src/nlp/` is one import boundary. Keep the endpoint contract, host the Python service separately, and drop the HTTP call into `src/services/matching.js`.
- **Auth for production.** Passwords use bcrypt (cost 8) and sessions use JWT. The secret comes from `JWT_SECRET` when that is set (Render does this via `render.yaml`); otherwise it is generated once into `server/data/jwt.key`, which survives reseeds but not an empty disk. The demo panel is intentionally one-click; remove it for a real deployment.
- **Privacy rule enforced in code, not policy.** `cv_raw_text` is read only inside `src/services/matching.js` for scoring; the ranked-applicant payload (`applicantsForInternship`) carries extracted skills with levels, academics and the stored breakdown — never the CV and never contact details.

## 11. Known limits

Sample scale is 48 accounts and 17 postings — enough to demonstrate ranking behaviour and the accuracy measurement, not to substitute for the institution's real register. Chat, mentor networking and the alumni directory are prototype extensions. Deadline dates are generated relative to the day you seed, so "days left" stays realistic whenever the demo is run.
