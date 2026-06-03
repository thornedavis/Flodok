-- Portal RLS hardening — Stage C1: server-side JD signing for onboarding.
--
-- CandidateOnboarding signs the applied-for job description with a direct anon
-- INSERT into job_description_signatures and a direct feed_events insert. This
-- moves both server-side (mirroring portal_sign_sop / portal_sign_contract):
--   * portal_sign_jd() — token-validated signature insert, restricted to the
--     JD the candidate actually applied for.
--   * a job_description_signatures AFTER INSERT trigger emits the
--     'job_description_signed' feed event (so the front end stops inserting it).
-- Onboarding is the only JD-signature insert site, so the trigger fires exactly
-- once per signing with no duplicate.

create or replace function public.portal_sign_jd(
  emp_slug         text,
  emp_token        text,
  p_jd_id          uuid,
  p_typed_name     text,
  p_signature_font text default null
)
returns public.job_description_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  jd      public.job_descriptions%rowtype;
  new_row public.job_description_signatures%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into jd from public.job_descriptions where id = p_jd_id;
  if jd.id is null then
    raise exception 'Job description not found' using errcode = 'P0002';
  end if;
  if jd.org_id <> emp.org_id then
    raise exception 'Job description belongs to another organisation';
  end if;
  -- A candidate may only sign the JD they applied for.
  if emp.applied_for_jd_id is distinct from p_jd_id then
    raise exception 'This job description is not assigned to you' using errcode = '42501';
  end if;

  insert into public.job_description_signatures
    (job_description_id, version_number, employee_id, typed_name, signature_font)
  values
    (p_jd_id, jd.current_version, emp.id, p_typed_name, p_signature_font)
  returning * into new_row;

  -- feed event emitted by the AFTER INSERT trigger below.
  return new_row;
end;
$$;

revoke execute on function public.portal_sign_jd(text, text, uuid, text, text) from public;
grant execute on function public.portal_sign_jd(text, text, uuid, text, text) to anon, authenticated;

-- ─── feed trigger: JD signed ───────────────────────────

create or replace function public.tg_feed_jd_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jd public.job_descriptions%rowtype;
begin
  select * into jd from public.job_descriptions where id = new.job_description_id;
  if jd.id is null then
    return new;
  end if;
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    jd.org_id, new.employee_id, 'job_description_signed', jd.title,
    'Version ' || new.version_number,
    jsonb_build_object('job_description_id', new.job_description_id, 'version', new.version_number, 'signature_font', new.signature_font)
  );
  return new;
end;
$$;

drop trigger if exists job_description_signatures_feed_signed on public.job_description_signatures;
create trigger job_description_signatures_feed_signed
  after insert on public.job_description_signatures
  for each row
  execute function public.tg_feed_jd_signed();
