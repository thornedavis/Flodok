# Founder Console (`/dashboard/admin`)

A platform-wide operations dashboard for the Flodok founder. Cross-tenant by
design — it reads every org's data, so access is gated server-side on
`users.is_platform_admin` on every query path, never UI-only.

Status: **Phases 1–3 built** (2026-06-30) — frontend compiles (`tsc -b &&
vite build` green); edge functions edited but not Deno-typechecked locally (deno
not installed). Migrations `180`/`181`/`183` not yet applied; edge functions not
yet redeployed. Only remaining gap: per-org instrumentation of the Fireflies
worker (see Phase 2). See "Deploying".

---

## Why

One login (`hello@thornedavis.com`) needs a "god view" of the whole platform:
who's signed up, who's paying, who's churning, who's active, and what the AI
bill looks like. Today none of this is visible without hand-querying Postgres
and the OpenRouter dashboard.

## Access model (the load-bearing invariant)

- Gate column: `users.is_platform_admin` (boolean, added in migration 051).
  Currently only read in `Settings.tsx`; we set it `true` for the founder in
  migration 180.
- **Every** cross-org read goes through a `SECURITY DEFINER` RPC (or a
  service-role edge function) whose first act is:
  `if not (select is_platform_admin from users where id = auth.uid()) then raise exception 'Not authorized'`.
  This matches the existing `admin_*` RPC pattern (e.g. `admin_update_user_role`).
- The frontend `Admin.tsx` also redirects non-admins, and the nav item only
  renders when `is_platform_admin` — but those are convenience, not security.
  RLS + the RPC guard are the real boundary.
- **Data sensitivity:** this console exposes every org's PII, compensation, and
  tax IDs (NPWP). Keep the gate strict. Never expose these RPCs to
  `anon`/`authenticated` without the in-function admin check.

## Pricing / MRR model (confirmed)

From `src/lib/pricing.ts` — billing scales with **employee count**, not user
seats:

- **Free:** Rp 0, capped at `FREE_EMPLOYEE_LIMIT = 2` employees.
- **Pro:** graduated brackets, IDR/mo, billed quantity = `max(employees, 3)`:
  - employees 1–15 → Rp 100,000 each
  - employees 16–40 → Rp 70,000 each
  - employees 41+ → Rp 50,000 each
- `organizations.subscription_quantity` holds the billed employee count
  (synced to Stripe by `supabase/functions/billing` on every employee CRUD).
- Checkout currently uses a single monthly lookup key (`pro_monthly_idr`); no
  annual flow is live, so all active Pro subs are monthly.

**MRR per org** = `calculateProMonthlyIdr(subscription_quantity)` for orgs with
`plan_tier = 'pro'` and `subscription_status` in {active, trialing, past_due}.
Reuse `calculateProMonthlyIdr` from `src/lib/pricing.ts` directly on the
frontend — do not re-implement the brackets in SQL. The RPC returns
`subscription_quantity`; the page computes the rupiah.

---

## Panels

1. **Pulse row (KPIs):** total orgs · active (logged in <30d) · new this week ·
   total users · total employees managed · MRR (IDR) · paid/trial/past-due/free
   split · AI spend this month + Δ · activation % (onboarding completed).
2. **Accounts table (core):** one row per org — name, plan badge, status badge,
   signup date, onboarding done, last login (max `auth.users.last_sign_in_at`
   across its users), last activity (max `updated_at` across content), counts
   (users/employees/contracts/sops/forms/ndas), MRR contribution, seats vs
   actual users, `past_due_since` dunning day-counter, Stripe customer
   deep-link. Row click → org detail (Phase 3).
3. **Billing / revenue:** status breakdown · dunning queue (past_due with day
   counter vs the 7/14-day thresholds) · trials ending soon ·
   `cancel_at_period_end` churn list · seat over/under-utilization.
4. **AI usage & cost (Phase 2):** spend this month + trend · by function · by
   model · by org · tokens in/out · top spenders.
