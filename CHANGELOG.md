# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4] - 2026-01-25

### Added
- Helper script to set Cloud Sync env vars on Vercel (`scripts/vercel-set-cloud-sync-env.sh`).

### Docs
- Clarified that `localhost` Supabase URLs won't work on Vercel.

## [1.2.3] - 2026-01-25

### Added
- Backup export metadata now includes app version + DB schema version.
- Restore confirmation now uses translations and explains merge behavior.

### Changed
- Embedded memU now caches per-entry embeddings for faster repeated searches.

### Fixed
- Import summary now includes solutions.

## [1.2.2] - 2026-01-24

### Added
- Optional Sentry error reporting (`VITE_SENTRY_DSN`) with lazy loading.

## [1.2.1] - 2026-01-24

### Fixed
- Cloud Sync sign-in error status messaging.

## [1.2.0] - 2026-01-24

### Added
- **Cloud Sync (Beta)**: optional Supabase Auth + cross-device sync for journals/skills/insights/solutions.
- **Auto Sync**: background sync on data changes (when enabled).
- Supabase setup assets: `.env.example`, `docs/CLOUD_SYNC.md`, and SQL migration under `supabase/migrations/`.

## [1.1.3] - 2026-01-24

### Added
- In-app **PWA update/offline-ready prompt** (reload when a new version is available).

## [1.1.2] - 2026-01-24

### Added
- **CI pipeline** (GitHub Actions): lint + test + build on push/PR.
- **Unit tests** (Vitest): initial coverage for embedded memU behavior.
- **Debug report**: copy a sanitized debug snapshot from the crash screen.

### Changed
- App version is now injected at build time and shown in the UI.
- Dev server port can be configured via `PORT` / `VITE_PORT` (defaults to `5178`).

## [1.1.1] - 2026-01-24

### Added
- **Chrome launcher extension**: click the toolbar icon to open/focus the MyStats PWA (`chrome-extension/`).

## [1.1.0] - 2026-01-24

### Added
- **PWA support**: installable on iOS/Android/Desktop with an offline-friendly app shell.
- **Embedded memU memory engine**: browser-only memory retrieval + similarity checks over journal entries (no server required).
- **memU settings**: choose engine (Embedded vs Server/API) and optionally inject memory context into Strategy.

### Changed
- Journal → memU sync (dedupe + store) now runs only in **Server/API** mode.
- Dev proxy for memU now respects `MEMU_API_URL` (defaults to `http://localhost:8100`).

### Notes
- Embedded mode is intentionally scoped to the configured `userId` and does not fetch `project-registry` memories.
- If you already run an external memU server, switch to **Server (API)** in Settings to keep using it.
