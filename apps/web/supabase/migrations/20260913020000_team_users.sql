-- Teammates sign in with Attio; each gets session tokens for their extension.

create table users (
  id uuid primary key default gen_random_uuid(),
  attio_workspace_member_id uuid not null unique,
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- only a hash of each token is stored
create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index sessions_by_user on sessions (user_id);

-- one LinkedIn account per teammate; the first /me their extension reports claims it
alter table sync_accounts add column user_id uuid unique references users on delete set null;

-- replays run as the teammate whose extension fetched the response
alter table failed_fetches add column user_id uuid references users on delete cascade;

alter table users enable row level security;
alter table sessions enable row level security;
