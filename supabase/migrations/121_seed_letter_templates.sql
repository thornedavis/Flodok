-- Seed empty letter templates per org (Phase 5).
--
-- Inserts 6 letter-template rows into document_templates for each
-- existing org, with type='letter' and a sensible title but no body.
-- Users fill in the content via the existing template editor — the
-- house style and exact wording (especially the Indonesian phrasing)
-- belongs to the org, not to this seed.
--
-- Idempotency: guarded per (org_id, title) so re-running the migration
-- against an org that already has these templates is a no-op. The
-- titles double as the natural key here because document_templates
-- doesn't currently have a unique constraint on (org_id, type, title).

-- First, widen the type CHECK to allow 'letter' alongside the existing
-- doc types. The original constraint from the templates feature
-- restricted to sop / contract / job_description.
alter table public.document_templates
  drop constraint if exists document_templates_type_check;

alter table public.document_templates
  add constraint document_templates_type_check
  check (type in ('sop', 'contract', 'job_description', 'letter'));

do $$
declare
  org record;
  tpl record;
  template_titles text[] := array[
    'Offering Letter',
    'Promotion Letter',
    'Salary Adjustment Letter',
    'Warning Letter',
    'Termination Letter',
    'Reference / Recommendation Letter'
  ];
  title_v text;
begin
  for org in select id from public.organizations loop
    foreach title_v in array template_titles loop
      -- Skip if a same-titled letter template already exists for this org.
      perform 1 from public.document_templates
       where org_id = org.id
         and type   = 'letter'
         and title  = title_v
       limit 1;
      if found then continue; end if;

      insert into public.document_templates (org_id, type, title)
      values (org.id, 'letter', title_v);
    end loop;
  end loop;

  -- Surface the count of templates seeded for visibility in migration logs.
  for tpl in
    select org_id, count(*) as n
    from public.document_templates
    where type = 'letter'
    group by org_id
  loop
    raise notice 'seed_letter_templates: org=% has % letter template(s)', tpl.org_id, tpl.n;
  end loop;
end $$;
