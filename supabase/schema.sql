create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  weekly_goal_minutes integer not null default 150,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_-]+$')
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  activity text not null,
  duration integer not null check (duration > 0),
  intensity text not null check (intensity in ('弱', '中', '強')),
  calories integer not null check (calories >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  requester_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint friend_requests_not_self check (requester_id <> target_id)
);

create table if not exists public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_not_self check (user_id <> friend_id)
);

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "workouts_select_visible" on public.workouts;
create policy "workouts_select_visible"
on public.workouts
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.friendships
    where friendships.user_id = auth.uid()
      and friendships.friend_id = workouts.user_id
  )
);

drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own"
on public.workouts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "workouts_update_own" on public.workouts;
create policy "workouts_update_own"
on public.workouts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own"
on public.workouts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "friend_requests_select_related" on public.friend_requests;
create policy "friend_requests_select_related"
on public.friend_requests
for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = target_id);

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
create policy "friend_requests_insert_own"
on public.friend_requests
for insert
to authenticated
with check (auth.uid() = requester_id);

drop policy if exists "friend_requests_delete_related" on public.friend_requests;
create policy "friend_requests_delete_related"
on public.friend_requests
for delete
to authenticated
using (auth.uid() = requester_id or auth.uid() = target_id);

drop policy if exists "friendships_select_related" on public.friendships;
create policy "friendships_select_related"
on public.friendships
for select
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships_insert_related" on public.friendships;
create policy "friendships_insert_related"
on public.friendships
for insert
to authenticated
with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships_delete_related" on public.friendships;
create policy "friendships_delete_related"
on public.friendships
for delete
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);
