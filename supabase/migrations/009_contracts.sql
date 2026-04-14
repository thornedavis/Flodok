-- Contracts table (mirrors sops structure)
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations on delete cascade not null,
  employee_id uuid references employees on delete cascade,
  title text not null,
  content_markdown text not null default '',
  content_markdown_id text,
  current_version integer not null default 1,
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contract versions
create table if not exists contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts on delete cascade not null,
  version_number integer not null,
  content_markdown text not null,
  content_markdown_id text,
  change_summary text,
  changed_by text not null,
  created_at timestamptz not null default now(),
  unique (contract_id, version_number)
);

-- Contract tags (reuse existing tags table)
create table if not exists contract_tags (
  contract_id uuid references contracts on delete cascade not null,
  tag_id uuid references tags on delete cascade not null,
  primary key (contract_id, tag_id)
);

-- RLS
alter table contracts enable row level security;
alter table contract_versions enable row level security;
alter table contract_tags enable row level security;

create policy "Managers can manage their org contracts" on contracts
  for all using (org_id in (select org_id from users where id = auth.uid()));

create policy "Managers can manage their org contract versions" on contract_versions
  for all using (contract_id in (select id from contracts where org_id in (select org_id from users where id = auth.uid())));

create policy "Managers can manage their org contract tags" on contract_tags
  for all using (contract_id in (select id from contracts where org_id in (select org_id from users where id = auth.uid())));
