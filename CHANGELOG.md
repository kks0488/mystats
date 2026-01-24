# Changelog

All notable changes to this project will be documented in this file.

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

