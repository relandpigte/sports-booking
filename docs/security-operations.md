# Security operations

## Required deployment configuration

- Set `AUTH_SECRET`, `ENCRYPTION_KEY`, `BOOKING_SWEEP_SECRET`, and an HTTPS
  canonical `APP_URL`. `/api/health/security` returns HTTP 503 when an essential
  value is absent.
- Leave `PARTNER_MFA_REQUIRED_AFTER` blank while partner MFA is optional. To
  require it, set an ISO cutover timestamp; after that timestamp, partner
  sign-in fails closed until authenticator MFA is enrolled. Partners who opt in
  remain protected even when no global cutover is configured.
- Run `POST /api/bookings/sweep` at least hourly with the sweep bearer token.
  The sweep also removes expired authentication artifacts and old throttle rows.

## CSP rollout

The application initially sends `Content-Security-Policy-Report-Only` and logs
bounded, rate-limited reports as `CSP_REPORT`. Review production reports for at
least seven days. Add only confirmed required origins, replace inline-script
allowance with the nonce flow documented for the installed Next.js version,
then promote the header to `Content-Security-Policy`.

## Hosting controls

- Enable Vercel WAF/bot protection and rate limits for `/api/auth/*`, payment
  routes, `/api/security/csp-report`, and availability streams. Application
  limits are defense in depth and do not replace edge controls.
- Protect `main` on GitHub: require pull requests, one approval, the `CI` and
  `CodeQL` checks, and block force-pushes and branch deletion.
- Enable Dependabot alerts and security updates. Repository configuration opens
  weekly dependency update pull requests; the account-level alert switches must
  still be enabled in GitHub settings.
- Confirm Neon point-in-time recovery and retention, use a runtime database role
  separate from the migration role, cap connections, and test a restore at least
  quarterly.

## Alerts to monitor

Alert on repeated login/MFA failures, `SECURITY_HEALTH_NOT_READY`, invalid
webhook signatures, failed booking sweeps, gateway changes, refunds, and manual
payment reviews older than two hours. Never include secrets, reset tokens, full
receipt images, or raw IP addresses in logs.
