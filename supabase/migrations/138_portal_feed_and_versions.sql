-- Portal RLS hardening — Stage B2: token-validated feed + version reads.
--
-- The last direct anon reads in Portal.tsx are the activity feed (feed_events)
-- and the lazy-loaded version history (sop_versions / contract_versions). These
-- RPCs replace them so Stage D can drop the remaining anon SELECT policies.

-- ─── portal_feed ───────────────────────────────────────
-- The employee's own feed events, newest first, capped at p_limit. The client
-- derives the "recent informational" subset (achievements / bonuses / spotlight)
-- from this same payload.

create or replace function public.portal_feed(
  emp_slug  text,
  emp_token text,
  p_limit   int default 200
)
returns jsonb
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

  return coalesce((
    select jsonb_agg(to_jsonb(fe) order by fe.created_at desc)
    from (
      select * from public.feed_events
      where employee_id = emp.id
      order by created_at desc
      limit greatest(coalesce(p_limit, 200), 1)
    ) fe
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.portal_feed(text, text, int) from public;
grant execute on function public.portal_feed(text, text, int) to anon, authenticated;

-- ─── portal_document_versions ──────────────────────────
-- Version history for one SOP or contract the employee can access. Same access
-- gate as portal_documents: SOPs must be active + in the employee's resolved
-- audience; contracts must be active + addressed to the employee.

create or replace function public.portal_document_versions(
  emp_slug   text,
  emp_token  text,
  p_doc_type text,
  p_doc_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp    public.employees%rowtype;
  result jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if p_doc_type = 'sop' then
    if not exists (
      select 1 from public.sops s
      where s.id = p_doc_id
        and s.org_id = emp.org_id
        and s.status = 'active'
        and s.deleted_at is null
        and emp.id in (select employee_id from public.sop_resolved_audience(s.id))
    ) then
      raise exception 'SOP not found' using errcode = 'P0002';
    end if;
    result := coalesce((
      select jsonb_agg(to_jsonb(v) order by v.version_number desc)
      from public.sop_versions v
      where v.sop_id = p_doc_id
    ), '[]'::jsonb);
  elsif p_doc_type = 'contract' then
    if not exists (
      select 1 from public.contracts c
      where c.id = p_doc_id
        and c.employee_id = emp.id
        and c.status = 'active'
        and c.deleted_at is null
    ) then
      raise exception 'Contract not found' using errcode = 'P0002';
    end if;
    result := coalesce((
      select jsonb_agg(to_jsonb(v) order by v.version_number desc)
      from public.contract_versions v
      where v.contract_id = p_doc_id
    ), '[]'::jsonb);
  else
    raise exception 'Unknown doc_type: %', p_doc_type;
  end if;

  return result;
end;
$$;

revoke execute on function public.portal_document_versions(text, text, text, uuid) from public;
grant execute on function public.portal_document_versions(text, text, text, uuid) to anon, authenticated;
