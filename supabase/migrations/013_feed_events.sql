-- Activity feed events for employee portal
create table if not exists feed_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  employee_id uuid references employees on delete cascade,
  event_type text not null check (event_type in (
    'sop_signed', 'sop_updated', 'sop_assigned',
    'contract_assigned', 'contract_updated',
    'bonus_awarded',
    'welcome'
  )),
  title text not null,
  description text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_feed_events_employee on feed_events (employee_id, created_at desc);
create index idx_feed_events_org on feed_events (org_id, created_at desc);

-- RLS
alter table feed_events enable row level security;

-- Managers can manage feed events in their org
create policy "Managers can manage feed events"
  on feed_events for all
  using (org_id in (select org_id from users where id = auth.uid()));

-- Public (anon) can view feed events for any employee (accessed via slug+token, app filters by employee_id)
create policy "Public can view feed events"
  on feed_events for select
  to anon
  using (true);

-- Authenticated can also view (for portal accessed while logged in)
create policy "Authenticated can view feed events"
  on feed_events for select
  to authenticated
  using (true);

-- Allow anon and authenticated to insert (for signature events from portal)
create policy "Anon can insert feed events"
  on feed_events for insert
  to anon
  with check (true);

create policy "Authenticated can insert feed events"
  on feed_events for insert
  to authenticated
  with check (true);
