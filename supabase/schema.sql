-- Bingoly database schema
-- Run this in your Supabase SQL editor to set up the database

-- Game sessions table
create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id text not null,
  round smallint not null default 1,
  phase text not null default 'lobby',
  called_songs text[] not null default '{}',
  active_question smallint null,
  bingo_claim jsonb null,
  created_at timestamptz not null default now()
);

-- Players table
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  name text not null,
  card text[] not null,
  marked_indices integer[] not null default '{12}',
  points integer not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes for fast lookups
create index if not exists idx_game_sessions_code on game_sessions(code);
create index if not exists idx_players_session_id on players(session_id);

-- Enable Row Level Security
alter table game_sessions enable row level security;
alter table players enable row level security;

-- Permissive policies for MVP (no auth required)
-- In production, tighten these to use Supabase Auth
create policy "Allow all on game_sessions" on game_sessions for all using (true) with check (true);
create policy "Allow all on players" on players for all using (true) with check (true);

-- Enable realtime for both tables
alter publication supabase_realtime add table game_sessions;
alter publication supabase_realtime add table players;
