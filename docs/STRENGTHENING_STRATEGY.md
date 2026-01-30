# MyStats 강화 전략 (Strengthening Strategy)

> 기준일: 2026-01-29  
> 입력: `docs/PRODUCTION_PLAN.md`(운영/품질/동기화) + `docs/CREATIVE_IDEAS.md`(차별화 기능)  
> 목표: “프로덕션급 PWA”의 신뢰를 유지하면서, MyStats만의 **차별화(=공유/리텐션을 만드는 시그니처 기능)**을 빠르게 확보한다.

---

## 0) TL;DR

- **0~2주:** P1/P2 중 “리스크 큰 것”부터 닫는다 → **Settings 분할**, **테스트(유닛+e2e)**, **동기화 충돌/재시도**, **memU Worker**, **DB 마이그레이션 문서화**.
- **2~4주:** 기능 확장 1호는 **Temporal Identity Drift(무AI)** 로 간다 → 리텐션 루프/타임라인을 만든다.
- **4~6주:** 바이럴 1호는 **Shadow Profile** 로 간다 → “안 쓴 것 분석”을 **공유 가능한 카드/차트**로 만든다.
- 데이터 모델은 “Core(원본)”과 “Derived(파생)”로 분리한다 → **동기화/마이그레이션/충돌 리스크를 최소화**.

---

## 1) 강화 목표 (North Star)

**MyStats의 강화는 2가지 축을 동시에 만족해야 한다.**

1) **신뢰(Trust):** 데이터는 내 자산이며, 어떤 상황에서도 복구/이동이 가능하다.  
2) **차별화(Differentiation):** “저널 앱”이 아니라 **나를 해석하는 엔진**으로 기억될 한 가지 시그니처 기능이 있다.

---

## 2) 실행 전략: 2-트랙 운영

### Track A — Reliability & Trust (PRODUCTION_PLAN의 P1/P2 완주)
> 기능을 더 얹기 전에 “깨져도 바로 잡는” 고속 복구 루프를 닫는다.

- **A0. 코드 구조 정리(P1 잔여)**
  - `Settings.tsx` 분할(페이지/AI/memU/Cloud Sync)로 유지보수성 확보
- **A1. 테스트 확대: 유닛 → e2e 순서로 고정**
  - 유닛(권장 순서): `db/db.ts` → `lib/cloudSync.ts` → `lib/ai-provider.ts`
  - e2e(Playwright): Journal 작성/저장 → Insight 생성 → Strategy 생성, 백업/복원, Cloud Sync on/off
- **A2. Cloud Sync 고도화**
  - 네트워크 오류 재시도(지수 백오프, 3회) + 사용자-facing 상태 UI(“대기/진행/실패/충돌”)
  - 충돌 정책: 현재 LWW 유지하되, “충돌 발견”을 **보이게** 하고(알림/리스트), 나중에 필드 단위 머지로 확장
- **A3. memU Worker 전환 + 근거 UX**
  - 긴 저널/다량 데이터에서 UI 프리징 방지(임베딩/검색을 Worker로 분리)
  - Strategy 결과에 “어떤 Journal이 기여했는지” 하이라이트(신뢰 강화)
- **A4. DB 마이그레이션 문서화 + 안정장치**
  - DB_VERSION별 변경 요약 + 복구 플로우(VersionError/QuotaExceeded 포함)
  - “Derived 캐시 삭제/재생성” UX(파생 데이터 문제를 손쉬운 복구 경로로 만든다)

### Track B — Differentiation & Retention (CREATIVE_IDEAS의 우선순위 실행)
> “다음 버전의 이유”가 되는 기능을 1~2개만 집중해서 만든다.

- **B1. Temporal Identity Drift (추천 1순위)**
  - **AI 호출 0**으로 즉시 출시 가능(기존 Insight timestamp 기반 통계)
  - 리텐션 루프: “한 달만 더 쓰면 내 변화가 보인다”
  - 산출물: Drift Score + Phase(안정/전환/위기) + 타임라인 탭(Profile)
- **B2. Shadow Profile (추천 2순위)**
  - 컨셉이 강하고 공유성이 높음(“내가 회피하는 영역”)
  - 비용/리스크 관리:
    - 1차는 **Derived(파생) 계산**으로 출시(필요 시 재분석)
    - 2차에 Core 스키마로 승격(동기화/마이그레이션 포함) 여부 결정
- **B3. Paradox Portfolio (추천 3순위)**
  - memU와 궁합이 좋고, “모순=무기” 프레임이 강함
  - 산출물: Paradox Score + 3개 모순쌍 카드 + “이걸로 전략 짜기” CTA

---

## 3) 데이터 모델 강화 원칙 (Core vs Derived)

### Core (동기화/백업의 기준)
- Journal / Skills / Insights / Solutions (현재 구조 유지)
- “원본 데이터”만 동기화한다(충돌/유실 리스크 최소화).

### Derived (캐시/재생성 가능)
- Drift 계산 결과, Domain 태그(Shadow), Fingerprint 지표, memU 임베딩 캐시 등
- 원칙:
  - **재생성 가능**해야 한다(삭제해도 Core에서 복구 가능)
  - Cloud Sync 대상에서 제외하는 것을 기본으로 한다(디바이스별 재빌드)
  - 버전(algorithmVersion)을 가져 “업데이트 시 재계산”이 쉽도록 한다

**효과:** 신규 기능을 추가해도 “동기화/DB 마이그레이션”을 매번 건드리지 않게 된다.

---

## 4) 6주 로드맵(권장)

### Week 1–2: 리스크 제거(신뢰 기반)
- Settings 분할(P1 잔여) + 핵심 유닛 테스트 확장(db/cloudSync/ai-provider)
- Playwright e2e 2~3개 시나리오
- Cloud Sync 재시도 + 상태 UI(최소)
- memU Worker(초기 버전) + 근거 하이라이트(초기 버전)
- DB 마이그레이션 문서화 + “Derived 캐시 리셋” UX

### Week 3–4: Temporal Drift 출시(리텐션 루프)
- Profile에 Timeline/Drift 탭
- Phase Detection(단순 규칙 기반으로 시작)
- “이번 달 변화 요약” 카드(Home/Profile)

### Week 5–6: Shadow Profile 출시(바이럴 루프)
- 6개 영역 레이더 차트 + Shadow Zone 카드
- “이 영역에 대해 써보기” → Journal 딥링크
- 공유용 이미지/텍스트 Export(초기 버전)

---

## 5) 지표(Measurement) — 프라이버시 우선

원칙: 기본은 **무추적**, 필요 시 **옵트인**.

- **Activation**
  - API Key 저장 완료율
  - 첫 Journal 작성까지 시간
  - 첫 Insight/Strategy 생성 완료율
- **Trust**
  - 백업 Export/Import 성공률
  - Sync 실패율 / 충돌 발생률
- **Retention**
  - 7일/30일 재방문(로컬 지표로 표시 가능)
  - Drift 탭 방문율, Phase 클릭율
- **Growth**
  - 공유(Export) 사용률
  - Shadow/Paradox 카드 생성 횟수

---

## 6) 리스크 & 가드레일

- **심리적 민감도:** Shadow/Adversarial 계열은 “치료”가 아니라 “자기성찰 도구”라는 경계가 필요(면책/가이드 문구 + 강도 조절).
- **AI 환각/과잉확신:** “근거(연결된 Journal)”를 함께 보여주고, 사용자가 검증/수정할 수 있게 한다.
- **스키마 변경 폭주:** Core에 필드 추가는 분기별 1회로 제한하고, 그 전에는 Derived 캐시로 실험한다.

