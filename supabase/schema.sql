-- SharpeningTheAxe MAX
-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  category text default 'General',
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_title text not null default 'Lessons',
  title text not null,
  description text default '',
  youtube_url text,
  duration_minutes integer,
  difficulty text default 'Beginner',
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  watch_progress numeric(5,2) not null default 0,
  notes text default '',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  started_at timestamptz not null default now(),
  minutes integer not null default 0
);

create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_date date not null,
  target_minutes integer not null default 60,
  completed_minutes integer not null default 0,
  unique(user_id, goal_date)
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_time time not null default '19:00',
  enabled boolean not null default true,
  days text[] not null default array['mon','tue','wed','thu','fri','sat','sun']
);

alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.study_sessions enable row level security;
alter table public.daily_goals enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "courses own" on public.courses;
create policy "courses own" on public.courses for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "lessons own" on public.lessons;
create policy "lessons own" on public.lessons for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "progress own" on public.lesson_progress;
create policy "progress own" on public.lesson_progress for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "sessions own" on public.study_sessions;
create policy "sessions own" on public.study_sessions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "goals own" on public.daily_goals;
create policy "goals own" on public.daily_goals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "reminders own" on public.reminders;
create policy "reminders own" on public.reminders for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Useful indexes
create index if not exists courses_user_idx on public.courses(user_id,created_at desc);
create index if not exists lessons_course_idx on public.lessons(course_id,order_index);
create index if not exists lessons_user_idx on public.lessons(user_id);
create index if not exists progress_user_idx on public.lesson_progress(user_id);
