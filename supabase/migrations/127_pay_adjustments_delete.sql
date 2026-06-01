-- Allow admins to delete a mistaken reward/penalty — but only while the period
-- is still open. Once a period is closed (paid_out_at set), pay is settled and
-- the row is locked, mirroring the insert freeze guard.

create policy "Admins delete open pay adjustments in own org"
  on public.pay_adjustments for delete
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and paid_out_at is null
  );
