-- Letter RPCs (Phase 2).
--
-- Four pieces:
--
-- 1. letter_reference_seqs — small bookkeeping table that tracks the
--    last-used sequence number per (org, type_code, year) so reference
--    numbers can be allocated atomically without two concurrent issues
--    grabbing the same digit.
--
-- 2. next_letter_reference_number(org, type_code, year) — atomically
--    increments the sequence and substitutes the org's
--    letter_reference_prefix template ({type_code}/{YYYY}/{seq}).
--
-- 3. issue_letter(letter_id) — admin/HR call. Validates the letter is
--    a draft tagged to an employee, generates a reference_number if
--    none is set yet, snapshots the current content into
--    letter_versions, stamps issued_at, and flips status to 'issued'.
--
-- 4. acknowledge_letter(slug, token, letter_id, ...) — portal-anon
--    RPC mirroring portal_sign_sop. Validates the portal session,
--    checks the calling employee is the letter's recipient, the
--    letter is issued, and requires_acknowledgement is on. Inserts
--    a letter_acknowledgements row; the unique index on
--    (letter_id, employee_id, version_number) rejects duplicates.
--
-- portal_documents is also extended to include the employee's issued
-- letters plus their own acknowledgement rows, so the portal can show
-- "Acknowledged on X" without a second round-trip.

-- ─── letter_reference_seqs ──────────────────────────────────

create table if not exists public.letter_reference_seqs (
  org_id    uuid not null references public.organizations(id) on delete cascade,
  type_code text not null,
  year      int  not null,
  last_used int  not null default 0,
  primary key (org_id, type_code, year)
);

alter table public.letter_reference_seqs enable row level security;

-- No direct read/write — the only path to this table is the
-- next_letter_reference_number SECURITY DEFINER function.

-- ─── next_letter_reference_number ───────────────────────────

create or replace function public.next_letter_reference_number(
  p_org_id    uuid,
  p_type_code text,
  p_year      int default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org      uuid;
  prefix_template text;
  yr              int;
  seq             int;
  type_code_safe  text;
  result          text;
begin
  -- Callable from authenticated users in the same org, or from another
  -- SECURITY DEFINER function (which is responsible for its own auth).
  if auth.uid() is not null then
    select org_id into caller_org from public.users where id = auth.uid();
    if caller_org is null or caller_org <> p_org_id then
      raise exception 'Organisation mismatch';
    end if;
  end if;

  yr := coalesce(p_year, extract(year from now())::int);
  type_code_safe := coalesce(p_type_code, '');

  select coalesce(letter_reference_prefix, 'HR-{type_code}/{YYYY}/{seq}')
    into prefix_template
    from public.organizations
   where id = p_org_id;

  if prefix_template is null then
    raise exception 'Organisation not found' using errcode = 'P0002';
  end if;

  -- Atomic claim of the next sequence number.
  insert into public.letter_reference_seqs (org_id, type_code, year, last_used)
       values (p_org_id, type_code_safe, yr, 1)
  on conflict (org_id, type_code, year) do update
       set last_used = public.letter_reference_seqs.last_used + 1
  returning last_used into seq;

  result := prefix_template;
  result := replace(result, '{type_code}', type_code_safe);
  result := replace(result, '{YYYY}',      yr::text);
  result := replace(result, '{seq}',       lpad(seq::text, 4, '0'));

  return result;
end;
$$;

revoke execute on function public.next_letter_reference_number(uuid, text, int) from public, anon;
grant  execute on function public.next_letter_reference_number(uuid, text, int) to authenticated;

-- ─── issue_letter ───────────────────────────────────────────

create or replace function public.issue_letter(p_letter_id uuid)
returns public.letters
language plpgsql
security definer
set search_path = public
as $$
declare
  letter        public.letters%rowtype;
  caller_org    uuid;
  generated_ref text;
  result_letter public.letters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into letter from public.letters where id = p_letter_id;
  if letter.id is null or letter.deleted_at is not null then
    raise exception 'Letter not found' using errcode = 'P0002';
  end if;

  select org_id into caller_org from public.users where id = auth.uid();
  if caller_org is null or caller_org <> letter.org_id then
    raise exception 'Letter belongs to another organisation';
  end if;

  if letter.is_template then
    raise exception 'Templates cannot be issued';
  end if;
  if letter.status <> 'draft' then
    raise exception 'Letter is not a draft (current status: %)', letter.status;
  end if;
  if letter.employee_id is null then
    raise exception 'Letter must be tagged to an employee before issuing';
  end if;

  -- Allocate a reference_number if the issuer hasn't set one manually.
  if letter.reference_number is null or trim(letter.reference_number) = '' then
    generated_ref := public.next_letter_reference_number(
      letter.org_id,
      coalesce(letter.type_code, ''),
      extract(year from now())::int
    );
    update public.letters
       set reference_number = generated_ref
     where id = p_letter_id;
    letter.reference_number := generated_ref;
  end if;

  -- Snapshot the content as version N so the audit trail of "what the
  -- employee was issued" is preserved against later edits.
  insert into public.letter_versions
    (letter_id, version_number, content_doc, content_markdown, content_markdown_id, change_summary, changed_by)
  values
    (letter.id, letter.current_version, letter.content_doc, letter.content_markdown, letter.content_markdown_id, 'Issued', auth.uid())
  on conflict (letter_id, version_number) do nothing;

  update public.letters
     set status     = 'issued',
         issued_at  = now(),
         updated_at = now()
   where id = p_letter_id
   returning * into result_letter;

  return result_letter;
end;
$$;

revoke execute on function public.issue_letter(uuid) from public, anon;
grant  execute on function public.issue_letter(uuid) to authenticated;

-- ─── acknowledge_letter ─────────────────────────────────────

create or replace function public.acknowledge_letter(
  emp_slug         text,
  emp_token        text,
  p_letter_id      uuid,
  p_typed_name     text default null,
  p_signature_font text default null
)
returns public.letter_acknowledgements
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  letter  public.letters%rowtype;
  new_row public.letter_acknowledgements%rowtype;
begin
  -- Portal auth: slug + access_token must match a non-trashed employee.
  select * into emp from public.employees
   where slug = emp_slug and access_token = emp_token and deleted_at is null
   limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into letter from public.letters where id = p_letter_id;
  if letter.id is null or letter.deleted_at is not null then
    raise exception 'Letter not found' using errcode = 'P0002';
  end if;
  if letter.org_id <> emp.org_id then
    raise exception 'Letter belongs to another organisation';
  end if;
  if letter.status <> 'issued' then
    raise exception 'Letter has not been issued and cannot be acknowledged';
  end if;
  if letter.employee_id is null or letter.employee_id <> emp.id then
    raise exception 'You are not the recipient of this letter' using errcode = '42501';
  end if;
  if not letter.requires_acknowledgement then
    raise exception 'This letter does not require acknowledgement';
  end if;

  insert into public.letter_acknowledgements
    (letter_id, employee_id, version_number, typed_name, signature_font)
  values
    (p_letter_id, emp.id, letter.current_version, p_typed_name, p_signature_font)
  returning * into new_row;

  return new_row;
end;
$$;

revoke execute on function public.acknowledge_letter(text, text, uuid, text, text) from public;
grant  execute on function public.acknowledge_letter(text, text, uuid, text, text) to anon, authenticated;

-- ─── portal_documents (extended for letters) ────────────────

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
