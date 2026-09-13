-- First sign-in review: the extension pages back through the inbox until it has the most
-- recent 1:1 conversations, then the teammate picks which ones sync and to whom.
-- Existing accounts start collecting too, so current teammates get the review once.
alter table sync_accounts
  add column review_status text not null default 'collecting'
    check (review_status in ('collecting', 'ready', 'done')),
  add column review_cursor text,
  add column review_pages integer not null default 0,
  add column review_completed_at timestamptz;

-- the exact Attio match (same LinkedIn URL, or a teammate's link) found alongside suggestions
alter table conversations
  add column attio_match jsonb,
  add column suggested_at timestamptz;
