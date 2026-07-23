# Flodok help-docs — audit & checklist

Master reference for the in-app Help Center. Every **real** feature maps to its
help topic(s) and a status. Working tracker for keeping docs matched to the app.

- **End-user help content:** `src/pages/help/data.tsx` (topic bodies + the section registry at the bottom).
- **Guided demos:** `src/components/help/demos/*.tsx` (fake-cursor mockups embedded in topics).
- **Dev/architecture docs:** `README.md`, `docs/*.md`.

Last full audit: **2026-07-12** (docs-vs-code, 7 feature clusters, code = ground truth).

## Legend
- ✅ **accurate** — verified against code, no action
- ✔️ **done** — fixed/written this initiative
- 🔧 **stale** — feature exists, doc is wrong → rewrite
- ✍️ **missing** — feature exists, no doc → write
- 🗑️ **delete** — documents a feature that does not exist → remove (policy: **no "coming soon"**, only document what ships)

---

## Policy
Document only what exists in the shipping app. **No "coming soon" / aspirational topics.** When a feature lands, add its topic then — not before.

## Cross-cutting fixes (one change fixes several topics) — ✔️ ALL DONE 2026-07-12
- [x] ✔️ **Merge-field syntax** — `[X]` → `{'{{x}}'}` (JSX-safe) across `NDA_OVERVIEW`, `LETTERS`, `DOCUMENTS_EXPORT`; verified against `mergeFields.ts` tokens.
- [x] ✔️ **"Settings → Organization" → Company page** — fixed in `QUICKSTART`, `SETTINGS_TIMEZONES`, `BILLING_INVOICES`, the Faktur FAQ, and `SETTINGS_ORG` (redirected to the Company page; the phantom per-user timezone override removed).
- [x] ✔️ **"Manager" role → Owner / Admin / HR / Member** — `ROLES` rewritten (verified `useAuth` semantics: HR = manage-people, Member = standard), plus `QUICKSTART` + `INVITES`.
- [x] ✔️ **Export path** — "Download PDF" → **⋯ → Export → PDF/Word** in `NDA_OVERVIEW`, `LETTERS`, `JOB_DESCRIPTIONS`, `DOCUMENTS_EXPORT` (+ DOCX now documented). NOTE: the Forms *request* page keeps its own "Download PDF" button (a different feature — left as-is).

**Topics fully closed by this sweep:** `NDA_OVERVIEW`, `LETTERS`, `DOCUMENTS_EXPORT`, `ROLES`, `QUICKSTART`, `INVITES`, `SETTINGS_TIMEZONES`, `SETTINGS_ORG`, `BILLING_INVOICES`, plus `JOB_DESCRIPTIONS` export label. (NDA red-badge + Letters post-issue-lock claims also corrected in the same pass.)

---

## Net-new topics to write (shipped, zero docs)

### ✔️ Attendance — DONE 2026-07-12 (topic `ATTENDANCE` written + registered as its own **Attendance** section, slug `attendance-overview`)
Selfie + GPS clock-in. Opt-in per org via `organizations.attendance_enabled` (**default off**); the admin Attendance log page is always in the nav.
- Portal **Attendance tab**: live-clock hero + Clock in/out (action inferred from last event); selfie via camera (needs secure/https context); **location required** (outside-geofence is recorded+flagged, no-location blocks).
- Server-authoritative: edge fn `attendance-checkin` (slug+token auth) → selfie to a private bucket → `portal_record_attendance`; identity + geofence resolved server-side.
- **Office-network/IP signal** confirms on-site independent of GPS; **confidence badge** on_site/off_site/unclear/none.
- Dashboard **log** (owner/admin/hr): filterable table (status, geofence, date range) + 4 today stat cards; photo modal; auto-clock-out tag.
- Setup in **Settings → Attendance**: clock-in enable toggle, auto-clock-out hours cap, locations manager (geofences/radius, office networks, primary marker).

### ✔️ Tasks — DONE 2026-07-12 (topic `TASKS` written + registered under **Your Workspace**, slug `tasks`)
Reminders-style task manager.
- Left rail smart lists: Today / Scheduled / Flagged / All / Inbox / Completed + color-coded **Projects**.
- Three views (remembered per browser): **List** (drag-reorder), **Board** (drag between statuses), **Calendar** (drag to reschedule, click-day to create).
- Task fields: title, notes, assignee (employee), due date + **due time**, priority/flag, project, external URL, **linked document** (SOP/contract).
- **Employee portal Tasks tab** — a task assigned to an employee shows in their portal (phone glyph marks portal-visible).
- **AI intake** — meeting action items from the Fireflies pipeline arrive as **Suggested tasks on the Pending page**; accepting one creates a real task.
- Soft-delete → Trash (30-day restore).

