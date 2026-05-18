-- Live crowd/line tracker storage for restock alerts.
-- Run this in Supabase SQL Editor before enabling production analytics.
-- The bot uses the service role key server-side only; do not expose it to clients.

create table if not exists public.restock_crowd_trackers (
    alert_id text primary key,
    restock_id text,
    source_message_id text not null,
    source_channel_id text not null,
    thread_id text,
    tracker_message_id text,
    store_name text not null,
    store_address text,
    region text,
    original_reporter_id text,
    original_estimate text not null check (original_estimate in ('unknown', 'low', 'moderate', 'high')),
    user_checkins jsonb not null default '{}'::jsonb,
    user_estimate_votes jsonb not null default '{}'::jsonb,
    computed_status text not null check (computed_status in ('unknown', 'low', 'moderate', 'high')),
    confidence text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null,
    expired_at timestamptz
);

create index if not exists idx_restock_crowd_trackers_expires_at
    on public.restock_crowd_trackers (expires_at);

create index if not exists idx_restock_crowd_trackers_store_region
    on public.restock_crowd_trackers (store_name, region);

-- If you created the table before the neutral option existed, run this file again.
alter table public.restock_crowd_trackers
    drop constraint if exists restock_crowd_trackers_original_estimate_check,
    drop constraint if exists restock_crowd_trackers_computed_status_check;

alter table public.restock_crowd_trackers
    add constraint restock_crowd_trackers_original_estimate_check
        check (original_estimate in ('unknown', 'low', 'moderate', 'high')),
    add constraint restock_crowd_trackers_computed_status_check
        check (computed_status in ('unknown', 'low', 'moderate', 'high'));
