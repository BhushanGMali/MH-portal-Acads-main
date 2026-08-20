# PW Maharashtra Region — Faculty Performance Portal

> Physics Wallah | Chhatrapati Sambhajinagar Vidyapeeth

A role-based performance tracking portal for the **Physics Wallah Maharashtra Region**. It gives Admin, RAH, RAOM, CH/ACH, AOM, Subject Heads, and Faculty a single unified view of batch performance, student progress, and faculty productivity — powered by Google Sheets as the data source.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Role-Based Access Control](#role-based-access-control)
6. [Google Sheets Structure](#google-sheets-structure)
7. [Setup Guide](#setup-guide)
8. [Deployment (GitHub Pages)](#deployment-github-pages)
9. [API Endpoints](#api-endpoints)
10. [Signup & Approval Flow](#signup--approval-flow)
11. [File Structure](#file-structure)
12. [Branding & Theme](#branding--theme)
13. [Usage Guide](#usage-guide)
14. [Troubleshooting](#troubleshooting)

---

## Overview

The portal replaces manual spreadsheet sifting with a **single unified Home screen** that shows, at a glance:

- **KPI cards** — centers, total batches, students, faculty, average score, and absent students
- **Topper & bottom-performing students** with per-subject marks
- **Best & bottom batches** with their top students
- **Absent students** — who has not given any paper, and how many papers they missed
- **Subject-wise average graph** per test for any batch
- **Filters** — center, class/stream, batch, faculty, and date range
- **One-click downloads** of any table as CSV, XLS, or PDF

Every user sees only what their role permits. The entire backend runs on **Google Apps Script** (for auth, signup/approval, and center-change requests) while the analytics data is fetched directly from **published Google Sheets CSVs** in the browser — no server, no database, no hosting cost.

---

## Features

### Unified Home View
- **KPI cards** — Center, Total Batches, Total Students, Total Faculty, Average Score, Average Students, Absent Students
- **Topper Students** — top performers with per-subject marks (subject columns adapt to a Faculty's own subjects)
- **Bottom Performing Students** — lowest performers
- **Best / Bottom Batch cards** — with the top 3 students of each
- **Absent Students** — students who gave zero papers in the selected scope, sorted by how many papers they missed, with a **Papers Not Given** count
- **Subject-wise % per test graph** — hoverable line chart for any batch
- **Filters** — Center, Class/Stream, Batch, Faculty, From/To Date, plus Reset
- **Downloads** — every table header has a ⬇ button exporting CSV / XLS / PDF
- **Center name in brackets** next to every batch label, so users can tell which center a batch belongs to

### Role-Scoped Filters
- **Admin / RAH / RAOM** — see the whole region; center filter lists all centers
- **CH/ACH, AOM, Subject Head** — see only their selected center(s)
- **Faculty** — see only their own batches (from the FBM mapping); the center filter is locked to their center

### Batch Management
- Complete list of batches with subject tags, student count, and faculty assignments
- **Search and filter** by subject, faculty, or batch name
- **Batch detail view** with total/present/absent counts, average/highest/lowest scores, toppers, average performers, needs-improvement, absentees, and a full student table

### Faculty Performance
- All faculty listed with their batches, subjects, and student counts
- **Average student score** per faculty as a measure of teaching effectiveness
- Filterable by center and searchable by name

### Student Analytics
- Complete student roster with batch, tests taken, average score, and best subject
- Sortable by score, name, or tests taken
- **Student detail view** with subject-wise performance bars and full test history

### Authentication & Access
- **Dual-identifier login** — email or PWID
- **Forgot Password** — OTP-based reset via email
- **Session persistence** — auto-login from browser `localStorage`
- **Self signup with approval** — new accounts are created only after an approver approves
- **Request Access** — a logged-in user can request access to another center via a form (mail ID, PW ID, center, remark); the request goes to their approver for approval
- **Reload Data** button — force-refreshes the published CSVs and re-renders the current view
- **Live pill** — indicates the data is live

---

## Architecture

```
┌──────────────────────────────────────────────┐
│            Frontend (single-page app)         │
│                                               │
│  index-standalone.html  (self-contained)      │
│  ├── core.js      state, navigation, api      │
│  ├── auth.js      login, signup, requests     │
│  ├── data.js      CSV fetch + computeHome     │
│  ├── home.js      unified Home view + charts  │
│  ├── student.js   student search + detail     │
│  ├── dashboard.js / batches.js / faculty.js   │
│  │   / students.js / perf.js                  │
│  └── styles.css   theme + responsive layout   │
└──────────┬──────────────────────┬─────────────┘
           │                      │
   fetch() published CSVs   fetch() Apps Script API
           │                      │
           ▼                      ▼
┌─────────────────────┐  ┌──────────────────────┐
│  Google Sheets       │  │  Google Apps Script  │
│  (published CSV)     │  │  (apps-script.gs)    │
│  Tests / FBM /       │  │  auth, signup/       │
│  Students            │  │  approval, center    │
└─────────────────────┘  │  change requests      │
                         └──────────────────────┘
```

Two data paths:

1. **Analytics data** — `data.js` fetches three **published Google Sheets CSVs** directly in the browser (Tests, FBM, Students), parses them, caches them, and computes everything the Home view needs. No Apps Script call is involved, so the dashboard loads fast and works even if the Apps Script backend is down.
2. **Auth & workflow** — `core.js` calls the **Google Apps Script** web app for login, forgot password, signup/approval, and center-change requests.

The design is deliberately simple:
- **No server** — Google Apps Script runs in Google's cloud
- **No database** — Google Sheets *is* the database
- **No build step** — plain HTML/CSS/JS
- **Zero hosting cost** — GitHub Pages serves the static frontend

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript | Single-page application with view routing |
| Analytics data | Google Sheets (published CSV) | Tests, FBM, Students — fetched in-browser |
| Backend | Google Apps Script | Auth, signup/approval, center-change requests |
| Hosting | GitHub Pages | Serves the static `index-standalone.html` |
| Fonts | Google Fonts (Inter, Space Grotesk) | Typography |
| Icons | Inline SVG | Zero-dependency icons |
| Charts | Custom SVG (no library) | Subject-wise % per test graph |

**No frameworks. No dependencies. No npm. No build tools.**

---

## Role-Based Access Control

The portal implements a 7-level hierarchy. **Role, center access, and login credentials are decided by the `ID-Role` sheet** (email in column A, centers in column B, role in column C, PWID in column D).

| Level | Role | Can See |
|-------|------|---------|
| 7 | **Admin** | ALL data across ALL centers |
| 6 | **RAH** | Whole region — all centers |
| 5 | **RAOM** | Whole region — all centers |
| 4 | **CH/ACH / JEE Head / NEET Head** | Their selected center(s) only |
| 3 | **AOM** | Their selected center(s) only |
| 2 | **Subject Head** | Their selected center(s) only |
| 1 | **Faculty** | Only their own assigned batches and students (via FBM) |

### How it works
- **Login** resolves by **email (column A) OR PWID (column D)** — both in the `ID-Role` sheet
- Column B can hold **multiple centers** as a comma-separated list
- **Admin / RAH / RAOM** see the whole region — no center restriction
- **Faculty** sees only their own data through the `FBM` sheet (which maps faculty → batches → subjects). FBM is **not** used for authentication or manager-level access
- **Center access requests** go through approval: a user clicks **Request Access**, fills the form (mail ID, PW ID, center, remark), the request is emailed to their approver, and on approval `ID-Role` column B is updated

---

## Google Sheets Structure

### Sheet: `ID-Role`
| Column | Field | Description |
|--------|-------|-------------|
| A | MAIL ID | Faculty email address (login identifier) |
| B | CENTER | Center code/name |
| C | ROLE | Admin, RAH, RAOM, CH/ACH, AOM, Subject Head, Faculty |
| D | PWID | PW ID (filled on signup approval) |
| E-G | — | Other fields (unused by portal) |
| H | Password | User password (blank = use default `Acer@1234`) |
| I-J | — | Other fields (unused) |
| K | OTP | Stores generated OTP during password reset |

### Sheet: `FBM` (Faculty-Batch Mapping)
| Column | Field | Description |
|--------|-------|-------------|
| A | Batch | Batch code (e.g., `36-LNE01MP`) |
| B | Subject | Physics, Chemistry, Maths, Zoology, Botany |
| C | PWID | Faculty PW ID |
| D | MailID | Faculty email |
| E | Center | Center name |

### Sheet: `Students`
| Column | Field | Description |
|--------|-------|-------------|
| A | regno | Student registration number |
| B | form_status | Form status |
| C | newpayment_checks | Payment verification |
| D | eligibility_status | Eligibility status |
| E | batch | Batch code (matches FBM column A) |

### Sheet: `Test Result`
| Column | Field | Description |
|--------|-------|-------------|
| A | reg_no | Student registration number |
| B | student_name | Full name |
| C | joining_date | Date joined |
| D | acad_year | Academic year |
| E | current_batch | Batch code |
| F | class_stream | Stream/class |
| G | test_type | Type of test |
| H | paper_type | Paper type |
| I | test_pattern | Test pattern |
| J | testseries | Test series name |
| K | test_date | Date of test |
| L | totalmarks | Maximum marks |
| M | userscore | Student's score |
| N | markspercent | Score as percentage |
| O | physics_marks | Physics score |
| P | chemistry_marks | Chemistry score |
| Q | maths_marks | Maths score |
| R | zoology_marks | Zoology score |
| S | botany_marks | Botany score |
| T | test_rank | Rank in test |

> **Note:** The Tests, FBM, and Students sheets must be **published to the web as CSV** for `data.js` to fetch them. The published URLs (with their `gid` values) are configured in `data.js` → `CSV_URLS`.

---

## Setup Guide

### Step 1: Prepare the Google Spreadsheet

1. Open your Google Spreadsheet containing the sheets (ID-Role, FBM, Students, Test Result)
2. Ensure the column headers match the structure described above
3. **Publish the data sheets to the web as CSV** (File → Share → Publish to web → select each sheet → CSV), and copy the published URLs into `data.js` → `CSV_URLS`
4. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
   ```

### Step 2: Deploy the Google Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**
2. Delete any existing code and paste the contents of `apps-script.gs`
3. Find this line and replace the placeholder:
   ```javascript
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
   ```
   Replace with your actual Spreadsheet ID.
4. Click **Save** (Ctrl+S)
5. Click **Deploy → New deployment**
6. Settings:
   - **Type**: Web app
   - **Execute as**: Me
   - **Who has access**: Anyone
7. Click **Deploy**
8. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/AKfyc.../exec`)

### Step 3: Configure the Frontend

1. Open `core.js` and find this line:
   ```javascript
   const API_BASE = 'https://script.google.com/macros/s/YOUR_URL_HERE/exec';
   ```
2. Replace with your deployed Web App URL from Step 2

### Step 4: Open the Portal

1. Serve the folder over HTTP (required for the modular `index.html` + `loader.js`):
   ```bash
   python3 -m http.server 8888
   ```
2. Open `http://localhost:8888` in any modern browser
3. Login with your email and password (default: `Acer@1234`)

> **Tip:** If you don't want to run a server, open **`index-standalone.html`** directly — it has all HTML and JS inline and works from `file://` or any host.

---

## Deployment (GitHub Pages)

The portal is deployed to GitHub Pages from the `main` branch via the workflow in `.github/workflows/jekyll-gh-pages.yml`.

The workflow:
1. Builds the site with Jekyll into `_site`
2. **Copies `index-standalone.html` over `_site/index.html`** so the self-contained build is served as the homepage (the modular `index.html` + `loader.js` is *not* used on Pages)
3. Uploads and deploys the artifact

> **Important:** Because Pages serves `index-standalone.html`, you must **regenerate it after any source change** before pushing:
> ```bash
> python3 /tmp/build_standalone.py
> ```
> This inlines `core.js`, `auth.js`, `data.js`, `home.js`, `student.js`, `dashboard.js`, `batches.js`, `faculty.js`, `students.js`, `perf.js` and all `screen-*.html` partials into a single file.

---

## API Endpoints

All endpoints use `GET` requests except password reset (uses `POST`).

| Action | Method | Parameters | Description |
|--------|--------|------------|-------------|
| `login` | GET | `identifier`, `password` | Authenticate user |
| `forgotPassword` | GET | `identifier` | Generate and email OTP |
| `verifyOTP` | GET | `identifier`, `otp` | Verify OTP |
| `resetPassword` | POST | `identifier`, `newPassword` | Set new password |
| `getDashboard` | GET | `email`, `level`, `center` | Overview statistics |
| `getBatches` | GET | `email`, `level`, `center` | All batches with metrics |
| `getBatchDetail` | GET | `batch`, `subject` (optional) | Detailed batch performance |
| `getFaculty` | GET | `email`, `level`, `center` | Faculty productivity data |
| `getStudents` | GET | `email`, `level`, `center`, `batch` (optional) | Student list with scores |
| `getStudentDetail` | GET | `regno` | Individual student test history |
| `getSignupOptions` | GET | — | Available roles and centers for signup |
| `signup` | GET | `email`, `pwid`, `center`, `role`, `password` | Create an approval request |
| `getApprovalStatus` | GET | `email` | Check status of a user's approval requests |
| `approveRequest` | GET | `token` | Approve a signup request (from email button) |
| `rejectRequest` | GET | `token` | Reject a signup request (from email button) |
| `requestCenterChange` | GET | `email`, `newCenter`, `remark` | Request access to another center (goes through approval) |
| `approveCenterChange` | GET | `token` | Approve a center change (from email button) |
| `rejectCenterChange` | GET | `token` | Reject a center change (from email button) |

---

## Signup & Approval Flow

New users sign up through the portal, but their account is **only created after an approver approves** the request.

### Signup form fields
- **MAIL ID** — PW email address (login identifier). **Only `@pw.live` emails can sign up.**
- **PWID** — PW ID (also usable for login, stored in ID-Role column D)
- **CENTER** — single center selected from a dropdown
- **ROLE** — Faculty, Subject Head, AOM, CH/ACH, JEE Head, NEET Head, RAOM, RAH
- **Password** — minimum 4 characters

### Approval chain (next level up)
| Signup Role | Approver |
|-------------|----------|
| Faculty / Subject Head | AOM |
| AOM | CH/ACH |
| CH/ACH / JEE Head / NEET Head | RAOM |
| RAOM | RAH |
| RAH | Admin |

If **no approver exists** for the role in the `ID-Role` sheet, the approval email falls back to the Admin.

### How approval works
1. User submits the signup form → a request is created in the **Approvals** sheet (status `Pending`)
2. An approval email is sent to the approver with two buttons: **Approve** and **Reject**
3. The approver clicks a button:
   - **Approve** → the user is created in the **ID-Role** sheet and login details are emailed to them
   - **Reject** → the request is marked `Rejected` and the applicant is notified
4. Clicking a button opens a minimal confirmation page (not the portal) and the applicant receives a confirmation email
5. The user can then log in with their email + password

### Approvals sheet structure
| Column | Field |
|--------|-------|
| A | Request ID |
| B | Email |
| C | PWID |
| D | Center |
| E | Role |
| F | Password |
| G | Status |
| H | Approver Email |
| I | Created At |
| J | Processed At |
| K | Token |

### Center access request flow
1. A logged-in user clicks **Request Access** in the top bar and fills the form (mail ID, PW ID, center, remark)
2. A request is created in the **CenterChanges** sheet (status `Pending`) and an email with Approve/Reject buttons goes to their approver
3. On **Approve** → `ID-Role` column B is updated with the new center(s) and the user is emailed
4. On **Reject** → the request is marked `Rejected` and the user is notified

### CenterChanges sheet structure
| Column | Field |
|--------|-------|
| A | Request ID |
| B | Email |
| C | Old Center |
| D | New Center |
| E | Status |
| F | Approver Email |
| G | Created At |
| H | Processed At |
| I | Token |

---

## File Structure

The frontend is split into **modular JS files** and **HTML partials**. `loader.js` injects the HTML partials at runtime for the modular `index.html`; the standalone build inlines everything into one file.

```
MH portal Acads/
├── apps-script.gs            # Google Apps Script backend (paste into Apps Script editor)
├── index.html                # HTML shell: placeholders + script tags (modular version)
├── loader.js                 # Loads HTML partials, fires pw:html-ready
├── core.js                   # API base, shared state, navigation, api helpers, utilities, auto-login
├── auth.js                   # Login, forgot password, signup, logout, request access
├── data.js                   # Fetches published CSVs, parses, caches, computeHome
├── home.js                   # Unified Home view: KPIs, tables, filters, graph, downloads
├── student.js                # Student search + detail view
├── dashboard.js              # Dashboard stats + top/bottom batches
├── batches.js                # Batch list, filters, batch detail
├── faculty.js                # Faculty list, filters, render
├── students.js               # Student list, filters, render, student detail
├── perf.js                   # Shared toppers/average/bottom/absentee renderers
├── screen-login.html         # Login screen partial
├── screen-forgot.html        # Forgot password screen partial
├── screen-signup.html        # Signup screen partial (MAIL ID, PWID, CENTER, ROLE)
├── screen-app.html           # Main app screen (top navbar + all views)
├── overlay.html              # Loading overlay partial
├── index-standalone.html     # Single-file build (all HTML+JS inline, no server needed)
├── styles.css                # CSS styling with black + red premium theme
├── .github/workflows/
│   └── jekyll-gh-pages.yml   # GitHub Pages deploy workflow
└── README.md                 # This file
```

### File Responsibilities

| File | Role |
|------|------|
| `apps-script.gs` | Backend API: auth, signup/approval, center-change requests, role-based filtering |
| `index.html` | HTML shell with placeholder divs and ordered script tags (modular version) |
| `loader.js` | Fetches each `screen-*.html` partial and injects it, then fires `pw:html-ready` |
| `core.js` | `API_BASE`, shared state, `showScreen`/`navigate`, `apiGet`/`apiPost`, utilities, auto-login |
| `auth.js` | Login, forgot/OTP/reset, signup, `initApp`, request-access form, logout |
| `data.js` | Fetches the three published CSVs, parses them, caches them, and computes all Home-view data (`computeHome`, `batchCenterName`, role scoping) |
| `home.js` | Renders the unified Home view: KPI cards, topper/bottom/absent tables, best/bottom batch cards, subject graph, filters, and CSV/XLS/PDF downloads |
| `student.js` | Student search + detail view with subject bars and test history |
| `dashboard.js` | Dashboard stats + top/bottom batch rendering |
| `batches.js` | Batch list, filters, batch detail view |
| `faculty.js` | Faculty list, filters, rendering |
| `students.js` | Student list, filters, rendering, student detail |
| `perf.js` | Shared performance list renderers (toppers, average, bottom, absentees) |
| `screen-*.html` | One screen per file, injected by `loader.js` |
| `index-standalone.html` | Single-file build with all HTML + JS inline — works from `file://` or any host; served by GitHub Pages |
| `styles.css` | Black + red premium theme, responsive layout, animations |

> **Note:** The modular frontend (`index.html`) must be served over HTTP (e.g. `python3 -m http.server 8888`) because `loader.js` uses `fetch()` to load the HTML partials. For a single file that works anywhere — and for GitHub Pages — use **`index-standalone.html`**.

---

## Branding & Theme

The portal uses a **black + red premium** theme:

| Element | Value |
|---------|-------|
| Brand Red | `#EF4444` |
| Red Dark | `#B91C1C` |
| Red Bright | `#F87171` |
| Deep Black (bg) | `#0A0A0B` |
| Card Surface | `#151518` |
| Border | `#26262B` |
| Text | `#F5F5F7` |
| Text Secondary | `#A1A1AA` |
| Typography | Inter, Space Grotesk (Google Fonts) |

The design features:
- **Dark / light theme toggle** with a persistent preference
- **Split-screen login** with black background + red radial gradients on the left
- **Red gradient buttons** (`#EF4444 → #B91C1C`) with glow shadows
- **Dark top navbar** with red active states, a **Live** pill, **Reload Data**, and **Request Access**
- **Solid, readable status badges** (green / blue / amber / red with white text) that look good on both dark and light backgrounds
- **Responsive design** that works on mobile, tablet, and desktop — tables show 10 rows at a time with vertical scroll

---

## Usage Guide

### For Admins
1. Login → the Home view shows KPIs, toppers, bottom performers, best/bottom batches, and absent students across all centers
2. Use the **filters** (center, class/stream, batch, faculty, date) to narrow the view
3. Click **⬇ Download** on any table to export it as CSV, XLS, or PDF
4. Go to **Batches** to see all batches ranked by average score; click **View** for a detailed breakdown
5. Go to **Faculty** to see all faculty ranked by student performance
6. Go to **Students** to browse students, sort by score, and click **View** for individual details

### For Faculty
1. Login → the Home view shows only your assigned batches and students
2. The **Center** filter is locked to your center; the **Batch** and **Faculty** filters are scoped to your data
3. Use the **Subject** filter to see performance for a specific subject
4. Go to **Students** to see individual student details and test histories

### Password Reset
1. Click **Forgot Password** on the login screen
2. Enter your email or PWID
3. Check your email for the 6-digit OTP
4. Enter OTP and set a new password (minimum 4 characters)

### Signup & Approval
1. Click **Sign Up** on the login screen
2. Fill in **MAIL ID**, **PWID**, select **CENTER**, choose **ROLE**, and set a **Password**
3. Submit — your request goes to your reporting manager (or the Admin if no approver exists for your role)
4. Check your email after approval — you will receive login credentials and can sign in

### Request Access to Another Center
1. Click **Request Access** in the top bar
2. Your **Mail ID** is pre-filled; add your **PW ID**, select the **Center**, and write a **Remark**
3. Submit — the request goes to your approver; on approval your center access is updated

---

## Troubleshooting

### "User not found"
- Check that your email exists in the `ID-Role` sheet (Column A)
- If logging in with PWID, ensure the PWID exists in the `FBM` sheet (Column C) and has a linked email (Column D)

### "Invalid password"
- Default password is `Acer@1234` (used when Column H is blank in ID-Role)
- If a custom password is set in Column H, use that instead
- Passwords are case-sensitive

### Home view shows 0 batches / 0 students
- Ensure the **Tests**, **FBM**, and **Students** sheets are **published to the web as CSV** and the URLs in `data.js` → `CSV_URLS` are correct
- Ensure the `FBM` sheet has data rows (not just headers)
- Ensure the `Students` sheet has batch codes matching the FBM batch codes

### API returns "Exception: Illegal spreadsheet id"
- The `SPREADSHEET_ID` in `apps-script.gs` is still the placeholder
- Replace it with your actual Spreadsheet ID

### Portal not loading / CORS errors
- Ensure the Apps Script is deployed as a **Web App** with "Anyone" access
- Re-deploy if needed (Deploy → Manage deployments → Edit → New version)

### GitHub Pages shows the old / broken version
- Pages serves `index-standalone.html`. After changing any source file, **regenerate it** with `python3 /tmp/build_standalone.py` and commit both the source and the rebuilt `index-standalone.html`

### Slow loading
- The Test Result sheet may be very large. First load might take 5-10 seconds
- Subsequent loads within the same session are faster due to browser caching
- Use the **Reload Data** button to force a fresh fetch

---

## Credits

Built for **Physics Wallah — Maharashtra Region, Chhatrapati Sambhajinagar Vidyapeeth**

Brand identity and color palette sourced from [pw.live](https://www.pw.live)

---

*This is an internal tool. Not affiliated with PhysicsWallah Limited's official products.*