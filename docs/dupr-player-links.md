# DUPR player connections

Players can connect their DUPR account from **Account settings → DUPR rating**.
Once connected, their DUPR ratings appear on:

- their public profile (if it isn't private);
- the player dashboard;
- event rosters, both the organizer view and the public attendee list (a
  private player stays "Private player", with the rating beside it);
- BunalQ (operator console and public board).

BunalQ uses the doubles rating to balance teams. The leaderboard links a ranked
player to their Bunal.club profile when they have connected, have a username,
and keep their profile public.

## Configuration

The feature stays switched off, and the account page says "coming soon", until
all of these are set:

| Variable | Purpose |
| --- | --- |
| `DUPR_API_BASE_URL`, `DUPR_CLIENT_KEY`, `DUPR_CLIENT_SECRET` | The partner API credentials the leaderboard already uses. |
| `DUPR_SSO_URL` | DUPR's consent (SSO) page for this client key. |

The partner credentials also need the **`USER::DETAIL`** permission, used by
`POST /user/v1.0/batch`.

## What to confirm with DUPR before launch

DUPR's published API spec covers the partner endpoints but not the consent
page itself. Ask DUPR for:

1. **The consent page URL** for our client key. This becomes `DUPR_SSO_URL`.
2. **How the page reports the result.** The code expects a `postMessage` from
   the consent page's origin carrying the DUPR ID. It accepts a `duprId` or `id`
   field, at the top level or under `user`, `result`, or `data`.
   - The parser is `duprIdFromConsentMessage` in `src/lib/dupr-shared.ts`.
   - If DUPR redirects to a callback URL instead, add a route that reads the
     callback and calls `linkDuprAccount`.
3. **How to verify a connection on the server.**
   - Today `verifyDuprConsent` (`src/lib/dupr.ts`) relies on the documented
     restricted-partner rule: our partner token only sees players who consented
     to Bunal.club.
   - That proves the DUPR player consented to Bunal.club, but not which
     Bunal.club account they consented from. One DUPR ID can only ever be
     linked to one account, which limits the risk.
   - If DUPR returns a user token or a signed result, check it against the
     DUPR ID in `verifyDuprConsent`.
4. **The `USER::DETAIL` permission** on our partner credentials.

## How it works

- **Connecting.**
  - The card opens `DUPR_SSO_URL` in a popup and only reads messages from that
    origin and that window.
  - `linkDuprAccountAction` (`src/lib/dupr-actions.ts`) acts only on the real
    signed-in player. It is refused while an admin is assisting, and rate
    limited to 10 attempts an hour.
  - It verifies the DUPR ID with DUPR, then stores a `DuprLink` row.
- **Storage.** `DuprLink` holds the DUPR ID, name, and the singles/doubles
  ratings and reliability. No DUPR user tokens are stored.
- **Refreshing.** The hourly sweep (`sweepDuprRatings`) refreshes links older
  than a day, up to 500 per run in batches of 100.
  - A player DUPR stops returning keeps the link but is marked
    `consentLostAt`, and the account page asks them to reconnect.
  - A DUPR outage never fails the sweep.
- **Disconnecting** deletes the row. Deleting the user cascades.
- **BunalQ.**
  - The rating is copied into `OpenPlayParticipant.duprRating` when the event
    roster syncs, like the skill tier, so a run stays stable.
  - Team balancing uses `matchSkill` (`src/lib/open-play.ts`): the rating,
    else the tier mapped to 2.5 / 3.5 / 4.5. Guests and walk-ins use their
    tier.
  - An operator editing a player's details clears the rating for that run, so
    their skill pick decides.

## Checks

```bash
npm run check:dupr-link
npm run check:open-play
npm run check:leaderboard
```