5. **Activity & adoption (Phase 3):** signups over time · active-orgs trend ·
   feature-adoption breadth · at-risk/dormant orgs · empty accounts ·
   owner-claim pending.

---

## Architecture

- **Frontend:** `src/pages/dashboard/Admin.tsx`, route `/dashboard/admin` in
  `App.tsx` (inside the `DashboardLayout` block). Nav: a separate block rendered
  above the main `navItems` in `Layout.tsx`, shown only when `is_platform_admin`.
  New `navAdmin` translation key.
- **Org/billing/login data:** `SECURITY DEFINER` SQL RPCs (migration 180).
  Created in a migration → owned by `postgres` → can read the `auth` schema for
  `last_sign_in_at`.
- **AI cost data (Phase 2):** service-role edge function `admin-metrics`
  (verifies `is_platform_admin`) pulls OpenRouter account totals (reuses the
  existing `OPENROUTER_API_KEY`) for instant pre-instrumentation history, and
  reads the new `ai_usage` table for per-org/function/model breakdowns.
- **AI instrumentation (Phase 2):** `supabase/functions/_shared/logUsage.ts`.
  Each of the 7 AI edge functions + the flodok-router worker adds
  `usage: { include: true }` to its OpenRouter request (OpenRouter then returns
  cost in USD directly — no pricing table to maintain) and fire-and-forgets an
  insert into `ai_usage`.

---

## Phases

### Phase 1 — Accounts, billing & login (all from existing data) ✅ built

Migration `180_platform_admin_and_overview_rpcs.sql`:
- `update users set is_platform_admin = true where lower(email) = 'hello@thornedavis.com'`.
- **One** `SECURITY DEFINER` RPC, `admin_org_rows()`, returning a rich per-org
  row: org_id, name, display_name, owner_name, owner_email, plan_tier,
  subscription_status, subscription_quantity, past_due_since, current_period_end,
  cancel_at_period_end, stripe_customer_id, created_at, onboarding_completed_at,
  user_count, employee_count, contract_count, sop_count, form_count, nda_count,
  last_login (max `auth.users.last_sign_in_at`), last_activity (greatest
  `max(updated_at)` across content). Counts use correlated subqueries (no
  fan-out join). Guard re-checks `is_platform_admin` of `auth.uid()`.
- **No separate overview RPC** — the page derives every pulse KPI (totals,
  active-in-30d, new-this-week, activation %, MRR, paying/trial/past-due) from
  the org rows in one pass. Single source of truth.

Frontend:
- `src/pages/dashboard/Admin.tsx` — pulse cards + accounts table (search, status
  filter, sortable columns, status badges, dunning day-counter, over-seat flag,
  Stripe deep-links). MRR via `calculateProMonthlyIdr(subscription_quantity)`.
- `Admin` route in `App.tsx`; `adminNavItem` pinned atop the sidebar in
  `Layout.tsx`, rendered only when `is_platform_admin`; `navAdmin` label (EN+ID).
- `admin_org_rows` registered in `database.ts` `Functions` so the typed client
  accepts it (will match on next `npm run gen:types` once the migration is live).

### Deploying Phase 1

1. Apply migration 180 (`supabase db push`, or paste into the SQL editor).
2. Confirm the founder's `users` row got `is_platform_admin = true` (it only
   matches if the row already exists; re-run or set by hand otherwise).
3. **Verify the `auth.users` read works:** `admin_org_rows()` reads
   `auth.users.last_sign_in_at` as a postgres-owned SECURITY DEFINER function.
   If a hardened project blocks that, move the last-login lookup into a
   service-role edge function (or drop it) — everything else is `public` schema.
4. `npm run gen:types` to regenerate `database.ts` cleanly (optional; the manual
   entry already matches).

### Phase 2 — AI cost (instrumentation + panel) ✅ built

