-- Portal RLS hardening — Stage C2: onboarding profile / lifecycle / emergency
-- contacts move onto token-validated RPCs, so CandidateOnboarding stops writing
-- the employees + employee_emergency_contacts tables directly (anon).

-- ─── portal_update_onboarding_profile ──────────────────
-- The candidate fills in their own onboarding fields across several steps.
-- p_patch carries only the keys for the current step; ONLY the whitelisted
-- onboarding fields below are writable — lifecycle_stage, slug, access_token,
-- salary, org_id, etc. can never be set this way. Fields absent from the patch
-- are left unchanged.

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

-- ─── portal_get_employee ───────────────────────────────
-- Re-read the employee row (used after document uploads).

create or replace function public.portal_get_employee(
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
  return emp;
end;
$$;

revoke execute on function public.portal_get_employee(text, text) from public;
grant execute on function public.portal_get_employee(text, text) to anon, authenticated;

-- ─── portal_advance_to_signed ──────────────────────────
-- Flip lifecycle_stage 'offered' -> 'signed' once the required signatures
-- exist. Conditions are re-derived server-side (not trusted from the client):
-- an active contract must have the employee's current-version signature, and
-- an applied-for JD must have the employee's current-version signature.
-- Idempotent: a no-op unless currently 'offered' with all requirements met.

create or replace function public.portal_advance_to_signed(
  emp_slug  text,
  emp_token text
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp         public.employees%rowtype;
  contract_ok boolean;
  jd_ok       boolean;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if emp.lifecycle_stage <> 'offered' then
    return emp;  -- nothing to do
  end if;

  -- Every active contract addressed to this employee must carry their
  -- current-version signature (no active contract => trivially satisfied).
  contract_ok := not exists (
    select 1 from public.contracts c
    where c.employee_id = emp.id and c.status = 'active' and c.deleted_at is null
      and not exists (
        select 1 from public.contract_signatures cs
        where cs.contract_id = c.id
          and cs.employee_id = emp.id
          and cs.signer_role = 'employee'
          and cs.version_number = c.current_version
      )
  );

  -- If they applied for a JD it must carry their current-version signature.
  jd_ok := emp.applied_for_jd_id is null or exists (
    select 1
    from public.job_description_signatures js
    join public.job_descriptions jd on jd.id = js.job_description_id
    where js.job_description_id = emp.applied_for_jd_id
      and js.employee_id = emp.id
      and js.version_number = jd.current_version
  );

  if contract_ok and jd_ok then
    update public.employees set lifecycle_stage = 'signed'
    where id = emp.id
    returning * into emp;
  end if;

  return emp;
end;
$$;

revoke execute on function public.portal_advance_to_signed(text, text) from public;
grant execute on function public.portal_advance_to_signed(text, text) to anon, authenticated;

-- ─── emergency contacts ────────────────────────────────

create or replace function public.portal_get_emergency_contact(
  emp_slug  text,
  emp_token text
)
returns public.employee_emergency_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  ec  public.employee_emergency_contacts%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into ec from public.employee_emergency_contacts
  where employee_id = emp.id
  order by created_at
  limit 1;

  return ec;  -- null row if none
end;
$$;

revoke execute on function public.portal_get_emergency_contact(text, text) from public;
grant execute on function public.portal_get_emergency_contact(text, text) to anon, authenticated;

-- Upsert the employee's single emergency contact (edit rather than duplicate).

create or replace function public.portal_upsert_emergency_contact(
  emp_slug        text,
  emp_token       text,
  p_name          text,
  p_relationship  text,
  p_phone         text
)
returns public.employee_emergency_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  emp        public.employees%rowtype;
  existing_id uuid;
  ec         public.employee_emergency_contacts%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select id into existing_id from public.employee_emergency_contacts
  where employee_id = emp.id
  order by created_at
  limit 1;

  if existing_id is not null then
    update public.employee_emergency_contacts
    set name = p_name, relationship = p_relationship, phone = p_phone, updated_at = now()
    where id = existing_id
    returning * into ec;
  else
    insert into public.employee_emergency_contacts (org_id, employee_id, name, relationship, phone)
    values (emp.org_id, emp.id, p_name, p_relationship, p_phone)
    returning * into ec;
  end if;

  return ec;
end;
$$;

revoke execute on function public.portal_upsert_emergency_contact(text, text, text, text, text) from public;
grant execute on function public.portal_upsert_emergency_contact(text, text, text, text, text) to anon, authenticated;
