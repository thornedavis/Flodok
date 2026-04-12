-- Function to handle signup: creates org + user record in one call
-- Runs as security definer to bypass RLS during signup
create or replace function public.handle_signup(
  user_id uuid,
  user_email text,
  user_name text,
  org_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  -- Create organization
  insert into organizations (name)
  values (org_name)
  returning id into new_org_id;

  -- Create user profile
  insert into users (id, org_id, email, name)
  values (user_id, new_org_id, user_email, user_name);

  return new_org_id;
end;
$$;
