-- =========================================================
-- Exchange Coffee & Roaster
-- 1st Anniversary Reward System
-- Phase 1 Database
-- =========================================================

create extension if not exists pgcrypto;


-- =========================================================
-- CAMPAIGNS
-- =========================================================

create table if not exists public.campaigns (
    id uuid primary key default gen_random_uuid(),

    campaign_code text not null unique,
    name text not null,

    claim_start timestamptz not null,
    claim_end timestamptz not null,

    redeem_start timestamptz not null,
    redeem_end timestamptz not null,

    status text not null default 'draft'
        check (status in ('draft', 'active', 'ended')),

    created_at timestamptz not null default now(),

    constraint valid_claim_period
        check (claim_end > claim_start),

    constraint valid_redeem_period
        check (redeem_end >= redeem_start)
);


-- =========================================================
-- CUSTOMERS
-- =========================================================

create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),

    -- LINE user ID.
    -- This must come from a verified LINE ID token on the server.
    line_user_id text not null unique,

    display_name text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- =========================================================
-- REWARDS
-- =========================================================

create table if not exists public.rewards (
    id uuid primary key default gen_random_uuid(),

    customer_id uuid not null
        references public.customers(id)
        on delete cascade,

    campaign_id uuid not null
        references public.campaigns(id)
        on delete restrict,

    reward_type text not null,

    reward_token text not null unique,

    status text not null default 'claimed'
        check (status in ('claimed', 'redeemed', 'expired')),

    claimed_at timestamptz not null default now(),

    redeemed_at timestamptz,

    expires_at timestamptz not null,

    created_at timestamptz not null default now(),

    -- IMPORTANT:
    -- One customer can only have ONE reward
    -- for a particular campaign.
    constraint one_reward_per_customer_per_campaign
        unique (customer_id, campaign_id)
);


-- =========================================================
-- REDEMPTIONS
-- =========================================================

create table if not exists public.redemptions (
    id uuid primary key default gen_random_uuid(),

    reward_id uuid not null unique
        references public.rewards(id)
        on delete restrict,

    redeemed_at timestamptz not null default now(),

    staff_id uuid,

    created_at timestamptz not null default now()
);


-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_rewards_customer
    on public.rewards(customer_id);

create index if not exists idx_rewards_campaign
    on public.rewards(campaign_id);

create index if not exists idx_rewards_token
    on public.rewards(reward_token);

create index if not exists idx_rewards_status
    on public.rewards(status);


-- =========================================================
-- WEEK 1 CAMPAIGN
-- =========================================================

insert into public.campaigns (
    campaign_code,
    name,
    claim_start,
    claim_end,
    redeem_start,
    redeem_end,
    status
)
values (
    'EXCHANGE-1ST-ANNIVERSARY-2026',
    'Exchange Coffee 1st Anniversary — Week 1',

    -- Claiming:
    '2026-10-01 00:00:00+07',
    '2026-10-07 23:59:59+07',

    -- Redemption:
    '2026-10-08 00:00:00+07',
    '2027-01-07 23:59:59+07',

    'draft'
)
on conflict (campaign_code) do nothing;


-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


drop trigger if exists customers_updated_at
on public.customers;


create trigger customers_updated_at
before update on public.customers
for each row
execute function public.update_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.campaigns enable row level security;
alter table public.customers enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;


-- =========================================================
-- PHASE 1:
-- Public/customer clients should NOT directly manipulate
-- reward records.
--
-- Claiming and redemption will later happen through
-- secure backend/Edge Functions.
-- =========================================================

-- Campaigns:
-- Customers can read active campaign information.

drop policy if exists "Public can view active campaigns"
on public.campaigns;

create policy "Public can view active campaigns"
on public.campaigns
for select
to anon, authenticated
using (
    status = 'active'
);


-- No direct public access to customers.
-- No direct public access to rewards.
-- No direct public access to redemptions.