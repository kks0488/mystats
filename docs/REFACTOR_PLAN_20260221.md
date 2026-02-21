# MyStats 리팩토링 계획 (2026-02-21)

해커톤 제출 전 품질 개선 항목 정리.

---

## 1. Gemini 최신 모델 추가

**현재**: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`

**추가 필요**:
| Model ID | 상태 | 설명 |
|----------|------|------|
| `gemini-3.1-pro-preview` | Preview (2/19 출시) | 최신, 최고 추론 |
| `gemini-3-flash-preview` | Preview | 빠르고 저렴한 Frontier급 |
| `gemini-3-pro-preview` | Preview | 3.1 이전 버전 |

**변경**: `ai-provider.ts:27` 모델 목록에 3.x preview 추가, 기본값은 `gemini-2.5-flash` 유지 (GA 안정성)

**파일**: `src/lib/ai-provider.ts`

---

## 2. Settings UI 레이아웃 개선

**문제**: 2x2 그리드에서 DataManagementCard가 `lg:col-span-2`라서 CloudSyncCard가 홀로 한 행 차지 → 오른쪽 빈 공간

**현재 레이아웃**:
```
Row 1: [AISettingsCard]      [MemuSettingsCard]
Row 2: [CloudSyncCard]       (빈 공간)
Row 3: [DataManagementCard ---- 전체 폭 ----]
```

**해결**: 카드 순서 변경 → CloudSyncCard를 AISettingsCard 옆으로
```
Row 1: [AISettingsCard]      [CloudSyncCard]
Row 2: [MemuSettingsCard]    (빈 공간 or 확장)
Row 3: [DataManagementCard ---- 전체 폭 ----]
```

**파일**: `src/pages/Settings.tsx:53-58`

---

## 3. 한글 모드 - 병기 제거 (한글만)

**문제**: 한글 설정 시 AI가 "한글 명칭 (English Title)" 형식으로 출력 → 불필요

**영향 위치** (`ai-provider.ts`):
- `insightRequirement` (115-117행): `"Korean Description (English Translation)"` 강제
- `archetypeFormat` (121-122행): `'한글 명칭 (English Title)'`
- `patternFormat` (125-126행): `'당신의 존재는... (Your existence is...)'`
- `questionFormat` (129-130행): `'한글 질문? (English Question?)'`

**해결**: 한글 모드 시 "한국어로만 작성" 지시로 변경

**파일**: `src/lib/ai-provider.ts:114-131`

---

## 4. 전략 프롬프트 한글화 + 품질 개선

**문제**: STRATEGY_PROMPT 섹션 헤더가 영어 고정 → 한글 모드에서 일관성 없음

**현재** (영어 고정):
```
## ⚡ The Unfair Advantage
## 🧠 The Strategy (Mental Model: [Name])
## 👣 Action Plan
## 🛡️ Critical Warning
```

**해결**: 한글 전용 프롬프트 추가
```
## 나만의 비대칭 우위
## 핵심 전략 (멘탈 모델: [이름])
## 실행 계획
## 주의 사항
```

**파일**: `src/lib/ai-provider.ts:188-211`

---

## 5. Markdown 렌더링 강화

**문제**: `react-markdown` 단독 사용 → GFM 테이블/체크리스트 미지원

**해결**: `remark-gfm` 설치 + ReactMarkdown에 플러그인 추가

**파일**: `src/pages/Strategy.tsx:1184`, `package.json`

---

## 6. Strategy Vault UX 개선 (범위 축소 - 해커톤 기준)

해커톤 제출 기준으로 꼭 필요한 것만:

### 6a. 저장 성공 피드백 없음
- 현재: 저장 후 아무 피드백 없음 (에러만 alert)
- 해결: 저장 성공 시 간단한 시각 피드백 (버튼 색상 변경 등)

### 6b. 아이콘만 있는 액션 버튼
- 현재: 5개 아이콘 버튼 (연필, 복사, 저장, 새로저장, 삭제) - 라벨 없음
- 모바일에서 tooltip 안 보임
- 해결: 주요 버튼에 텍스트 라벨 추가

> 참고: beforeunload 가드, overwrite 확인, 커스텀 모달 등은 해커톤 후 별도 처리

---

## 실행 순서

1. Gemini 모델 업데이트 (ai-provider.ts)
2. 한글 병기 제거 (ai-provider.ts)
3. 전략 프롬프트 한글화 (ai-provider.ts)
4. remark-gfm 설치 + 적용 (Strategy.tsx)
5. Settings 카드 순서 변경 (Settings.tsx)
6. Vault UX 간단 개선 (Strategy.tsx)
7. 빌드 + 테스트 + 배포
