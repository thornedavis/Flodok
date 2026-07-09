# Recruitment pipeline redesign (`/dashboard/recruitment`)

Reimagines the Recruitment page around **where each person is on their path** and
**whose court the ball is in**, so staging someone from recruit → employee is
visible and controllable instead of a flat list with a silent hand-off at the end.

Interactive mockup (reference): the "Recruitment pipeline — redesign" artifact.

## Why

Today the page is a filterable table. Three problems (validated in the code):

1. **No sense of progression.** Stage is a flat pill-dropdown ([`StagePicker`](../src/pages/dashboard/Recruitment.tsx)); side-exits (`talent_pool`, `no_show`) sit next to forward steps as equals, and `no_show` has no action behind it at all.
2. **The portal hand-off is a black box.** Once an offer is sent you get no signal until the badge flips to `Signed` — a candidate stuck on step 5 looks identical to one who never opened the link.
3. **Becoming an employee is invisible + fragile.** `signed → active` is a lazy auto-flip in [`lifecycleAdvance.ts`](../src/lib/lifecycleAdvance.ts) gated on `join_date` — a field with **no home in the recruitment flow** ([only settable from the full employee panel](../src/components/employee/sections/employment/EmploymentDatesPanel.tsx)). Miss it and the hire is stuck in `Signed` forever.

## Locked decisions (from review 2026-07-07)

