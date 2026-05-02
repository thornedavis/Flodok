-- past_due_since marks the moment a Pro subscription transitioned into
-- payment-failure retry mode. Set by the Stripe webhook handler in the
-- billing edge function on customer.subscription.updated when the status
-- flips to past_due. Cleared when status returns to active/trialing.
--
-- The dunning UI uses this timestamp to compute how many days into the
-- payment-failure grace period the org is:
--   day 0–6  → soft banner, full access
--   day 7–13 → hard banner, read-only mode
--   day 14+  → Stripe should have cancelled by now (per retry config),
--              org drops to Free with frozen UX

alter table public.organizations
  add column if not exists past_due_since timestamptz;
