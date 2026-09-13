-- Manual syncs now look the thread up directly by conversation id instead of paging
-- back through the inbox (LinkedIn ignored lastUpdatedBefore). Old page-count rows
-- are meaningless under the new semantics.
delete from manual_sync_requests;
alter table manual_sync_requests rename column pages_searched to lookup_attempts;