### ✔️ Performance / recognition overview — DONE 2026-07-12
Covered by the `RECOGNITION` rewrite above (monthly cockpit: Reward/Penalise, badges, XP). Reuses the kept `RecognitionDemo`.

### ✍️ (confirm) Asana integration
Asana is a real integration (Fireflies + Asana) but has no dedicated topic — only `INTEGRATIONS_OVERVIEW` mentions it. Decide whether it warrants its own topic.

---

## By section (topic-level status)

### Getting started / General / Overview
- [ ] 🔧 `QUICKSTART` — "Settings → Organization" (→ Company); "managers" role.
- [ ] 🔧 `ROLES` — invents "Manager"; omits Owner/HR (actual Owner/Admin/HR/Member).
- [ ] 🔧 `INVITES` — "managers"; fake CSV bulk-invite; "Settings → Portal".
- [x] ✅ `PLANS` — pricing math fully correct (nit: description says "three plans", body says two).
- [x] ✔️ `DASHBOARD_OVERVIEW` — rewritten 2026-07-12 to the action-first redesign (3 quick actions incl. New task, "What needs you" action cards, payroll reminder note, ambient coverage card, 90-day calendar, no activity search, simplified recognition strip).

### Documents & editor
- [x] ✅ `DOCUMENTS_OVERVIEW`
- [x] ✔️ `SOP_CREATE` — done 2026-07-12: sections retired ("+ Section" → "+ Add block"); "Acknowledgements" panel is now "Signatures".
- [x] ✅ `SOP_VERSIONING` (minor: History is in the editor More menu, not a SOPs tab)
- [x] ✔️ `CONTRACTS_CREATE` — done 2026-07-12: makes a blank PKWT draft directly.
- [x] ✔️ `CONTRACT_TEMPLATES` — done 2026-07-12: → **Template gallery** (`/dashboard/templates`); now multi-type (SOP/JD/NDA too).
- [x] ✅ `CONTRACTS_SIGN`
- [ ] 🔧 `NDA_OVERVIEW` — merge-field syntax; red-badge-on-button detail; Export submenu.
- [x] ✅ `JOB_DESCRIPTIONS` (minor: Export label; kebab has no restore-to-draft)
- [ ] 🔧 `LETTERS` — merge syntax; **post-issue lock claim backwards** (subject locks, ref# editable, body not frozen).
- [x] ✔️ `SOP_IMPORT` — done 2026-07-12; added **Upload & Analyse** (PDF → AI-vision draft) which its own demo shows.
- [ ] 🔧 `DOCUMENTS_EXPORT` — omits **DOCX/Word** entirely; "Download PDF" label; merge syntax.
- ✅ All Documents guided demos accurate (they're ahead of the prose).

### Recruitment
- [x] ✔️ `HIRING_FUNNEL`, `HIRING_CANDIDATES`, `HIRING_OFFERS` — rewritten this session (screening gate, board/drawer, quick-add).
- [x] ✔️ `PORTAL_CANDIDATE_ONBOARDING` — rewritten this session (two-wave onboarding).
- [ ] ⏳ `HIRING_REQUESTS`, `HIRING_SEPARATION` — not deep-audited; spot-check.

### Employees & Company
- [x] ✅ `EMPLOYEES_DIRECTORY`
- [x] ✔️ `EMPLOYEE_PROFILE` — done 2026-07-12; moved screening fields to **Personal** but live in **Personal**; omits new panels (KTP/KK photos, emergency, family); doesn't note now-required fields.
- [x] ✅ `COMPANY_STRUCTURE`

### Performance & recognition
- [x] 🗑️ `PERFORMANCE_REVIEWS` — **DELETED** 2026-07-12 (360 review cycles don't exist). Topic + registry + demo removed.
- [x] 🗑️ `PERFORMANCE_CYCLES` — **DELETED** 2026-07-12 ("coming soon").
- [x] 🗑️ `PERFORMANCE_ONE_ONES` — **DELETED** 2026-07-12 (1:1 pages/route don't exist).
- [x] ✔️ `RECOGNITION` — rewritten 2026-07-12 to the real Performance cockpit (Reward/Penalise pay adjustments → payroll, Award badge, XP + private leaderboard); fictional credits-marketplace / "Gajihub" removed; retitled "Recognition & rewards". This is the Performance section's accurate topic (fills the gap from the deleted fictional trio).

### Forms
- [x] ✅ `FORMS_OVERVIEW`, `FORMS_SUBMITTING`, `FORMS_CONFIG`, `FORMS_PAYROLL_LEAVE`
- [x] ✔️ `FORMS_APPROVING` — done 2026-07-12; fixed (admin override on the owner step).
- [x] ✔️ `FORMS_LEAVE_RULES` — done 2026-07-12; fixed (gate is on the Leave Request form-config page); "Portal → Forms → Requests" extra hop.

### Payroll
- [x] ✔️ `PAYROLL_OVERVIEW` — rewritten 2026-07-12 (real top cards = payout/bonuses/deductions + trend; per-employee freeze/reopen; "needs run" dots; reopen-and-rerun corrected; honest run modal w/ acknowledgement; Download-all/CSV/settings in the More menu).
- [x] ✅ `PAY_COMPONENTS` (cosmetic nits only)
- ⚠️ No payroll guided demo exists (gap — optional).

### Portal
- [x] ✅ `PORTAL_ABOUT` prose (nit: lists "payslips" — home shows a compensation composition)
- [ ] 🔧 `PortalAboutDemo` — **stale**: dead 5-tab bar + compensation ring. Real tabs: Home / Docs / **Tasks** / Requests / **Attendance**; ring → composition bar + ledger rows; Badges/Leaderboard are home chips, not tabs.
- [ ] 🔧 `PORTAL_SHARE` (+ demo) — fictional org-wide link + QR + rotate; reality is per-employee copy-link from the employee sidebar (no QR, no rotate, no "Settings → Portal").
- [ ] 🔧 `PORTAL_CUSTOMIZE` (+ demo) — accent-colour picker / "Settings → Organization" / "Settings → Portal → Sections" / "Awards" tab don't exist; toggles live in Settings + Company.
- [x] ✅ `SPOTLIGHT`
- [x] ✅ `SETTINGS_ACHIEVEMENTS`

### Workspace (Inbox / Pending / Spotlight / Tasks / Trash)
- [x] ✔️ `INBOX` — done 2026-07-12; added **`task`** (AI meeting tasks) and **`recruitment`** (start-date nudges).
- [x] ✔️ `PENDING` — done 2026-07-12; added omits **Suggested Tasks** (AI meeting action items → "Add to tasks").
- [x] ✅ `SPOTLIGHT` (workspace) — accurate.
- [x] ✔️ `TRASH` — done 2026-07-12; added the **task** type in the soft-delete list + filter; pills → FilterPanel dropdown.

### Attendance — ✍️ net-new (see above)

### Integrations
- [x] ✅ `INTEGRATIONS_OVERVIEW` (Fireflies + Asana)
- [x] ✅ `INTEGRATIONS_FIREFLIES` (nit: connect is API-key paste, not OAuth)
- [x] 🗑️ `INTEGRATIONS_SLACK` — **DELETED** 2026-07-12 (no Slack integration). Topic + registry + demo removed.
- [x] 🗑️ `INTEGRATIONS_SSO` — **DELETED** 2026-07-12 (no SSO integration). Topic + registry + demo removed.

### Settings
- [ ] 🔧 `SETTINGS_ORG` — org identity lives on the **Company** page, not a Settings "Organization" tab.
- [ ] 🔧 `SETTINGS_TIMEZONES` — wrong location; the per-user "Account → Preferences → Time zone" override doesn't exist.
- [x] ✅ `SETTINGS_APPROVALS`
- [x] ✅ `SETTINGS_LANGUAGE`
- [x] ✅ `SETTINGS_ACHIEVEMENTS`

### Billing
- [x] ✅ `BILLING_MANAGE` (nit: invoices are in the Stripe portal, not an in-app sub-section)
- [x] ✅ `BILLING_PAYMENT` (marketing copy; Stripe-mediated)
- [ ] 🔧 `BILLING_INVOICES` — NPWP is on the Company page; e-Faktur/PPN/kuitansi issuance appears aspirational.
