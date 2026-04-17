-- Organization invitations — let an org owner invite teammates via a tokenized link.
-- Flow: owner creates invitation -> link is shared out-of-band -> invitee signs up
-- with ?token=... -> handle_signup sees the token, attaches user to existing org,
-- marks invitation accepted.

create table if not exists public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'manager',
  invited_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null
);

create index if not exists org_invitations_org_id_idx on public.org_invitations(org_id);
create index if not exists org_invitations_token_idx on public.org_invitations(token);
create index if not exists org_invitations_email_idx on public.org_invitations(email);

alter table public.org_invitations enable row level security;

-- Authenticated org members can view invites for their org
create policy "Members can view own org invitations"
  on public.org_invitations for select
  using (org_id = public.get_user_org_id());

-- Authenticated org members can create invites for their org
create policy "Members can create org invitations"
  on public.org_invitations for insert
  with check (org_id = public.get_user_org_id());

-- Authenticated org members can update invites (e.g. revoke)
create policy "Members can update own org invitations"
  on public.org_invitations for update
  using (org_id = public.get_user_org_id());

-- Authenticated org members can delete invites
create policy "Members can delete own org invitations"
  on public.org_invitations for delete
  using (org_id = public.get_user_org_id());

-- Anonymous users can look up a pending invite by token (to show the accept page
-- before they sign in). Exposes only pending, non-expired invites.
create policy "Anyone can read invite by token"
  on public.org_invitations for select
  to anon, authenticated
  using (status = 'pending' and expires_at > now());

-- Replace handle_signup to optionally accept an invite token. If present and valid,
-- the user joins the existing org instead of creating a new one.
create or replace function public.handle_signup(
  user_id uuid,
  user_email text,
  user_name text,
  org_name text,
  invite_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  invite_record public.org_invitations%rowtype;
  target_role text := 'manager';
begin
  if invite_token is not null then
    -- Accept-invite path
    select * into invite_record
    from public.org_invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now();

    if invite_record.id is null then
      raise exception 'Invite token is invalid or expired';
    end if;

    target_org_id := invite_record.org_id;
    target_role := coalesce(invite_record.role, 'manager');

    insert into public.users (id, org_id, email, name, role)
    values (user_id, target_org_id, user_email, user_name, target_role);

    update public.org_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = user_id
    where id = invite_record.id;
  else
    -- Normal signup path: create a fresh org
    insert into public.organizations (name)
    values (org_name)
    returning id into target_org_id;

    insert into public.users (id, org_id, email, name)
    values (user_id, target_org_id, user_email, user_name);
  end if;

  return target_org_id;
end;
$$;
