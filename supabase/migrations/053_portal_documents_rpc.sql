-- Portal-side document access for anonymous employee sessions.
--
-- The public employee portal is authenticated by employees.slug +
-- employees.access_token, not by a Supabase auth session. Direct table reads
-- for organizations and contracts therefore fail when the employee opens the
-- portal on a phone/browser that is not logged into Flodok.
--
-- This RPC validates the portal token and returns only the employee-scoped
-- documents/context the portal needs to render the public experience.

create or replace function public.portal_documents(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  org public.organizations%rowtype;
  result jsonb;
begin
  select * into emp
  from public.employees
  where slug = emp_slug
    and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org
  from public.organizations
  where id = emp.org_id;

  select jsonb_build_object(
    'org', to_jsonb(org),
    'sops', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at asc)
      from public.sops s
      where s.employee_id = emp.id
        and s.status = 'active'
    ), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at asc)
      from public.contracts c
      where c.employee_id = emp.id
        and c.status = 'active'
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_documents(text, text) to anon, authenticated;
