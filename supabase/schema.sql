-- ============================================================
--  축제로 데이터베이스 설계
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 [Run] 하세요.
--  (이번 단계는 profiles만 사용하지만, 다음 단계의 후기/방문기록
--   테이블도 미리 만들어 둡니다.)
-- ============================================================

-- 1) 프로필: 로그인 사용자당 1행 (닉네임)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 프로필은 누구나 조회 가능(후기에 닉네임 표시), 수정/생성은 본인만
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

-- 회원가입 시 프로필 자동 생성 (가입할 때 입력한 닉네임 사용)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '카카오회원'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2) 후기/평점 (다음 단계) — 한 축제에 사용자 1개
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  festival_id text not null,           -- TourAPI contentid 등 (문자열로 저장)
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (festival_id, user_id)
);
create index if not exists reviews_festival_idx on public.reviews (festival_id);

alter table public.reviews enable row level security;

drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews for select using (true);

drop policy if exists "reviews_insert_self" on public.reviews;
create policy "reviews_insert_self" on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "reviews_update_self" on public.reviews;
create policy "reviews_update_self" on public.reviews
  for update using (auth.uid() = user_id);

drop policy if exists "reviews_delete_self" on public.reviews;
create policy "reviews_delete_self" on public.reviews
  for delete using (auth.uid() = user_id);


-- 3) 방문기록 (다음 단계) — 본인만 조회/기록
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  festival_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  visited_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists visits_user_idx on public.visits (user_id);

alter table public.visits enable row level security;

drop policy if exists "visits_select_self" on public.visits;
create policy "visits_select_self" on public.visits
  for select using (auth.uid() = user_id);

drop policy if exists "visits_insert_self" on public.visits;
create policy "visits_insert_self" on public.visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "visits_delete_self" on public.visits;
create policy "visits_delete_self" on public.visits
  for delete using (auth.uid() = user_id);


-- 4) API 역할(anon/authenticated)에 테이블 접근 권한 부여
--    (RLS 정책과 별개로, PostgREST가 테이블에 접근하려면 이 GRANT가 필요)
grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

grant select, insert, delete on public.visits to authenticated;


-- 4-1) API 건강 감시 상태 (하루 1회 크론이 기록 · 이틀 연속 실패 시 메일 알림)
--     서버(service_role)만 읽고 씀. 어드민 상태페이지(/admin/report)에서 표시.
create table if not exists public.api_health (
  source text primary key,              -- tour / standard / seoul / youtube / naver / ...
  label text,                           -- 표시명
  ok boolean not null default true,     -- 마지막 점검 정상 여부
  consecutive_fails int not null default 0, -- 연속 실패 횟수(=일수, 하루 1회 점검)
  detail text,                          -- 실패 사유(HTTP 코드 등)
  last_ok_at timestamptz,               -- 마지막 정상 응답 시각
  last_checked_at timestamptz not null default now(),
  last_alert_at timestamptz             -- 마지막 알림 발송 시각(재알림 쿨다운용)
);

alter table public.api_health enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가. service_role(서버)만 RLS를 우회해 접근.


-- 5) 축제별 평균 별점/후기 수 집계 뷰 (목록·지도 표시용)
create or replace view public.review_stats
with (security_invoker = true) as
select
  festival_id,
  round(avg(rating)::numeric, 1) as avg_rating,
  count(*)::int as review_count
from public.reviews
group by festival_id;

grant select on public.review_stats to anon, authenticated;