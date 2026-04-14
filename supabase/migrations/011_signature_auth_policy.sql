-- Allow authenticated users to also insert signatures (portal accessed while logged in)
create policy "Authenticated can insert signatures"
  on sop_signatures for insert
  to authenticated
  with check (true);
