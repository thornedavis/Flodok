-- Letters trash RLS: exclude soft-deleted rows from the normal-access policy.
--
-- The letters table (118) shipped its "manage your org's letters" policy
-- WITHOUT the `and deleted_at is null` guard that every sibling document
-- table carries — employees/sops/contracts via 103, job_descriptions via
-- 107, ndas via 146. The omission let trashed letters leak straight back
-- into routine queries: the unified Documents dashboard, the per-type
-- listing, and the editor load all read `letters` directly and rely on RLS
-- to hide trashed rows, exactly like the other document types.
--
-- Symptom: trashing a letter (typically a just-created blank draft) looked
-- like it did nothing. The dashboard tile vanished optimistically but
-- reappeared on the next fetch, the row could still be opened in the
-- editor, and a second delete failed with "Document not found or already
-- trashed" — the trash_document RPC correctly filters deleted_at, so it
-- found no live row to trash.
--
-- The Trash UI (list_trash) and restore/purge all run through SECURITY
-- DEFINER RPCs that bypass RLS, so tightening this policy does NOT hide
-- trashed letters from the Trash page or block restore — same as the
-- other types post-103.

drop policy if exists "Managers can manage their org letters" on public.letters;
create policy "Managers can manage their org letters" on public.letters
  for all to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());
