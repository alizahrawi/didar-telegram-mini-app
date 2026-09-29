# Security Policy

## Supported Version

Security fixes are applied to the latest commit on the `main` branch.

## Reporting a Vulnerability

Please do not publish credentials, personal data, or exploitable details in a public issue.

Use GitHub’s private **Report a vulnerability** flow when it is available for this repository. Otherwise, contact the repository owner privately and include:

- the affected file or endpoint;
- the impact and reproduction steps;
- a minimal proof of concept with all secrets redacted; and
- a suggested fix, if you have one.

## Secret Handling

- Never commit `.env`, `.dev.vars`, bot tokens, Cloudflare API tokens, session secrets, webhook secrets, or database credentials.
- Store production values with `wrangler secret put` or the hosting provider’s encrypted secret manager.
- Use different secrets for development and production.
- Treat screenshots, logs, chat messages, CI output, and issue attachments as public unless proven otherwise.
- If a Telegram bot token is exposed anywhere, revoke it immediately in @BotFather and update every deployment that used it.

## Security Controls

- Telegram Mini App authentication is validated server-side using Telegram’s signed `initData` payload.
- Authentication payloads have a strict age limit and size limit.
- Session tokens are signed, expire automatically, and require a strong secret.
- Telegram webhook requests must include the configured `X-Telegram-Bot-Api-Secret-Token` header.
- User-provided URLs require HTTPS; Instagram and LinkedIn links are restricted to their official domains.
- API responses disable caching and MIME sniffing.
- The static GitHub Pages preview contains no bot token, database credential, or server-side secret.

## Deployment Recommendations

- Keep `ALLOW_DEV_AUTH=false` in every public environment.
- Enable GitHub secret scanning and Dependabot alerts.
- Enable Cloudflare rate limiting for `/api/auth`, `/api/rooms/*`, and the webhook endpoint before a public production launch.
- Rotate `SESSION_SECRET` and `TELEGRAM_WEBHOOK_SECRET` after any suspected disclosure.
- Review `npm audit` results and update dependencies before deployment.

Run the repository checks locally with:

```bash
npm run security:check
npm test
```
