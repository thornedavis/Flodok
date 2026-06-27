-- Two low-severity hardening items.
--
--   L2  Prevent a tenant member from self-granting the platform-admin bit.
--   L5  Make portal employee-signing single-use / idempotent (no duplicate rows
--       on double-click / retry / re-visit).

-- ── L2: lock down is_platform_admin ──────────────────────────────────────────
-- The users UPDATE policy (132) pins role and org_id but NOT is_platform_admin,
-- so any authenticated member could PATCH their own row to set it true. It's
-- inert today (only a cosmetic UI gate reads it) but would become a cross-tenant
-- hole the moment any policy/function trusts the flag. Remove the column from
-- the client-writable set entirely; the SECURITY DEFINER functions that manage
-- users run as owner and are unaffected.
revoke update (is_platform_admin) on public.users from authenticated, anon;

-- ── L5: single-use portal signing ───────────────────────────────────────────
-- sop_signatures already has a (sop_id, employee_id, version_number) unique
-- index (111). contract / nda / jd did not, and their portal_sign_* RPCs did a
-- bare INSERT, so a re-submit produced a second employee-signature row. Add the
-- same guard and make each RPC idempotent: a repeat sign of the same version
-- returns the existing signature instead of erroring or duplicating.

-- Defensive dedup so the unique indexes can be created on existing data
-- (keeps one employee signature per doc/version; pre-onboarding test data only).
delete from public.contract_signatures cs using (
  select id, row_number() over (
    partition by contract_id, employee_id, version_number order by id
  ) as rn
  from public.contract_signatures where signer_role = 'employee'
) d where cs.id = d.id and d.rn > 1;

delete from public.nda_signatures ns using (
  select id, row_number() over (
    partition by nda_id, employee_id, version_number order by id
  ) as rn
  from public.nda_signatures where signer_role = 'employee'
) d where ns.id = d.id and d.rn > 1;

delete from public.job_description_signatures js using (
  select id, row_number() over (
    partition by job_description_id, employee_id, version_number order by id
  ) as rn
  from public.job_description_signatures
) d where js.id = d.id and d.rn > 1;

-- Partial unique indexes on the employee-signature path (employer countersigns
-- have employee_id null / signer_role='employer', so they're excluded).
create unique index if not exists contract_signatures_uq_employee_version
  on public.contract_signatures (contract_id, employee_id, version_number)
  where signer_role = 'employee';

create unique index if not exists nda_signatures_uq_employee_version
  on public.nda_signatures (nda_id, employee_id, version_number)
  where signer_role = 'employee';

-- job_description_signatures has no signer_role column — only employees sign.
create unique index if not exists jd_signatures_uq_employee_version
  on public.job_description_signatures (job_description_id, employee_id, version_number);

-- Idempotent portal_sign_contract: return the existing signature on conflict.
create or replace function public.portal_sign_contract(
  emp_slug         text,
  emp_token        text,
  p_contract_id    uuid,
  p_typed_name     text,
  p_signature_font text default null,
  p_consent_text   text default null,
  p_document_hash  text default null,
  p_user_agent     text default null
)
returns public.contract_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  con     public.contracts%rowtype;
  new_row public.contract_signatures%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into con from public.contracts where id = p_contract_id;
  if con.id is null or con.deleted_at is not null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if con.org_id <> emp.org_id then
    raise exception 'Contract belongs to another organisation';
  end if;
  if con.employee_id <> emp.id then
    raise exception 'This contract is not addressed to you' using errcode = '42501';
  end if;
  if con.status <> 'active' then
    raise exception 'Contract is not active and cannot be signed';
  end if;

  begin
    insert into public.contract_signatures
      (contract_id, version_number, employee_id, typed_name, signature_font,
       signer_role, consent_text, document_hash, user_agent, signer_email, signer_phone)
    values
      (p_contract_id, con.current_version, emp.id, p_typed_name, p_signature_font,
       'employee', p_consent_text, p_document_hash, p_user_agent, emp.email, emp.phone)
    returning * into new_row;
  exception when unique_violation then
    -- Already signed this version (double-click / retry / re-visit): return the
    -- existing row, no second feed event.
    select * into new_row from public.contract_signatures
    where contract_id = p_contract_id and employee_id = emp.id
      and version_number = con.current_version and signer_role = 'employee'
    limit 1;
  end;

  return new_row;
end;
$$;

-- Idempotent portal_sign_nda.
create or replace function public.portal_sign_nda(
  emp_slug         text,
  emp_token        text,
  p_nda_id         uuid,
  p_typed_name     text,
  p_signature_font text default null,
  p_consent_text   text default null,
  p_document_hash  text default null,
  p_user_agent     text default null
)
returns public.nda_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  nda     public.ndas%rowtype;
  new_row public.nda_signatures%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into nda from public.ndas where id = p_nda_id;
  if nda.id is null or nda.deleted_at is not null then
    raise exception 'NDA not found' using errcode = 'P0002';
  end if;
  if nda.org_id <> emp.org_id then
    raise exception 'NDA belongs to another organisation';
  end if;
  if nda.employee_id <> emp.id then
    raise exception 'This NDA is not addressed to you' using errcode = '42501';
  end if;
  if nda.status <> 'active' then
    raise exception 'NDA is not active and cannot be signed';
  end if;

  begin
    insert into public.nda_signatures
      (nda_id, version_number, employee_id, typed_name, signature_font,
       signer_role, consent_text, document_hash, user_agent, signer_email, signer_phone)
    values
      (p_nda_id, nda.current_version, emp.id, p_typed_name, p_signature_font,
       'employee', p_consent_text, p_document_hash, p_user_agent, emp.email, emp.phone)
    returning * into new_row;
  exception when unique_violation then
    select * into new_row from public.nda_signatures
    where nda_id = p_nda_id and employee_id = emp.id
      and version_number = nda.current_version and signer_role = 'employee'
    limit 1;
  end;

  return new_row;
end;
$$;

-- Idempotent portal_sign_jd.
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
  if emp.applied_for_jd_id is distinct from p_jd_id then
    raise exception 'This job description is not assigned to you' using errcode = '42501';
  end if;

  begin
    insert into public.job_description_signatures
      (job_description_id, version_number, employee_id, typed_name, signature_font)
    values
      (p_jd_id, jd.current_version, emp.id, p_typed_name, p_signature_font)
    returning * into new_row;
  exception when unique_violation then
    select * into new_row from public.job_description_signatures
    where job_description_id = p_jd_id and employee_id = emp.id
      and version_number = jd.current_version
    limit 1;
  end;

  return new_row;
end;
$$;
