-- The backend talks to these tables with the service role only; RLS stays on with
-- no policies so the anon key can't read LinkedIn messages.

create table sync_accounts (
  mailbox_urn text primary key,
  self_participant jsonb not null,
  time_zone text not null default 'UTC',
  extension_version text,
  auth_status text not null default 'ok' check (auth_status in ('ok', 'auth_required')),
  last_seen_at timestamptz,
  last_polled_at timestamptz,
  -- replies before this don't prompt for linking
  created_at timestamptz not null default now()
);

-- Only responses that failed to apply are kept (successful inbox polls would be
-- hundreds of MB a day). A later build replays them once the parser is fixed.
create table failed_fetches (
  id bigint generated always as identity primary key,
  request text not null,
  params jsonb not null,
  config_version text not null,
  status int not null,
  body jsonb,
  fetched_at timestamptz not null,
  received_at timestamptz not null default now(),
  error text not null,
  incident_id uuid,
  failed_build text not null,
  replayed_at timestamptz,
  replayed_build text
);
create index failed_fetches_pending on failed_fetches (received_at) where replayed_at is null;

create table conversations (
  urn text primary key,
  mailbox_urn text not null references sync_accounts on delete cascade,
  thread_url text,
  group_chat boolean not null,
  last_activity_at timestamptz not null,
  participants jsonb not null,
  -- the other person in a 1:1 thread
  contact_urn text,
  user_has_replied boolean not null default false,
  link_status text not null default 'unlinked' check (link_status in ('unlinked', 'pending', 'linked', 'ignored')),
  suggestions jsonb,
  attio_record_id text,
  attio_note_id text,
  -- lastActivityAt covered by the most recent full thread fetch
  messages_synced_through timestamptz,
  note_dirty boolean not null default false,
  updated_at timestamptz not null default now()
);
create index conversations_link_status on conversations (mailbox_urn, link_status);
create index conversations_contact on conversations (mailbox_urn, contact_urn);

create table messages (
  urn text primary key,
  conversation_urn text not null references conversations on delete cascade,
  sender_urn text not null,
  sent_at timestamptz not null,
  text text not null
);
create index messages_by_conversation on messages (conversation_urn, sent_at);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  kind text not null check (kind in ('parse_error', 'fetch_failed', 'canary')),
  status text not null default 'open' check (status in ('open', 'dispatched', 'resolved')),
  summary text not null,
  payload jsonb not null,
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  dispatched_at timestamptz,
  agent_session_url text,
  resolved_at timestamptz,
  resolved_by_build text
);
-- one live incident per fingerprint; a recurrence after resolution opens a new one
create unique index incidents_live_fingerprint on incidents (fingerprint) where status <> 'resolved';

alter table sync_accounts enable row level security;
alter table failed_fetches enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table incidents enable row level security;
