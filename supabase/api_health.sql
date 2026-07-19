-- ============================================================
--  API 건강 감시 테이블 (api_health)  — 안전 버전
--  · drop / delete / truncate 등 파괴 구문이 하나도 없습니다.
--  · 기존 테이블(submissions, profiles, reviews, visits …)을 전혀 건드리지 않습니다.
--  · Supabase 대시보드 → SQL Editor 에 이 파일만 붙여넣고 [Run] 하세요.
--    (이미 있으면 아무 일도 안 함 — create table if not exists)
-- ============================================================

create table if not exists public.api_health (
  source text primary key,                  -- tour / standard / seoul / youtube / naver / ...
  label text,                               -- 표시명
  ok boolean not null default true,         -- 마지막 점검 정상 여부
  consecutive_fails int not null default 0, -- 연속 실패 횟수(=일수, 하루 1회 점검)
  detail text,                              -- 실패 사유(HTTP 코드 등)
  last_ok_at timestamptz,                   -- 마지막 정상 응답 시각
  last_checked_at timestamptz not null default now(),
  last_alert_at timestamptz                 -- 마지막 알림 발송 시각(재알림 쿨다운용)
);

-- 서버(service_role)만 읽고 쓰도록: RLS 켜고 정책은 두지 않음
--  → anon/authenticated는 접근 불가, 서버(service_role)만 RLS 우회로 접근.
alter table public.api_health enable row level security;

-- ⚠️ 이 프로젝트는 새 테이블에 service_role 권한을 자동 부여하지 않으므로 명시적으로 부여.
--    (GRANT는 권한을 '주는' 것이라 데이터 삭제·파괴가 아님. submissions가 되는 이유와 동일)
grant all on public.api_health to service_role;
