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
