-- ─── global_search ────────────────────────────────────────────────────────
--
-- Backs the header search modal. Returns a small ranked, grouped result set
-- across the entities a user can edit/open from the dashboard.
--
-- Title-only matching (no body text) — kept cheap so the UI can debounce
-- ~150ms and feel instant. Ranking is prefix-first, then substring, then
-- recency.
--
-- SECURITY INVOKER: every SELECT below runs as the caller, so the existing
-- RLS policies on each source table do the audience/role gating for us. No
-- audience logic is re-implemented here.
--
-- Recruitment is just `employees` filtered by lifecycle_stage — split into
-- two groups so an employee never appears under both "Employees" and
-- "Recruitment". The recruitment stages mirror RECRUITMENT_STAGES in
-- src/pages/dashboard/Recruitment.tsx.
--
-- Letters used as templates (is_template = true) are excluded; only rows in
-- public.document_templates contribute to the 'template' group.

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

    -- ── Employees (active roster: everything not in recruitment stages) ──
    emp as (
      select
        'employee'::text as group_key,
        e.id,
        e.name as title,
        e.lifecycle_stage as subtitle,
        e.lifecycle_stage as status,
        e.created_at as updated_at,
        case when e.name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.employees e, needle n
      where n.raw is not null
        and e.deleted_at is null
        and e.lifecycle_stage not in (select stage from recruitment_stages)
        and e.name ilike n.contains_pat
      order by rank, e.created_at desc
      limit max_per_group
    ),

    -- ── Recruitment (employees in candidate-side stages) ─────────────────
    recruit as (
      select
        'recruitment'::text as group_key,
        e.id,
        e.name as title,
        e.lifecycle_stage as subtitle,
        e.lifecycle_stage as status,
        e.created_at as updated_at,
        case when e.name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.employees e, needle n
      where n.raw is not null
        and e.deleted_at is null
        and e.lifecycle_stage in (select stage from recruitment_stages)
        and e.name ilike n.contains_pat
      order by rank, e.created_at desc
      limit max_per_group
    ),

    -- ── SOPs ─────────────────────────────────────────────────────────────
    sop as (
      select
        'sop'::text as group_key,
        s.id,
        s.title,
        s.status as subtitle,
        s.status,
        s.updated_at,
        case when s.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.sops s, needle n
      where n.raw is not null
        and s.deleted_at is null
        and s.title ilike n.contains_pat
      order by rank, s.updated_at desc
      limit max_per_group
    ),

    -- ── Contracts ────────────────────────────────────────────────────────
    contract as (
      select
        'contract'::text as group_key,
        c.id,
        c.title,
        c.status as subtitle,
        c.status,
        c.updated_at,
        case when c.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.contracts c, needle n
      where n.raw is not null
        and c.deleted_at is null
        and c.title ilike n.contains_pat
      order by rank, c.updated_at desc
      limit max_per_group
    ),

    -- ── Job descriptions ─────────────────────────────────────────────────
    jd as (
      select
        'job_description'::text as group_key,
        j.id,
        j.title,
        j.status as subtitle,
        j.status,
        j.updated_at,
        case when j.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.job_descriptions j, needle n
      where n.raw is not null
        and j.deleted_at is null
        and j.title ilike n.contains_pat
      order by rank, j.updated_at desc
      limit max_per_group
    ),

    -- ── Letters (issued + drafts, not template rows) ─────────────────────
    letter as (
      select
        'letter'::text as group_key,
        l.id,
        l.title,
        coalesce(l.category, l.status) as subtitle,
        l.status,
        l.updated_at,
        case when l.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.letters l, needle n
      where n.raw is not null
        and l.deleted_at is null
        and coalesce(l.is_template, false) = false
        and l.title ilike n.contains_pat
      order by rank, l.updated_at desc
      limit max_per_group
    ),

    -- ── Document templates ───────────────────────────────────────────────
    template as (
      select
        'template'::text as group_key,
        t.id,
        t.title,
        t.type as subtitle,
        t.type as status,
        t.updated_at,
        case when t.title ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.document_templates t, needle n
      where n.raw is not null
        and t.title ilike n.contains_pat
      order by rank, t.updated_at desc
      limit max_per_group
    ),

    -- ── Hiring requests ──────────────────────────────────────────────────
    hiring as (
      select
        'hiring_request'::text as group_key,
        h.id,
        h.position_name as title,
        h.status as subtitle,
        h.status,
        h.updated_at,
        case when h.position_name ilike (select prefix_pat from needle) then 0 else 1 end as rank
      from public.hiring_requests h, needle n
      where n.raw is not null
        and h.deleted_at is null
        and h.position_name ilike n.contains_pat
      order by rank, h.updated_at desc
      limit max_per_group
    )

  select * from emp
  union all select * from recruit
  union all select * from sop
  union all select * from contract
  union all select * from jd
  union all select * from letter
  union all select * from template
  union all select * from hiring;
$$;

comment on function public.global_search(text, int) is
  'Header search: ranked, grouped, title-only matches across editable entities. SECURITY INVOKER so per-table RLS applies.';

grant execute on function public.global_search(text, int) to authenticated;
