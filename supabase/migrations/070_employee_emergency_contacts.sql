-- employee_emergency_contacts — standalone emergency contacts per employee.
--
-- Talenta's emergency-contact form is intentionally minimal (Name +
-- Relationship + Phone — see "Add Emergency Contact" modal). Family members
-- with the is_emergency_contact flag are surfaced separately in the same
-- tab; that flag stays on employee_family_members and isn't promoted into
-- this table automatically (avoids two sources of truth).
--
-- Phone is stored as plain text (not E.164-validated at the DB layer) since
-- Talenta exports may include locally-formatted numbers. The UI normalizes.

create table if not exists public.employee_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  name text not null,
  relationship text not null
    check (relationship in ('spouse', 'child', 'parent', 'sibling', 'grandparent', 'grandchild', 'in_law', 'friend', 'other')),
  phone text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_emergency_contacts_employee
  on public.employee_emergency_contacts (employee_id, created_at);

create index if not exists idx_employee_emergency_contacts_org
  on public.employee_emergency_contacts (org_id);

create or replace function public.touch_employee_emergency_contact()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_emergency_contact_touch on public.employee_emergency_contacts;
create trigger trg_employee_emergency_contact_touch
  before update on public.employee_emergency_contacts
  for each row execute function public.touch_employee_emergency_contact();

-- ─── RLS ────────────────────────────────────────────────

alter table public.employee_emergency_contacts enable row level security;

create policy "Managers can manage emergency contacts"
  on public.employee_emergency_contacts for all
  to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));
