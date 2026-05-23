-- Extend trash_document to handle the new 'letter' doc type.
--
-- The existing function (108_trash_more_rpcs.sql) branched on
-- 'sop' | 'contract' | 'job_description'. Letters share the same
-- soft-delete shape (deleted_at + deleted_by columns) so the branch
-- is mechanical: look up org via letters, assert caller-in-org, stamp
-- deleted_at + deleted_by.

create or replace function public.trash_document(
  p_doc_id uuid,
  p_doc_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_org uuid;
  actor uuid := auth.uid();
begin
  if p_doc_type = 'sop' then
    select org_id into doc_org from public.sops
    where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'contract' then
    select org_id into doc_org from public.contracts
    where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'job_description' then
    select org_id into doc_org from public.job_descriptions
    where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'letter' then
    select org_id into doc_org from public.letters
    where id = p_doc_id and deleted_at is null;
  else
    raise exception 'Unknown doc_type: %', p_doc_type;
  end if;

  if doc_org is null then
    raise exception 'Document not found or already trashed';
  end if;

  perform public._trash_assert_caller_authorized(doc_org);

  if p_doc_type = 'sop' then
    update public.sops set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  elsif p_doc_type = 'contract' then
    update public.contracts set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  elsif p_doc_type = 'job_description' then
    update public.job_descriptions set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  else
    update public.letters set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  end if;
end;
$$;