- **JD required to send an offer.** No candidate reaches `offered` without a linked JD. Kills the "optional JD" branching in the portal — the sign-JD step is always present post-offer.
- **Pre-offer = profile only.** Before an offer, the portal exposes personal-profile fields only; JD/contract/signing appear only after `offered`.
- **Drop the four summary cards.** The "needs you / blocked / ready / scheduled" strip above the board is cut. Replace with a single lightweight **"Needs you (N)"** filter toggle among the view controls; the amber in-column chips already make attention items pop. (See [Surfacing "needs you"](#surfacing-needs-you).)

## Core model (the load-bearing idea)

Two derived values sit on top of each candidate row. Both are **pure functions** of
the employee row + a small `CandidateSignals` bundle — no new columns.

### 1. Board column (a *sub-state*, richer than `lifecycle_stage`)

| Column | Derivation |
|---|---|
| `prospective` | `lifecycle_stage === 'prospective'` |
| `shortlisted` | `lifecycle_stage === 'shortlisted'` |
| `offered` | `lifecycle_stage === 'offered'` |
| `signed_onboarding` | `signed` AND (onboarding incomplete **or** no `join_date`) |
| `starting_soon` | `signed` AND onboarding complete AND `join_date` set (today/future) |

`talent_pool` / `no_show` are **off-board** (reachable via the stage filter / a "Show
inactive" toggle) — they are not stages on the forward path.

### 2. Status = who the ball is with (the whole point)

`{ actor, labelKey }` where `actor` drives colour and the top-of-drawer banner:

| actor | colour | meaning | example triggers |
|---|---|---|---|
| `needs_you` | amber | your move to advance them | review & shortlist · make offer · **add a JD to offer** · activate today |
| `with_them` | grey | waiting on the candidate, nothing for you | awaiting JD/contract signature · filling profile (`x/7`) |
| `scheduled` | blue | done, future start date, on track | "Starts Jul 15" |
| `ready` | green | start date is today | "Ready to start — activate" |
| `stuck` | red | ready but blocked by a missing thing you own | signed + fully onboarded but **no start date set** |

> Note vs mockup: this refines the mock's colours — a shortlisted-without-JD is
> `needs_you` (amber, your move), and `stuck` (red) is reserved for a hire who is
> ready but can't proceed (the no-start-date trap). Confirm at build time.

## Data — what to load

Extend [`loadData()`](../src/pages/dashboard/Recruitment.tsx) (keeps the existing
recruit query + `advanceSignedToActiveForOrg`). For the `offered` + `signed` cohort
only, batch-fetch the signals that decide status — **no N+1**:

- **Contract signal:** does the candidate have an active contract, and has *they* signed it? (one `in('employee_id', ids)` query over contracts + a matching one over contract signatures).
- **JD signal:** `applied_for_jd_id` is already on the row; add a batched query over JD signatures for the cohort.
- **Onboarding completion:** reuse [`computeProfileSections` / `profileCompletionPercentFromEmployee`](../src/lib/candidateProfile.ts). v1 uses the employee-row variant for the card chip; the drawer fetches the related counts (education/experience/family/emergency) for an exact `x/7`.
- **`join_date`:** already on the row.

Assemble a `Map<employeeId, CandidateSignals>` and hand it to the pure derivations.

## Page architecture

```
Recruitment (page)
├─ header: title · view toggle [Board | List] · "Needs you (N)" toggle · + Add candidate
├─ FilterPanel (reused: search, stage, position, dept, source, sort)
├─ <RecruitmentBoard>   ← default view
│    └─ column ×5 → <CandidateCard> (avatar · PathTracker mini · status chip · meta)
├─ <RecruitmentList>    ← alt view (candidate · PathTracker labelled · status chip)
└─ <CandidateDrawer>    ← slide-out on card/row click
```

Both views render from the **same filtered candidate set**; the toggle only swaps
presentation. View choice persists in `localStorage` (mirrors the existing
`flodok.recruitment.columns` pattern).

## Views

### Board
Five columns (above). Column header = coloured dot + label + count. Cards are
buttons opening the drawer. Column is horizontally scrollable on its own container
(page body never scrolls sideways).

### List
Keeps search/sort/filter. Each row: candidate identity · full labelled `PathTracker`
· status chip. This *is* the "single line" per-person view.

### Detail drawer (slide-out)
Opens on card/row click; scrim + `Esc`/click-out to close. Contents:
- Header (avatar, name, role, source) + large `PathTracker`.
- Actor banner ("Waiting on Dewi — on 'Tax & banking', last active 4 min ago").
- **Journey checklist**: added · shortlisted · offer sent (contract) · JD (linked/signed) · contract signed · onboarding (`x/7` with a section grid) · start date.
- **Controls**: Move stage (reuse `changeStage`/`StagePicker` semantics) · **Set start date** (writes `join_date` — *the fix*) · **Activate now** (manual `signed → active`) · Open full profile ([CandidateEdit](../src/pages/dashboard/CandidateEdit.tsx)) · Message on WhatsApp / Copy portal link (reuse existing).

## Surfacing "needs you"

The four cards are replaced by a single **"Needs you (N)"** toggle beside the
view switch. `N = count(actor ∈ {needs_you, stuck, ready})`. Toggling filters both
views to just those candidates. Rationale: keeps "make sure everything's getting
done" one click away without a heavy strip eating vertical space; the amber/red
chips already carry the signal in-column.

## `PathTracker` component

`src/components/recruitment/PathTracker.tsx` — one component, three sizes
(`mini` card, `row` labelled, `lg` drawer). Nodes: Prospective → Shortlisted →
Offered → Signed → Active. Props: `pathIndex`, `imminent?` (dashes the Active node
for `starting_soon`). Uses existing `STAGE_TONES`/success/accent tokens.

## i18n

All new labels through [`translations.ts`](../src/lib/translations.ts) (en + id):
column titles, status labels, drawer section headings, actions. Reuse existing
`hiringStage*`, `hiringAction*` keys where they already say the right thing.

## Build phases

**Phase 1 — the board (this plan's focus).** Visualise first.
1. `recruitmentStatus.ts` — pure `deriveBoardColumn` + `deriveStatus` + types, with vitest tests. *(no-regret foundation — start here)*
2. `PathTracker` component.
3. Extend `loadData` with the batched contract/JD-signature signals → `CandidateSignals`.
4. `RecruitmentBoard` + `CandidateCard`.
5. `RecruitmentList` rows (path + status), reusing the filtered set.
6. View toggle + "Needs you" filter + persistence.
7. `CandidateDrawer` (journey + Set start date + Activate now + move + links).
8. i18n keys.

**Phase 2 — the offer gate.** Make-offer modal requires a linked JD; show JD-readiness on shortlisted cards. Enforces decision 1.

**Phase 3 — the portal split.** Profile-only before offer; signing steps only after `offered`; settle JD-first-vs-contract-first order. Enforces decision 2. Touches [`CandidateOnboarding.tsx`](../src/components/portal/CandidateOnboarding.tsx) + [`Portal.tsx`](../src/pages/public/Portal.tsx).

**Phase 4 — nudges.** Shared status helper feeds an inbox event when a candidate finishes onboarding or is ready to start.

## Open decisions (recommended defaults in **bold**)

- Inactive stages (`talent_pool`/`no_show`) on the board: **off-board, reachable via a "Show inactive" filter**.
- Default view: **Board**, persisted per browser.
- Board card completion accuracy: **cheap employee-row variant for the chip; exact `x/7` in the drawer**.
- `no_show`: **give it a real "Mark as no-show" action in the drawer, or retire it** — decide in Phase 1 step 7 (don't leave it a dead option).
- Start-date entry: **drawer in Phase 1; also add to make-offer in Phase 2**.

## Files touched (map)

**New**
- `src/lib/recruitmentStatus.ts` (+ `recruitmentStatus.test.ts`)
- `src/components/recruitment/PathTracker.tsx`
- `src/components/recruitment/RecruitmentBoard.tsx`
- `src/components/recruitment/CandidateCard.tsx`
- `src/components/recruitment/CandidateDrawer.tsx`

**Changed**
- `src/pages/dashboard/Recruitment.tsx` — view toggle, board/list render, drawer wiring, extended data fetch, "Needs you" filter. (Keep filters, bulk-delete, add-candidate, MakeOffer modal.)
- `src/lib/translations.ts` — new keys (en + id).

**Untouched in Phase 1**
- `lifecycleAdvance.ts` (drawer's "Activate now" calls the existing single-employee advance), MakeOffer modal (Phase 2), portal (Phase 3).

## Invariants / risks

- **No recruit bleed:** keep the `RECRUITMENT_STAGES` scoping on the load query (see [lifecycle.ts](../src/lib/lifecycle.ts)).
- **No N+1:** signature/JD signals must be batched over the cohort id list.
- **RLS:** authed dashboard reads are already `deleted_at`-stripped; no service-role paths added here.
- **Don't regress** existing filters, sort, column persistence, bulk-delete, or the CandidateEdit deep-link.
- **Bilingual:** every new string via `translations.ts`; no hard-coded copy.
- `deriveStatus`/`deriveBoardColumn` are pure and unit-tested — the derivation is the load-bearing logic, so it gets the test coverage.

---

# Addendum — the screening-gate model (locked 2026-07-09)

A design review reframed the pre-offer profile from **offer-prep** to a
**screening instrument**, and split data collection into trust-timed waves. Where
this contradicts the plan above, this addendum wins (superseded items called out
under [Supersedes](#supersedes--refines-above)). Not built yet — this is the spec.

## The reframe

The onboarding profile is not "the candidate getting ready to receive an offer."
It is the **deeper vet you run after the Indeed cut but before you spend time
interviewing** — the fields a job board can't reliably give you (exact address,
marital status, religion, age, national ID). Its output is a **go/no-go decision
sitting in HR's court**, not a readiness signal. Everything below follows from that.

Screening criteria are demographic/identity fields (age via DOB, religion, marital
status, location). That is normal, legal practice in the Indonesian hiring market;
the app treats them as ordinary decision inputs.

## Decision 1 — keep both pre-offer stages; profile-completion is the bridge

`prospective` and `shortlisted` both stay, because the **batch-import-and-vet**
workflow is real (pull 20 promising profiles off Indeed, narrow to a few), and the
event that separates the two stages is now concrete:

- **Prospective** — imported, portal link sent, *waiting on them.* Grey. The triage
  pile; ball in the candidate's court.
- **→ candidate completes the screening core ← (the boundary event)**
- **Shortlisted** — profile is in, *your move to vet for suitability.* Amber. Not
  suitable → `talent_pool`; suitable → JD + offer.

Completing the screening core **advances `prospective → shortlisted`** server-side,
following the existing auto-advance precedent (`portal_advance_to_signed`, the
join-date advance in `lifecycleAdvance.ts`). The manual `StagePicker` drag stays as
an override (see Decision 3).

## Decision 2 — what's collected when (three tiers, timed to trust)

One section-driven portal; the **visible section set is a function of
`lifecycle_stage`**. Not two separate builds — progressive disclosure.

| Tier | When | Fields | Enforcement |
|---|---|---|---|
| **1 · Screening** | pre-offer (prospective) | personal + identity core: name, DOB (→age), gender, place of birth, address · **NIK number** · religion · marital status | completing it advances `prospective → shortlisted` |
| **2 · Employment setup** | the instant they sign, **same session** | bank details · NPWP · **KTP photo/scan** · emergency contact | *"so we can set you up & pay you"* — reality-enforced (no bank = no salary) |
| **3 · Record enrichment** | anytime after, self-paced | family members · formal education · work experience | never blocks; lives as a "complete your profile" card on the portal home |

**KTP note (important):** *KTP* = the Indonesian national ID card; `ktp_nik` = the
**NIK**, the 16-digit national ID number on it — which *is* the "employee ID number"
we need. Keep the **number** in Tier 1 (routine, low-friction). Defer a **photo/scan
of the card** to Tier 2 — KTP images are the raw material for *pinjol*/identity fraud,
so candidates are rightly wary of sending one to a company that hasn't hired them.
Same logic defers **bank details** to Tier 2.

Education/work-history are deliberately **not** in the Tier-1 gate: Indeed already
covers competence, and keeping the gate to ~5 minutes protects completion rate.

## Decision 3 — Tier-1 is mandatory; the only override is "HR fills it in"

Mandatory, because **it is what makes the feature work** — you cannot rank
candidates on age/religion/location if half the fields are blank — and because it is
**sunk work for anyone you actually hire**. HR's cost is one link; the candidate
bears the effort, and only for data they'd provide anyway.

- **No "true skip"** (advancing with an empty profile). By the premise *"if we hire
  them we need all of it,"* a permanent skip has no valid end state.
- **The one override is Tier 2 of the earlier draft: HR keys the screening fields in
  themselves** (via `CandidateEdit`) — data is *real*, just entered by HR. Handles
  the strong referral / senior hire you don't want to send through a portal.
- **Honest board (non-negotiable):** a candidate manually advanced without a profile
  must visibly read *"profile skipped / no profile on file"* and the suitability step
  must say *"review manually."* A skip must never masquerade as a completed screen.

**Principle for future gates:** hard-gate what is *wrong* if skipped (JD-required-to-
offer — a contractual defect); soft-gate what is merely *worse* if skipped (this).

## Decision 4 — least-friction collection

**The trust curve is the whole trick:** the friction of asking for sensitive data
*collapses the moment they sign*. A signed contract is exactly the trust that makes a
bank/KTP ask reasonable — so ask **right after the signature, in the same session**,
flowing straight out of it (*"🎉 You're hired! A few details so we can get you set up
→"*) rather than dead-ending on a "done" screen. "Come back later" is the fallback for
drop-offs, not the plan. Keep the Tier-2 mandatory continuation short (~5 fields + one
upload); Tier 3 is punted to self-paced.

Friction rules:

1. **Never re-ask what you have.** Tier-1 data pre-fills and shows ✓; later waves only
   surface gaps. Reads as *continuing*, never *repeating*.
2. **Continue-now, resume-later.** The same portal link (persistent `access_token`)
   re-lands a returning candidate on exactly what's outstanding — the `signed →
   'personal'` resume path already exists in embryo in `CandidateOnboarding.tsx`.
3. **Hide the future, don't grey it out.** Pre-offer, Tier 2/3 sections aren't shown at
   all — a short clean form gets finished; a wall of "later" rows signals a big
   commitment and tanks Tier-1 completion.
4. **Purpose copy per tier.** *"so we can review your application"* vs *"so we can pay
   you."* Sensitive asks land when the *why* is obviously in the candidate's interest.
5. **Save & finish later + home checklist + optional WhatsApp nudge** for stragglers —
   the record completes itself over time without HR chasing.

## Creation flow

The plumbing already matches the target and needs only a lighter surface:

- **Add candidate** (`Recruitment.tsx handleAddCandidate`) already creates the row as
  `prospective` and **mints the portal `access_token` immediately** — the link exists
  the instant the candidate does.
- **Name is the only required field** (`CandidateEdit` `canSubmit`); phone is optional.
- **Gap:** Add currently navigates into the *full* editor (`/edit?new=1`). Replace with
  a lightweight "*Max is added — here's his link to send*" affordance. Phone stays
  optional but is worth *nudging* (needed for the in-app WhatsApp send).

## Status / derivation changes this implies

- **`deriveStatus` `prospective`:** should be `with_them` (awaiting/filling profile),
  **not** the current `needs_you` — a fresh import is the candidate's move, not yours.
  Removes a spurious amber nag the instant you add someone.
- **`shortlisted`:** stays `needs_you`; its *first* sub-state reads "review for
  suitability," then "add JD / make offer."
- **Journey checklist reorder:** the onboarding node moves to **between Added and
  Shortlisted** (completing it is what makes them shortlisted) — replacing today's
  order that draws it 6th, after Offer sent + Contract signed.
- **New auto-advance:** a portal RPC flips `prospective → shortlisted` when the Tier-1
  sections are complete (mirrors `portal_advance_to_signed`).

## Supersedes / refines above

- **"Pre-offer = profile only"** (Locked decisions) → refined: pre-offer = the **Tier-1
  screening subset** only, and completion is now a **stage-advancing gate**, not
  opportunistic completion.
- **Journey order** "…contract signed · onboarding · start date" (Detail drawer) →
  onboarding moves to between Added and Shortlisted.
- **`deriveStatus` prospective** returning `needs_you`/`filling_profile` → `with_them`.

## Open items

- **Stale prospective pile:** non-responders accumulate (a feature — they self-select
  out), but add a *"no response in N days"* flag/nudge so the column doesn't rot.
- **Exact Tier-1 subset:** confirm whether education/experience are in or out (leaning
  out).
- **Tier-2 "complete enough" definition** for payroll readiness (bank + NPWP + KTP
  photo) vs. Tier-3 optional enrichment.
- **BPJS dependents:** family members feed BPJS Kesehatan — may warrant a stronger
  nudge than pure Tier-3.
