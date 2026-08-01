# DUPR leaderboard setup

The public `/leaderboard` page keeps Singles and Doubles ratings separate. It
shows a connection-pending state until all four server environment variables
are configured:

```env
DUPR_API_BASE_URL=""
DUPR_CLIENT_KEY=""
DUPR_CLIENT_SECRET=""
DUPR_CLUB_ID=""
```

Request Partner API access and the `CLUB_MEMBER_INFO::VIEW` permission from
DUPR. Use the production base URL supplied during onboarding. DUPR's published
Swagger server is UAT, so the app deliberately does not guess a production
URL.

The integration requests a one-hour bearer token from
`POST /auth/v1.0/token`, then loads club members from
`POST /club/v1.0/members`. Credentials, bearer tokens, and raw upstream errors
remain server-only. Successful snapshots are reused for 15 minutes per server
instance; a failed refresh shows the temporary-unavailable state instead of
stale or invented rankings.

After changing configuration, run:

```bash
npm run check:leaderboard
npm run build
```
