-- NDA search + portal parity.
--
-- Re-creates global_search (122), portal_documents (137), and
-- portal_document_versions (138) verbatim with an 'nda' arm added so NDAs show
-- in header search, and the employee portal can load + version-browse the NDAs
-- addressed to them. Access gating mirrors contracts: an NDA is portal-visible
-- only when active, addressed to the employee, and not trashed.

-- ─── global_search: + nda group ────────────────────────
create or replace function public.global_search(
  q text,
  max_per_group int default 5
)
returns table (
  group_key  text,
  id         uuid,
  title      text,
  subtitle   text,
  status     text,
  updated_at timestamptz,
  rank       int
)
language sql
stable
security invoker
set search_path = public
as $$
  with
    needle as (
      select
        nullif(btrim(q), '') as raw,
        nullif(btrim(q), '') || '%' as prefix_pat,
        '%' || nullif(btrim(q), '') || '%' as contains_pat
    ),
    recruitment_stages as (
      select unnest(array[
        'prospective', 'shortlisted', 'offered', 'signed', 'talent_pool', 'no_show'
      ]) as stage
    ),
    emp as (
      select
        'employee'::text as group_key, e.id, e.name as title,
        e.lifecycle_stage as subtitle, e.lifecycle_stage as status, e.created_at as updated_at,
        case when e.name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.employees e, needle n
      where n.raw is not null
        and e.deleted_at is null
        and e.lifecycle_stage not in (select stage from recruitment_stages)
        and e.name ilike n.contains_pat
      order by rank, e.created_at desc
      limit max_per_group
    ),
    recruit as (
      select
        'recruitment'::text as group_key, e.id, e.name as title,
        e.lifecycle_stage as subtitle, e.lifecycle_stage as status, e.created_at as updated_at,
        case when e.name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.employees e, needle n
      where n.raw is not null
        and e.deleted_at is null
        and e.lifecycle_stage in (select stage from recruitment_stages)
        and e.name ilike n.contains_pat
      order by rank, e.created_at desc
      limit max_per_group
    ),
    sop as (
      select
        'sop'::text as group_key, s.id, s.title, s.status as subtitle, s.status, s.updated_at,
        case when s.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.sops s, needle n
      where n.raw is not null and s.deleted_at is null and s.title ilike n.contains_pat
      order by rank, s.updated_at desc
      limit max_per_group
    ),
    contract as (
      select
        'contract'::text as group_key, c.id, c.title, c.status as subtitle, c.status, c.updated_at,
        case when c.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.contracts c, needle n
      where n.raw is not null and c.deleted_at is null and c.title ilike n.contains_pat
      order by rank, c.updated_at desc
      limit max_per_group
    ),
    jd as (
      select
        'job_description'::text as group_key, j.id, j.title, j.status as subtitle, j.status, j.updated_at,
        case when j.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.job_descriptions j, needle n
      where n.raw is not null and j.deleted_at is null and j.title ilike n.contains_pat
      order by rank, j.updated_at desc
      limit max_per_group
    ),
    letter as (
      select
        'letter'::text as group_key, l.id, l.title, coalesce(l.category, l.status) as subtitle, l.status, l.updated_at,
        case when l.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.letters l, needle n
      where n.raw is not null
        and l.deleted_at is null
        and coalesce(l.is_template, false) = false
        and l.title ilike n.contains_pat
      order by rank, l.updated_at desc
      limit max_per_group
    ),
    nda as (
      select
        'nda'::text as group_key, nd.id, nd.title, nd.status as subtitle, nd.status, nd.updated_at,
        case when nd.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.ndas nd, needle n
      where n.raw is not null and nd.deleted_at is null and nd.title ilike n.contains_pat
      order by rank, nd.updated_at desc
      limit max_per_group
    ),
    template as (
      select
        'template'::text as group_key, t.id, t.title, t.type as subtitle, t.type as status, t.updated_at,
        case when t.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.document_templates t, needle n
      where n.raw is not null and t.title ilike n.contains_pat
      order by rank, t.updated_at desc
      limit max_per_group
    ),
    hiring as (
      select
        'hiring_request'::text as group_key, h.id, h.position_name as title, h.status as subtitle, h.status, h.updated_at,
        case when h.position_name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.hiring_requests h, needle n
      where n.raw is not null and h.deleted_at is null and h.position_name ilike n.contains_pat
      order by rank, h.updated_at desc
      limit max_per_group
    )

  select * from emp
  union all select * from recruit
  union all select * from sop
  union all select * from contract
  union all select * from jd
  union all select * from letter
  union all select * from nda
  union all select * from template
  union all select * from hiring;
$$;

grant execute on function public.global_search(text, int) to authenticated;

-- ─── portal_documents: + ndas + nda_signatures ─────────
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
    'ndas', coalesce((
      select jsonb_agg(to_jsonb(nd) order by nd.created_at asc)
      from public.ndas nd
      where nd.employee_id = emp.id
        and nd.status = 'active'
        and nd.deleted_at is null
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
    'sop_signatures', coalesce((
      select jsonb_agg(to_jsonb(sig))
      from public.sop_signatures sig
      where sig.employee_id = emp.id
    ), '[]'::jsonb),
    'contract_signatures', coalesce((
      select jsonb_agg(to_jsonb(csig))
      from public.contract_signatures csig
      where csig.contract_id in (
        select c.id from public.contracts c
        where c.employee_id = emp.id and c.status = 'active' and c.deleted_at is null
      )
    ), '[]'::jsonb),
    'nda_signatures', coalesce((
      select jsonb_agg(to_jsonb(nsig))
      from public.nda_signatures nsig
      where nsig.nda_id in (
        select nd.id from public.ndas nd
        where nd.employee_id = emp.id and nd.status = 'active' and nd.deleted_at is null
      )
    ), '[]'::jsonb),
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

-- ─── portal_document_versions: + 'nda' ─────────────────
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
  elsif p_doc_type = 'nda' then
    if not exists (
      select 1 from public.ndas nd
      where nd.id = p_doc_id
        and nd.employee_id = emp.id
        and nd.status = 'active'
        and nd.deleted_at is null
    ) then
      raise exception 'NDA not found' using errcode = 'P0002';
    end if;
    result := coalesce((
      select jsonb_agg(to_jsonb(v) order by v.version_number desc)
      from public.nda_versions v
      where v.nda_id = p_doc_id
    ), '[]'::jsonb);
  else
    raise exception 'Unknown doc_type: %', p_doc_type;
  end if;

  return result;
end;
$$;

revoke execute on function public.portal_document_versions(text, text, text, uuid) from public;
grant execute on function public.portal_document_versions(text, text, text, uuid) to anon, authenticated;
