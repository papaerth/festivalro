-- ============================================================
--  크론 실행 이력 테이블 (cron_runs)  — 안전 버전
--  · drop / delete / truncate 등 파괴 구문이 하나도 없습니다.
--  · 기존 테이블(submissions, profiles, reviews, visits, api_health …)을 전혀 건드리지 않습니다.
--  · Supabase 대시보드 → SQL Editor 에 이 파일만 붙여넣고 [Run] 하세요.
--    (이미 있으면 아무 일도 안 함 — create table if not exists)
--
--  용도: /api/cron/refresh(자동 갱신 크론)가 매 실행마다 한 줄을 남기고,
--        관리자 리포트(/admin/report)에서 '최근 자동 갱신 이력'으로 보여줍니다.
--        이 테이블이 없어도 크론/사이트는 정상 동작하며, 이력만 안 남습니다.
-- ============================================================

create table if not exists public.cron_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),  -- 실행 시각
  duration_ms int,                            -- 총 소요(ms)
  sources jsonb,                              -- [{key,count,ms,ok,error}] 소스별 결과
  totals jsonb                                -- {total_count, ok_count, fail_count, health_ok, health_fail}
);

-- 최근순 조회를 빠르게
create index if not exists cron_runs_ran_at_idx on public.cron_runs (ran_at desc);

-- 서버(service_role)만 읽고 쓰도록: RLS 켜고 정책은 두지 않음
alter table public.cron_runs enable row level security;

-- 새 테이블에 service_role 권한 명시 부여(권한 부여일 뿐 데이터 파괴 아님)
grant all on public.cron_runs to service_role;
grant usage, select on sequence public.cron_runs_id_seq to service_role;
