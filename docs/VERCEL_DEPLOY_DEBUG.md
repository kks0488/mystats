# Vercel 배포 디버그 가이드 (MyStats)

목표: “코드는 이미 GitHub(main)에 있는데, Vercel 프로덕션이 옛날 화면을 계속 보여준다” 상황을 빠르게 정리/복구한다.

---

## 1) 지금 프로덕션이 어떤 코드인지 확인(SSOT)

1. 브라우저에서 `view-source:https://mystats-eta.vercel.app/` 열기
2. 아래 스크립트 경로를 찾기: `assets/index-XXXXX.js`
3. 그 JS 안에서 문자열을 검색:
   - 옛 버전(매직링크 UI): `cloudSendLink`
   - 새 버전(OAuth + Email/Password UI): `cloudSignInGoogle` 또는 `cloudSignInGithub`

이 확인 결과가 “옛 버전”이면, **배포 자체가 옛 커밋/옛 스냅샷**이다(브라우저 캐시 문제가 아닐 가능성이 높음).

---

## 2) Vercel Deployments에서 “Redeploy of …”를 누르면 안 되는 이유

Vercel UI의 **Redeploy**는 “지금 연결된 GitHub 최신 커밋”을 배포하는 버튼이 아니라,
그 배포 ID(스냅샷)를 **그대로 다시 배포**하는 버튼이다.

즉, Deployments 목록에서 아래처럼 표시되면 최신 코드가 아니라 “과거 스냅샷”을 계속 굴리는 중이다:
- `Redeploy of 9QgvBnNjV`
- `Redeploy of 8why8LSWu`

---

## 3) 올바른 배포 방법(추천: Git 기반)

1. Vercel → Project → **Deployments**
2. 목록에서 “branch + commit hash”가 같이 보이는 항목을 찾는다(예: `main 53b22ce`)
3. 그 배포를 클릭해서 상세에서 **Source**가 Git인지 확인
4. 해당 배포를 **Promote to Production** (또는 Production Alias로 승격)

주의:
- “Production Current”가 Redeploy 체인으로만 갱신되고 있다면, 승격 대상이 잘못된 것이다.

---

## 4) PWA(Service Worker) 때문에 옛 화면이 남는 경우

프로덕션 번들이 새 버전으로 확인됐는데도 UI가 안 바뀌면(= 1번 검사에서 이미 새 키가 보이면),
그때는 PWA 캐시가 원인일 수 있다.

- 시크릿 창으로 먼저 접속해서 확인
- DevTools → Application → Service Workers → **Unregister** → 새로고침
- 또는 `https://mystats-eta.vercel.app/?v=<timestamp>` 같이 쿼리 붙여서 로드

---

## 5) CLI로 확인(선택)

리눅스/원격 서버에서 아래 스크립트로 프로덕션 번들이 “옛/새” 중 무엇인지 빠르게 판별할 수 있다.

- `scripts/vercel-check-deploy.sh`
