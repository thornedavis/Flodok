-- employee_custom_fields — repeatable ad-hoc label/value entries per employee.
--
-- Surfaced under the "Additional info" tab so users can stash anything the
-- main schema doesn't cover (parking spot, ID badge, locker number, etc.)
-- without us inventing a new column every time.
--
-- Ordering uses display_order (manual, drag-to-reorder later) with a created_at
-- tiebreaker. Both label and value are free text; label is required.

create table if not exists public.employee_custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  label text not null,
  value text,
  display_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_custom_fields_employee
  on public.employee_custom_fields (employee_id, display_order, created_at);
create index if not exists idx_employee_custom_fields_org
  on public.employee_custom_fields (org_id);

create or replace function public.touch_employee_custom_field()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_custom_field_touch on public.employee_custom_fields;
create trigger trg_employee_custom_field_touch
  before update on public.employee_custom_fields
  for each row execute function public.touch_employee_custom_field();

-- ─── RLS ────────────────────────────────────────────────

alter table public.employee_custom_fields enable row level security;

create policy "Managers can manage custom fields"
  on public.employee_custom_fields for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));
