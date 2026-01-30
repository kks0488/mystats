# Cloud Sync (Supabase Cloud) — Setup Status / Blockers

> 목적: Supabase Cloud 기반 Cloud Sync(로그인 + 계정별 데이터 연동) 설정 진행 상황을 **프로젝트 내부에 기록**해, 중단/재개 시 맥락을 잃지 않도록 한다.  
> 주의: 이 문서에는 **키/토큰/URL 비밀값을 절대 적지 않는다.** (키 이름만)

---

## 현재 상태 (2026-01-30)

- 단계 A: **Supabase Cloud 프로젝트 생성** ✅ 완료
- 단계 B: DB 테이블 + RLS 생성(SQL 실행) ⛔ 진행 불가(막힘)
- 단계 C: Auth Redirect URL 설정(매직링크) ⛔ 진행 불가(막힘)
- 단계 D: 로컬 `.env` 연결( `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ) ⏸ 대기
- 단계 E: 앱에서 로그인/Sync 테스트 ⏸ 대기

---

## 막힌 지점

### 1) SQL 실행 (테이블 + RLS)

- 실행 대상 SQL:
  - `supabase/migrations/20260124210000_mystats_items.sql`
- 실행 위치(기대):
  - Supabase Dashboard → **SQL Editor** → New query → 붙여넣기 → Run
- 현재 막힘:
  - SQL Editor 진입 불가 또는 Run 시 에러(에러 메시지 미확보)

### 2) Auth Redirect URL 설정 (매직링크)

- 설정 위치(기대):
  - Supabase Dashboard → **Authentication → URL Configuration**
- 설정값(키워드, 비밀값 X):
  - Site URL: `http://localhost:<PORT>`
  - Additional Redirect URLs: `http://localhost:<PORT>`, `http://127.0.0.1:<PORT>`, (배포 도메인)
- 현재 막힘:
  - URL Configuration 메뉴 위치/권한/값 형식에서 진행 중단(상세 미확보)

---

## 다음 재개 체크리스트 (순서대로)

1. (필수) 로컬 포트 확인
   - MyStats dev server 포트가 `5178`인지 확인 (`npm run dev` 출력 기준)
2. Supabase에서 SQL 실행
   - `supabase/migrations/20260124210000_mystats_items.sql` 실행
3. Supabase Auth Redirect URL 설정
   - `http://localhost:<PORT>` / `http://127.0.0.1:<PORT>` 추가
4. 로컬 `.env` 설정(값은 로컬에만)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 앱에서 로그인/연동 검증(계정 스코프)
   - Settings → Cloud Sync → 이메일 매직링크 로그인
   - Enable → Sync now
   - 시크릿 창/다른 브라우저에서 같은 계정으로 로그인 → Sync now → 데이터 내려오는지 확인
   - 다른 이메일(계정 B)로 로그인 → 계정 A 데이터가 보이면 안 됨

---

## 참고 (SSOT)

- 스키마/정책 SQL: `supabase/migrations/20260124210000_mystats_items.sql`
- 앱 가이드: `docs/CLOUD_SYNC.md`
- 구현 코드:
  - Supabase client: `src/lib/supabase.ts`
  - Sync 로직: `src/lib/cloudSync.ts`

