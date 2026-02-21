# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Design

MyStats is designed with **privacy-first, local-first** principles:

### Data Storage
- **Local-first**: All data (journals, skills, insights) stored in IndexedDB in the user's browser
- **Fallback storage**: localStorage / in-memory when IndexedDB is unavailable
- **No mandatory backend**: No tracking, no analytics, no data collection by default
- **Cloud Sync (optional)**: When explicitly enabled, data syncs via Supabase (encrypted in transit via TLS)

### AI Providers (BYOK)
- **Direct API connection**: Your API key connects directly from the browser to the chosen provider
- Supported providers: **Gemini, OpenAI, Claude, Grok**
- API keys are stored in `localStorage` and **never leave your browser**
- API keys are **not included** in Cloud Sync (stays per-device)

### memU Memory System
- **Embedded mode (default)**: Runs entirely in the browser — no external calls
- **Server mode (optional)**: Connects to a user-controlled local memU server only

### Cloud Sync (Beta)
- Uses **Supabase Auth** (email magic link) — no passwords stored locally
- Row Level Security (RLS) enforced: users can only read/write their own data
- Supabase anon key is a public client key (safe to expose, scoped by RLS)

## Automated Security Checks

- CI runs `npm audit --omit=dev --audit-level=high` on every push to `main` and every pull request
- Dependabot is enabled for:
  - npm dependencies (`/`)
  - GitHub Actions (`/`)
- Code scanning workflow:
  - `/.github/workflows/codeql.yml` runs CodeQL on push/PR and weekly schedule
- Secret scanning workflow:
  - `/.github/workflows/secret-scan.yml` runs Gitleaks on push/PR
  - local allowlist config: `/.gitleaks.toml`
- Cloud Sync setup script guards against secret key misuse:
  - `scripts/vercel-set-cloud-sync-env.sh` refuses `sb_secret_*`
  - JWT payload with `role=service_role` is rejected for client env usage

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email: kks0488@gmail.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact

We'll respond within 48 hours.

## API Key Safety

- API keys are stored in `localStorage` per device
- Never commit your API key to the repository
- Use environment variables for development (see `.env.example`)
- In Safari private mode, `localStorage` may be unavailable — the app handles this gracefully
