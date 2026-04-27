-- Achievements v1 — Definitions seed + auto-seed trigger
--
-- Inserts the 20 v1 achievement definitions for every existing org and adds a
-- trigger so future orgs get them automatically on creation.
--
-- The 20 definitions:
--   Group 1: Tenure (9)        — auto, tenure_calendar rule
--   Group 2: Compensation (3)  — auto, first_event rule, 24h delay
--   Group 3: Leaderboard (3)   — auto, leaderboard_rank rule
--   Group 4: Manual (5)        — manager-awarded, no automated rule
--
-- The icon column holds the achievement's code as a placeholder string. The
-- frontend maps code → actual icon asset; updating icons later means updating
-- the mapping, not the data.
--
-- Re-running the seed function is safe — duplicates skip via the existing
-- (org_id, name) unique constraint.


-- Helper: seed all v1 definitions for a single org ----------------------------

create or replace function public.seed_v1_achievement_definitions(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.achievement_definitions
    (org_id, name, description, icon, trigger_type, trigger_rule, is_featured, is_active)
  values
    -- Group 1: Tenure ---------------------------------------------------------
    (p_org_id, 'First Day',
     'Completed your first day on the team',
     'first_day', 'auto',
     '{"type":"tenure_calendar","unit":"day","amount":1}'::jsonb,
     false, true),

    (p_org_id, 'First Week',
     'One week of contributions',
     'first_week', 'auto',
     '{"type":"tenure_calendar","unit":"day","amount":7}'::jsonb,
     false, true),

    (p_org_id, 'First Month',
     'One month on the team',
     'first_month', 'auto',
     '{"type":"tenure_calendar","unit":"month","amount":1}'::jsonb,
     false, true),

    (p_org_id, 'Three Months',
     'Three months and counting',
     'three_months', 'auto',
     '{"type":"tenure_calendar","unit":"month","amount":3}'::jsonb,
     false, true),

    (p_org_id, 'Six Months',
     'Half a year of dedication',
     'six_months', 'auto',
     '{"type":"tenure_calendar","unit":"month","amount":6}'::jsonb,
     false, true),

    (p_org_id, 'One Year',
     'One full year on the team',
     'one_year', 'auto',
     '{"type":"tenure_calendar","unit":"year","amount":1}'::jsonb,
     true, true),

    (p_org_id, 'Two Years',
     'Two years strong',
     'two_years', 'auto',
     '{"type":"tenure_calendar","unit":"year","amount":2}'::jsonb,
     false, true),

    (p_org_id, 'Five Years',
     'Five-year veteran',
     'five_years', 'auto',
     '{"type":"tenure_calendar","unit":"year","amount":5}'::jsonb,
     true, true),

    (p_org_id, 'Ten Years',
     'A decade of commitment',
     'ten_years', 'auto',
     '{"type":"tenure_calendar","unit":"year","amount":10}'::jsonb,
     true, true),

    -- Group 2: Compensation milestones ----------------------------------------
    (p_org_id, 'First Earnings',
     'Earned your first credits',
     'first_earnings', 'auto',
     '{"type":"first_event","source":"credit_adjustments","filter":"amount > 0","delay_hours":24}'::jsonb,
     false, true),

    (p_org_id, 'First Bonus',
     'Received your first bonus',
     'first_bonus', 'auto',
     '{"type":"first_event","source":"bonus_adjustments","filter":"amount_idr > 0","delay_hours":24}'::jsonb,
     false, true),

    (p_org_id, 'First Payout',
     'Cashed out for the first time',
     'first_payout', 'auto',
     '{"type":"first_event","source":"credit_adjustments","filter":"paid_out_at IS NOT NULL","delay_hours":24}'::jsonb,
     false, true),

    -- Group 3: Leaderboard ----------------------------------------------------
    (p_org_id, 'Podium',
     'Finished in the top 3 for a month',
     'podium', 'auto',
     '{"type":"leaderboard_rank","max_rank":3,"min_scorers":3,"consecutive_periods":1}'::jsonb,
     false, true),

    (p_org_id, 'Number One',
     'Reached #1 on the monthly leaderboard',
     'number_one', 'auto',
     '{"type":"leaderboard_rank","max_rank":1,"min_scorers":3,"consecutive_periods":1}'::jsonb,
     true, true),

    (p_org_id, 'Reigning Champion',
     'Held #1 for two consecutive months',
     'reigning_champion', 'auto',
     '{"type":"leaderboard_rank","max_rank":1,"min_scorers":3,"consecutive_periods":2}'::jsonb,
     true, true),

    -- Group 4: Manual ---------------------------------------------------------
    (p_org_id, 'Customer Praise',
     'Recognized by a customer',
     'customer_praise', 'manual',
     null,
     true, true),

    (p_org_id, 'Above and Beyond',
     'Went beyond what was asked',
     'above_and_beyond', 'manual',
     null,
     false, true),

    (p_org_id, 'Problem Solver',
     'Solved a problem outside your scope',
     'problem_solver', 'manual',
     null,
     false, true),

    (p_org_id, 'Team Player',
     'Stepped up to support the team',
     'team_player', 'manual',
     null,
     false, true),

    (p_org_id, 'Innovator',
     'Proposed an improvement that was adopted',
     'innovator', 'manual',
     null,
     false, true)

  on conflict (org_id, name) do nothing;
end;
$$;


-- Backfill: seed every existing org -------------------------------------------

do $$
declare
  org_row record;
begin
  for org_row in select id from public.organizations loop
    perform public.seed_v1_achievement_definitions(org_row.id);
  end loop;
end $$;


-- Auto-seed new orgs on creation ----------------------------------------------
-- security definer so the trigger can insert into achievement_definitions
-- regardless of who created the organization row.

create or replace function public.handle_new_organization_seed_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_v1_achievement_definitions(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_achievements_for_new_org on public.organizations;
create trigger trg_seed_achievements_for_new_org
  after insert on public.organizations
  for each row execute function public.handle_new_organization_seed_achievements();
