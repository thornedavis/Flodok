-- Trash system: 30-day soft-delete for employees, sops, contracts.
--
-- Adds deleted_at / deleted_by columns plus a trashed_with_parent_id pointer
-- so SOPs/contracts that were cascade-trashed alongside an employee can be
-- restored together. RLS updates and SECURITY DEFINER RPCs land in 103.
--
-- FK behavior change on sops.employee_id and contracts.employee_id: was
-- ON DELETE CASCADE, becomes ON DELETE SET NULL. The "delete employee only"
-- path leaves the docs floating (employee_id = NULL) once purge fires; the
-- cascade path independently soft-deletes the docs, so the FK is moot.

-- ─── employees ──────────────────────────────────────────

alter table public.employees
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_employees_trash
  on public.employees (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_employees_deleted_at
  on public.employees (deleted_at)
  where deleted_at is not null;

-- ─── sops ───────────────────────────────────────────────

alter table public.sops
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists trashed_with_parent_id uuid;

-- Drop the NOT NULL so unlinked SOPs can survive a purged employee.
alter table public.sops alter column employee_id drop not null;

-- Swap the FK from CASCADE to SET NULL.
alter table public.sops drop constraint if exists sops_employee_id_fkey;
alter table public.sops
  add constraint sops_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;

create index if not exists idx_sops_trash
  on public.sops (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_sops_deleted_at
  on public.sops (deleted_at)
  where deleted_at is not null;

create index if not exists idx_sops_trashed_with_parent
  on public.sops (trashed_with_parent_id)
  where trashed_with_parent_id is not null;

-- ─── contracts ──────────────────────────────────────────

alter table public.contracts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists trashed_with_parent_id uuid;

alter table public.contracts drop constraint if exists contracts_employee_id_fkey;
alter table public.contracts
  add constraint contracts_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;

create index if not exists idx_contracts_trash
  on public.contracts (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_contracts_deleted_at
  on public.contracts (deleted_at)
  where deleted_at is not null;

create index if not exists idx_contracts_trashed_with_parent
  on public.contracts (trashed_with_parent_id)
  where trashed_with_parent_id is not null;
