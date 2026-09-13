-- "Sync to Attio" pressed on a thread the backend hasn't seen yet (older than the
-- polled inbox page). Sync runs page back through the inbox until it turns up.
create table manual_sync_requests (
  conversation_urn text primary key,
  mailbox_urn text not null references sync_accounts on delete cascade,
  requested_at timestamptz not null default now(),
  pages_searched int not null default 0
);

alter table manual_sync_requests enable row level security;
