-- Per-user state for inbox items.
--
-- Inbox items themselves are *derived* at query time from existing entity
-- state (contracts awaiting signature, pending_updates, employees with
-- upcoming probation_end_date / passport_expiry, etc.) — there is no
-- separate inbox_items table. This keeps the inbox always-fresh and avoids
-- a cron job to materialize rows.
--
-- What *can't* be derived from entity state is per-user UI state: snoozes
-- and explicit dismissals. That lives here, keyed by a synthetic
-- `dedupe_key` shared with the client-side derivation (e.g.
-- 'probation_ending:<employee_id>:<probation_end_date>').
--
-- Because the dedupe_key embeds the trigger date, a fresh probation_end_date
-- (or passport renewal) yields a different key — old dismissals don't
-- accidentally suppress the new alert.
--
-- "Resolved" isn't tracked here: when a contract is signed or a pending
-- update is approved, the underlying entity state changes and derivation
-- simply stops emitting the item.

create table if not exists public.inbox_dismissals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.users on delete cascade,
  dedupe_key text not null,

  snoozed_until timestamptz,
  dismissed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, dedupe_key)
);

create index if not exists idx_inbox_dismissals_user
  on public.inbox_dismissals (user_id);

create index if not exists idx_inbox_dismissals_org
  on public.inbox_dismissals (org_id);

create or replace function public.touch_inbox_dismissal()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inbox_dismissal_touch on public.inbox_dismissals;
create trigger trg_inbox_dismissal_touch
  before update on public.inbox_dismissals
  for each row execute function public.touch_inbox_dismissal();

-- ─── RLS ────────────────────────────────────────────────
--
-- Users only see and write their own dismissals, scoped to their org.

alter table public.inbox_dismissals enable row level security;

create policy "Users can read their own inbox dismissals"
  on public.inbox_dismissals for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their own inbox dismissals"
  on public.inbox_dismissals for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and org_id in (select org_id from public.users where id = auth.uid())
  );

create policy "Users can update their own inbox dismissals"
  on public.inbox_dismissals for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own inbox dismissals"
  on public.inbox_dismissals for delete
  to authenticated
  using (user_id = auth.uid());
