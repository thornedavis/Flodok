-- Letter-issued feed event (Phase 7).
--
-- Extends issue_letter (migration 119) to insert a feed_events row in
-- the same transaction once a draft is flipped to 'issued'. The
-- recipient now sees "A new letter has been issued to you" in their
-- portal feed/inbox, matching how SOPs and contracts surface there.
--
-- event_type = 'letter_issued' so the Portal feed renderer can map it
-- to a dedicated icon + label.

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

  -- Notify the recipient via the portal feed. The same transaction so a
  -- failure here rolls the issue back rather than leaving a half-issued
  -- letter that no one's been told about.
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    result_letter.org_id,
    result_letter.employee_id,
    'letter_issued',
    result_letter.title,
    coalesce(result_letter.category, 'Letter'),
    jsonb_build_object(
      'letter_id', result_letter.id,
      'reference_number', result_letter.reference_number,
      'requires_acknowledgement', result_letter.requires_acknowledgement
    )
  );

  return result_letter;
end;
$$;

revoke execute on function public.issue_letter(uuid) from public, anon;
grant  execute on function public.issue_letter(uuid) to authenticated;
