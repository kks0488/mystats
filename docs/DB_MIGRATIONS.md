# DB Migrations & Recovery (IndexedDB)

> 목적: `src/db/db.ts`의 IndexedDB 스키마/마이그레이션/복구 동작을 한 곳에 정리한다.  
> 기준일: 2026-01-29

---

## 1) SSOT

- DB Name: `mystats-db` (`DB_NAME`)
- DB Version: `8` (`DB_VERSION`)
- Stores
  - `journal` (index: `by-date` → `timestamp`)
  - `skills` (index: `by-category` → `category`)
  - `solutions` (index: `by-date` → `timestamp`)
  - `insights` (index: `by-entry` → `entryId`)

---

## 2) 마이그레이션(업그레이드) 동작

### 2.1 기본 업그레이드

- `openDB(DB_NAME, DB_VERSION, { upgrade })`로 열고,
- `oldVersion < DB_VERSION`이면 `ensureStores()`로 필요한 object store/index를 보장한다.

### 2.2 VersionError 자동 복구

브라우저/이전 코드가 DB를 더 높은 버전으로 올려둔 상태에서(예: 자동 복구 과정),
낮은 버전으로 열면 `VersionError`가 발생할 수 있다.

이 경우 `openDB(DB_NAME)`로 “현재 존재하는 DB 버전”을 그대로 열어 계속 진행한다.

### 2.3 Store 누락 자동 복구

DB는 열렸지만 필수 store가 누락된 경우(손상/부분 생성 등):

1. 현재 `db.version + 1`로 강제 upgrade
2. `ensureStores()` 실행

---

## 3) 데이터 복구 레이어

### 3.1 Fallback Storage

IndexedDB가 실패하면(권한/Quota/브라우저 이슈 등), 앱은 localStorage 기반 fallback 또는 메모리 모드로 동작한다.

### 3.2 Heartbeat Mirror (Derived Cache)

DB에서 주기적으로(일부 동작 시) 핵심 데이터를 localStorage에 미러링한다:

- `MYSTATS_MIRROR_INSIGHTS` (최근 10개)
- `MYSTATS_MIRROR_SKILLS` (전체)
- `MYSTATS_MIRROR_TS` (타임스탬프)

목적: IndexedDB가 비어있거나 접근 불가일 때 “최소 복구” 가능성을 높인다.

---

## 4) 운영 가이드(권장)

- 데이터가 꼬였다고 느껴지면:
  1) Settings → Backup Export로 JSON 백업
  2) Settings → “Derived 캐시(미러) 재생성” 실행
  3) 필요 시 Settings → Reset Local Database 후 Import로 복원

> 주의: Reset은 브라우저 저장소를 제거하므로, **백업 없이 실행하지 않는다.**

