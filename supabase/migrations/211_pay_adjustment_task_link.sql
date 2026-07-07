-- Link a pay adjustment (reward / penalty) to the task that motivated it.
--
-- Motivation: when an admin penalises an employee for an undone task — or
-- rewards them for a job well done — they can now point the adjustment at the
-- specific task instead of only typing a free-text reason.
--
-- Cardinality: one adjustment references at most one task; a single task can
-- accrue several adjustments over time (e.g. penalised, then the redo rewarded).
-- ON DELETE SET NULL keeps the adjustment — and its human-readable reason — fully
-- auditable even after the task is trashed or removed.

alter table public.pay_adjustments
  add column task_id uuid references public.tasks(id) on delete set null;

comment on column public.pay_adjustments.task_id is
  'Optional task this reward/penalty is tied to (Performance → task link). The reason text remains the source of truth for what the employee sees; this is the structured link for filtering and drill-down.';

-- Reverse lookup ("which adjustments came from this task?") stays cheap.
create index if not exists pay_adjustments_task_idx
  on public.pay_adjustments (task_id)
  where task_id is not null;
