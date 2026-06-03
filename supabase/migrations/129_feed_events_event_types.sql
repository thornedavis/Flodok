-- Widen feed_events.event_type to cover every event the app actually emits.
--
-- The CHECK was last set in 052_spotlight.sql and never kept pace with newer
-- features, so these inserts have been silently failing — and issue_letter()
-- runs its feed insert in the SAME transaction as the status flip, so issuing
-- ANY letter previously threw on the constraint and rolled the whole issue back:
--
--   'contract_signed'        portal + candidate-onboarding contract signing
--   'job_description_signed' candidate JD signing
--   'letter_issued'          issue_letter() (migration 123)
--   'hiring_request_*'       hiring-request lifecycle, emitted dynamically as
--                            hiring_request_<kind> (submitted, manager_approved,
--                            manager_rejected, approved, owner_rejected). Matched
--                            by prefix so adding a new kind can't silently break
--                            the feed again — the one event family that is
--                            constructed dynamically (see src/lib/hiringRequests.ts).
--
-- All previously-allowed values are retained, so existing rows still validate.

alter table public.feed_events
  drop constraint if exists feed_events_event_type_check;

alter table public.feed_events
  add constraint feed_events_event_type_check
  check (
    event_type in (
      'sop_signed', 'sop_updated', 'sop_assigned',
      'contract_assigned', 'contract_updated', 'contract_signed',
      'job_description_signed',
      'letter_issued',
      'bonus_awarded',
      'welcome',
      'achievement_unlocked',
      'spotlight_published'
    )
    or event_type ~ '^hiring_request_'
  );
