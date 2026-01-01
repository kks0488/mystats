# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Design

MyStats is designed with **privacy-first** principles:

- **No Backend**: All data stored locally in IndexedDB
- **No Data Collection**: We never see your data
- **Direct API Connection**: Your Gemini API key connects directly to Google
- **Client-Side Only**: No server-side processing

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

- Your Gemini API key is stored in `localStorage`
- Never commit your API key to the repository
- Use environment variables for development
