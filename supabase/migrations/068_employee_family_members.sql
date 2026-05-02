-- employee_family_members — one-to-many family records per employee.
--
-- Mirrors Talenta's "Family" tab fields. The is_emergency_contact flag is a
-- shortcut for promoting a family member into the Emergency contact list
-- (the form has an "Add to emergency contact" checkbox); the Emergency
-- contact tab will read these flagged rows in addition to any standalone
-- emergency contacts added later.
--
-- All enum-style fields share the controlled vocab used on `employees`
-- (gender, marital_status, religion) so the picker UI is consistent.

create table if not exists public.employee_family_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  full_name text not null,
  relationship text not null
    check (relationship in ('spouse', 'child', 'parent', 'sibling', 'grandparent', 'grandchild', 'in_law', 'other')),
  is_emergency_contact boolean not null default false,

  -- Optional details (mirrors Talenta's Add Family Info form).
  address text,
  id_number text,
  gender text
    check (gender is null or gender in ('male', 'female')),
  birthdate date,
  religion text
    check (religion is null or religion in ('islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other')),
  marital_status text
    check (marital_status is null or marital_status in ('single', 'married', 'divorced', 'widowed')),
  job text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_family_members_employee
  on public.employee_family_members (employee_id, created_at);

create index if not exists idx_employee_family_members_org
  on public.employee_family_members (org_id);

-- Touch updated_at on row update.
create or replace function public.touch_employee_family_member()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_family_member_touch on public.employee_family_members;
create trigger trg_employee_family_member_touch
  before update on public.employee_family_members
  for each row execute function public.touch_employee_family_member();

-- ─── RLS ────────────────────────────────────────────────

alter table public.employee_family_members enable row level security;

create policy "Managers can manage family members"
  on public.employee_family_members for all
  to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));
