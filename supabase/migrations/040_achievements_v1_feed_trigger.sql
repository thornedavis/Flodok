-- Achievements v1 — feed_events integration
--
-- When an achievement is unlocked, mirror it into feed_events so it appears
-- in the activity tab and contributes to the portal bell unread count.
-- When an unlock is revoked (manager deletes a manual award), remove the
-- corresponding feed_events row.
--
-- Important timestamp distinction:
--   achievement_unlocks.unlocked_at  — when the milestone happened (often backdated)
--   feed_events.created_at           — when the system announced it (real-time)
-- The activity feed and bell use feed_events.created_at; the manager calendar
-- uses achievement_unlocks.unlocked_at directly.


create or replace function public.handle_achievement_unlock_feed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_description text;
  v_icon text;
begin
  select d.org_id, d.name, d.description, d.icon
    into v_org_id, v_name, v_description, v_icon
  from public.achievement_definitions d
  where d.id = new.achievement_id;

  insert into public.feed_events
    (org_id, employee_id, event_type, title, description, metadata)
  values
    (v_org_id,
     new.employee_id,
     'achievement_unlocked',
     v_name,
     v_description,
     jsonb_build_object(
       'achievement_id', new.achievement_id,
       'unlock_id', new.id,
       'unlocked_at', new.unlocked_at,
       'icon', v_icon,
       'awarded_by', new.awarded_by,
       'reason', new.reason
     ));

  return new;
end;
$$;

drop trigger if exists trg_achievement_unlock_feed on public.achievement_unlocks;
create trigger trg_achievement_unlock_feed
  after insert on public.achievement_unlocks
  for each row execute function public.handle_achievement_unlock_feed();


create or replace function public.handle_achievement_unlock_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feed_events
  where event_type = 'achievement_unlocked'
    and employee_id = old.employee_id
    and metadata->>'unlock_id' = old.id::text;
  return old;
end;
$$;

drop trigger if exists trg_achievement_unlock_revoke on public.achievement_unlocks;
create trigger trg_achievement_unlock_revoke
  after delete on public.achievement_unlocks
  for each row execute function public.handle_achievement_unlock_revoke();
