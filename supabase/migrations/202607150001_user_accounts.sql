create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  word_lists jsonb not null default '{}'::jsonb,
  presets jsonb not null default '{}'::jsonb,
  initialized boolean not null default false,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  source text not null default 'system',
  valid_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  plan text not null,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);

insert into public.profiles (user_id)
select id from auth.users where true on conflict do nothing;
insert into public.user_states (user_id)
select id from auth.users where true on conflict do nothing;
insert into public.entitlements (user_id)
select id from auth.users where true on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.user_states (user_id) values (new.id);
  insert into public.entitlements (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke execute on function public.handle_new_user() from public;

create or replace function public.bump_user_state_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  new.initialized := true;
  return new;
end;
$$;

create trigger user_states_revision
  before update on public.user_states
  for each row execute procedure public.bump_user_state_revision();

alter table public.profiles enable row level security;
alter table public.user_states enable row level security;
alter table public.entitlements enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.user_states from anon, authenticated;
revoke all on public.entitlements from anon, authenticated;
revoke all on public.billing_customers from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, update on public.user_states to authenticated;
grant select on public.entitlements to authenticated;
grant select on public.billing_customers to authenticated;
grant select on public.subscriptions to authenticated;

create policy "users read own profile" on public.profiles
  for select using (auth.uid() = user_id);

create policy "users read own state" on public.user_states
  for select using (auth.uid() = user_id);
create policy "users update own state" on public.user_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users read own entitlement" on public.entitlements
  for select using (auth.uid() = user_id);
create policy "users read own billing customer" on public.billing_customers
  for select using (auth.uid() = user_id);
create policy "users read own subscriptions" on public.subscriptions
  for select using (auth.uid() = user_id);
