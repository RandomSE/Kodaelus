# Security

## Reporting a vulnerability

If you believe you have found a security issue in Kodaelus (installer, SDK
runner, or documented behavior), please report it privately:

1. Open a **private** security advisory on GitHub (if enabled for this repo), or
2. Contact the repository owner through a channel they publish for security reports.

Please do not open a public issue for undisclosed vulnerabilities.

## Scope

In scope:

- The Kodaelus installer (`install/`)
- The SDK runner under `sdk/src/`
- Instructions or templates that could lead to unsafe defaults when followed

Out of scope:

- Vulnerabilities in Cursor, the Cursor SDK, or your own project code
- Social engineering or misuse of API keys you place in `.env`

## Secrets

Never commit `.env` or real `CURSOR_API_KEY` values. Use `.env.example` as a
template only.
