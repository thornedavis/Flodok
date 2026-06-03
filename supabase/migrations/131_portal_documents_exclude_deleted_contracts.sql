-- Stop portal_documents from leaking soft-deleted contracts.
--
-- The contracts arm (119_letter_rpcs.sql) filtered only on status = 'active'
-- and omitted the deleted_at guard that the sops and letters arms already have.
-- Because this function is SECURITY DEFINER it bypasses RLS, so a contract that
-- was trashed (deleted_at set) but not yet purged — and still status 'active' —
-- kept showing in the employee's portal for up to the 30-day retention window.
-- Re-created verbatim from 119 with `and c.deleted_at is null` added.

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
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_documents(text, text) to anon, authenticated;
