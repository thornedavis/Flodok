-- Portal RLS hardening — Stage B1: fold the portal's initial-load reads into
-- portal_documents.
--
-- Today Portal.tsx, after calling portal_documents, separately reads (as anon,
-- via the wide-open policies Stage D will drop):
--   * employees.*                  (the bootstrap row)
--   * sop_signatures               (the employee's SOP signatures)
--   * contract_signatures          (employee + employer sigs for the contracts)
--   * job_descriptions             (the applied-for JD)
--   * job_description_signatures   (the employee's JD signature)
--
-- portal_documents already validates slug+token and resolves the employee's
-- active SOPs/contracts, so it's the natural place to also return the employee
-- row and the signatures scoped to those documents. Everything returned is the
-- employee's own data (or the employer countersignature on their own contract),
-- so no cross-tenant exposure. Re-created verbatim from 131 with five new keys.

create or replace function public.portal_documents(
  emp_slug  text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp    public.employees%rowtype;
  org    public.organizations%rowtype;
  result jsonb;
begin
  select * into emp
  from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org from public.organizations where id = emp.org_id;

  select jsonb_build_object(
    'org', to_jsonb(org),
    'employee', to_jsonb(emp),
    'sops', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at asc)
      from public.sops s
      where s.org_id = emp.org_id
        and s.status = 'active'
        and s.deleted_at is null
        and emp.id in (select employee_id from public.sop_resolved_audience(s.id))
    ), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at asc)
      from public.contracts c
      where c.employee_id = emp.id
        and c.status = 'active'
        and c.deleted_at is null
    ), '[]'::jsonb),
    'letters', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.issued_at desc nulls last, l.created_at desc)
      from public.letters l
      where l.employee_id = emp.id
        and l.status = 'issued'
        and l.deleted_at is null
        and l.is_template = false
    ), '[]'::jsonb),
    'letter_acknowledgements', coalesce((
      select jsonb_agg(to_jsonb(la))
      from public.letter_acknowledgements la
      join public.letters l on l.id = la.letter_id
      where l.employee_id = emp.id
        and la.employee_id = emp.id
    ), '[]'::jsonb),
    -- The employee's own SOP signatures (all versions; the client maps the
    -- one matching each SOP's current_version).
    'sop_signatures', coalesce((
      select jsonb_agg(to_jsonb(sig))
      from public.sop_signatures sig
      where sig.employee_id = emp.id
    ), '[]'::jsonb),
    -- All signatures (employee + employer countersignature) on this employee's
    -- active contracts, so the rendered body can show both inline.
    'contract_signatures', coalesce((
      select jsonb_agg(to_jsonb(csig))
      from public.contract_signatures csig
      where csig.contract_id in (
        select c.id from public.contracts c
        where c.employee_id = emp.id and c.status = 'active' and c.deleted_at is null
      )
    ), '[]'::jsonb),
    -- Onboarding JD step: the applied-for JD and the employee's signature on it.
    'applied_jd', (
      select to_jsonb(jd)
      from public.job_descriptions jd
      where emp.applied_for_jd_id is not null and jd.id = emp.applied_for_jd_id
    ),
    'jd_signature', (
      select to_jsonb(jsig)
      from public.job_description_signatures jsig
      where emp.applied_for_jd_id is not null
        and jsig.job_description_id = emp.applied_for_jd_id
        and jsig.employee_id = emp.id
      order by jsig.signed_at desc
      limit 1
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_documents(text, text) to anon, authenticated;
