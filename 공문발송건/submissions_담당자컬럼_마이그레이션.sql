-- ─────────────────────────────────────────────────────────────
--  축제로 submissions 테이블 마이그레이션
--  ① 담당자 성명·전화·이메일 컬럼 추가
--  ② 개인정보·보안 컬럼(contact·성명·전화·이메일·token)을
--     공개(anon/authenticated) 조회에서 제외  ← 현재 연락처가 누구나 조회 가능한 상태를 함께 차단
--  (service_role 은 영향 없음 → 제출 저장·다이제스트 메일 정상 동작)
-- ─────────────────────────────────────────────────────────────

-- ① 컬럼 추가
alter table public.submissions
  add column if not exists manager_name text,
  add column if not exists phone        text,
  add column if not exists email        text;

-- ② 공개 조회 컬럼 화이트리스트로 제한
revoke select on public.submissions from anon, authenticated;

grant select (
  id, type, status, category, festival_id, festival_name,
  period_start, period_end, place, intro, timetable, lineup,
  parking, shuttle, food, experience, etc, organizer, message,
  photos, created_at
) on public.submissions to anon, authenticated;

-- (PostgREST 스키마 새로고침 — 보통 자동이지만 즉시 반영용)
notify pgrst, 'reload schema';
