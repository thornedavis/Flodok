-- Screening gate (docs/recruitment-pipeline-plan.md — screening-gate addendum).
-- Candidates self-fill a light screening profile pre-offer; completing it advances
-- prospective -> shortlisted. Two changes:
--   1. portal_update_onboarding_profile gains gender / religion / marital_status in
--      its writable whitelist. Migration 140 never collected these, so the portal
--      never captured the demographic fields HR actually screens on.
--   2. new portal_advance_to_shortlisted flips the stage once the screening subset
--      is present — re-derived server-side, never trusted from the client.

-- ─── portal_update_onboarding_profile (+ gender/religion/marital_status) ──────
create or replace function public.portal_update_onboarding_profile(
  emp_slug  text,
  emp_token text,
  p_patch   jsonb
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  update public.employees set
    ktp_nik             = case when p_patch ? 'ktp_nik'             then p_patch->>'ktp_nik'             else ktp_nik end,
    date_of_birth       = case when p_patch ? 'date_of_birth'       then (p_patch->>'date_of_birth')::date else date_of_birth end,
    place_of_birth      = case when p_patch ? 'place_of_birth'      then p_patch->>'place_of_birth'      else place_of_birth end,
    address             = case when p_patch ? 'address'             then p_patch->>'address'             else address end,
    postal_code         = case when p_patch ? 'postal_code'         then p_patch->>'postal_code'         else postal_code end,
    gender              = case when p_patch ? 'gender'              then p_patch->>'gender'              else gender end,
    religion            = case when p_patch ? 'religion'            then p_patch->>'religion'            else religion end,
    marital_status      = case when p_patch ? 'marital_status'      then p_patch->>'marital_status'      else marital_status end,
    npwp                = case when p_patch ? 'npwp'                then p_patch->>'npwp'                else npwp end,
    bank_name           = case when p_patch ? 'bank_name'           then p_patch->>'bank_name'           else bank_name end,
    bank_account_number = case when p_patch ? 'bank_account_number' then p_patch->>'bank_account_number' else bank_account_number end,
    bank_account_holder = case when p_patch ? 'bank_account_holder' then p_patch->>'bank_account_holder' else bank_account_holder end,
    ktp_photo_url       = case when p_patch ? 'ktp_photo_url'       then p_patch->>'ktp_photo_url'       else ktp_photo_url end,
    kk_photo_url        = case when p_patch ? 'kk_photo_url'        then p_patch->>'kk_photo_url'        else kk_photo_url end
  where id = emp.id
  returning * into emp;

  return emp;
end;
$$;

revoke execute on function public.portal_update_onboarding_profile(text, text, jsonb) from public;
grant execute on function public.portal_update_onboarding_profile(text, text, jsonb) to anon, authenticated;

-- ─── portal_advance_to_shortlisted ───────────────────────────────────────────
-- Flip 'prospective' -> 'shortlisted' once the screening subset is filled in. The
-- subset is re-derived server-side (never trusted from the client): NIK, date of
-- birth, gender, religion, marital status, address. Idempotent — a no-op unless
-- currently 'prospective' with every screening field present. Keep these fields in
-- sync with the pre-offer PersonalStep in CandidateOnboarding.tsx.
create or replace function public.portal_advance_to_shortlisted(
  emp_slug  text,
  emp_token text
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if emp.lifecycle_stage <> 'prospective' then
    return emp;  -- nothing to do
  end if;

  if emp.ktp_nik         is not null and btrim(emp.ktp_nik)         <> ''
     and emp.date_of_birth  is not null
     and emp.gender         is not null and btrim(emp.gender)         <> ''
     and emp.religion       is not null and btrim(emp.religion)       <> ''
     and emp.marital_status is not null and btrim(emp.marital_status) <> ''
     and emp.address        is not null and btrim(emp.address)        <> ''
  then
    update public.employees set lifecycle_stage = 'shortlisted'
    where id = emp.id
    returning * into emp;
  end if;

  return emp;
end;
$$;

revoke execute on function public.portal_advance_to_shortlisted(text, text) from public;
grant execute on function public.portal_advance_to_shortlisted(text, text) to anon, authenticated;
