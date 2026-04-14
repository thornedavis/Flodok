-- Backfill feed events from existing SOP versions
insert into feed_events (org_id, employee_id, event_type, title, description, metadata, created_at)
select
  s.org_id,
  s.employee_id,
  'sop_updated',
  s.title,
  'Version ' || sv.version_number || coalesce(' — ' || sv.change_summary, ''),
  jsonb_build_object('sop_id', s.id, 'version', sv.version_number),
  sv.created_at
from sop_versions sv
join sops s on s.id = sv.sop_id
where s.employee_id is not null;

-- Backfill feed events from existing signatures
insert into feed_events (org_id, employee_id, event_type, title, description, metadata, created_at)
select
  s.org_id,
  sig.employee_id,
  'sop_signed',
  s.title,
  'Version ' || sig.version_number,
  jsonb_build_object('sop_id', s.id, 'version', sig.version_number, 'signature_font', sig.signature_font),
  sig.signed_at
from sop_signatures sig
join sops s on s.id = sig.sop_id;

-- Backfill welcome events for all existing employees
insert into feed_events (org_id, employee_id, event_type, title, description, metadata, created_at)
select
  e.org_id,
  e.id,
  'welcome',
  e.name,
  null,
  '{}',
  e.created_at
from employees e;