- Migration `181_ai_usage.sql`: `ai_usage` table (org_id [FK, on-delete-set-null],
  called_by, function_name, model, provider, prompt/completion/total tokens,
  cost_usd, created_at), RLS = platform-admin read only / no client writes, +
  `admin_ai_usage(since, until)` RPC returning total + by_function + by_model +
  by_org + by_day as jsonb.
- `supabase/functions/_shared/logUsage.ts` — `extractUsage()` + `logAiUsage()`
  (service-role insert; resolves org_id from `called_by` when not passed;
  fire-and-forget, never throws into the request path).
- **Instrumented 6 OpenRouter call sites** (each adds `usage: { include: true }`
  → OpenRouter returns cost in USD, no rate table):
  - inline: `analyse-document`, `pair-bilingual`, `generate-document`
  - shared: `_shared/translate.ts` (→ `translate-sop` + `translate-text`),
    `_shared/rewrite.ts` (→ `rewrite-text`) — both take an optional `logCtx`.
- `supabase/functions/admin-metrics/` — platform-admin-gated edge function
  returning OpenRouter account totals (`/api/v1/credits`): balance + all-time
  usage. Covers pre-instrumentation history and the un-instrumented worker.
- `Admin.tsx` AI panel: spend/tokens (30d) + OpenRouter balance/all-time cards,
  and By function / By model / Top orgs breakdown bars. Pulse "AI spend" card now
  shows real 30-day cost.
- `admin_ai_usage` registered in `database.ts` `Functions`.

**Deferred — the Fireflies worker (`flodok-router/src/llm.ts`) is NOT yet
per-org instrumented.** It's a separate Cloudflare deploy (Claude Sonnet,
3 calls/transcript) and logging from it needs the worker to reach Supabase
(service-role creds or an ingest endpoint). Its spend still shows in the
account-level OpenRouter total; only per-org attribution is missing. Fast-follow.

### Deploying Phase 2

1. Apply migration 181 (`supabase db push`).
2. Redeploy the touched edge functions (they import the changed shared helpers):
   `analyse-document`, `pair-bilingual`, `generate-document`, `translate-sop`,
   `translate-text`, `rewrite-text`, and the new `admin-metrics`
   (`supabase functions deploy <name>`).
3. `OPENROUTER_API_KEY` is already set (reused). No new secrets.
4. Per-org rows accrue from deploy forward; account totals are immediate.

### Phase 3 — Charts, adoption & org drill-in ✅ built

- Migration `183_admin_org_detail.sql`: `admin_org_detail(p_org_id)` RPC →
  org + billing, content counts, member list with each user's `last_sign_in_at`,
  30-day AI spend for the org, and any pending `owner_claims` row. Registered in
  `database.ts` `Functions`.
- **Row-click drawer** (`OrgDetailDrawer` in `Admin.tsx`) — right-side slide-over
  with billing / content / AI / users sections, owner-claim banner, Esc-to-close.
  Rows are now clickable (the Stripe link stops propagation).
- **Signups chart** — 12-month bar chart (Recharts), derived client-side from the
  loaded rows (no extra query).
- **AI spend-per-day** area chart in the AI panel, from `admin_ai_usage.by_day`.
- **Health & risk** lists — Dormant (30d+) · Empty accounts · Setup incomplete ·
  Ownerless (claim likely pending). All derived from rows; each item opens the
  drawer.

### Deploying Phase 3

1. Apply migration 183 (`supabase db push`). No new edge functions or secrets.
2. Frontend ships with the existing build — no extra steps.

---

## Open items / inputs

- Login *trend* charts (DAU/WAU/MAU over time) need a `last_seen` touch we don't
  have yet — `last_sign_in_at` is point-in-time only. Acceptable for v1; revisit
  in Phase 3 if trends matter.
- Confirm exact OpenRouter analytics endpoint for account-level history during
  Phase 2 (credits endpoint gives balance/total; per-day breakdown TBD).
