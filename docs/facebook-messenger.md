# Facebook Messenger automatic replies

Bunal.club can answer messages sent to its own Facebook Page. The integration
does not connect partner Pages, identify Messenger users as Bunal.club users,
or expose booking and payment records in chat.

## Deployment configuration

Create a Meta developer app with the Messenger product, then add these secrets
to the production deployment. Never commit their real values.

| Variable | Purpose |
| --- | --- |
| `FACEBOOK_MESSENGER_APP_SECRET` | Verifies `X-Hub-Signature-256` on every delivery. |
| `FACEBOOK_MESSENGER_VERIFY_TOKEN` | A random value shared only with Meta during webhook setup. Generate with `openssl rand -hex 32`. |
| `FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN` | Sends replies as the Bunal.club Page. |
| `FACEBOOK_MESSENGER_PAGE_ID` | Restricts accepted deliveries to the Bunal.club Page. |
| `FACEBOOK_MESSENGER_GRAPH_VERSION` | The current supported Graph API version shown in the Meta app dashboard, including the `v` prefix. |

Deploy those variables before asking Meta to verify the webhook.

## Meta webhook setup

1. Set the callback URL to
   `https://www.bunal.club/api/facebook/messenger`.
2. Enter the exact value of `FACEBOOK_MESSENGER_VERIFY_TOKEN` as the verify
   token.
3. Subscribe the Page to `messages` and `messaging_postbacks`.
4. Give the app the Page messaging permissions requested by Meta and connect
   the Bunal.club Page.
5. Send test messages from a Facebook account that is not the Page account.

The endpoint acknowledges only signed Page events. It ignores message echoes,
events addressed to another Page, and unsupported delivery/read events.

## Reply behavior

The assistant recognizes questions about:

- booking courts and browsing venues;
- open play and events;
- secure payment instructions and receipt uploads;
- cancellations, rescheduling, and refunds;
- listing a venue; and
- human support.

Unknown questions offer the menu and a human-support path. Attachments are not
treated as payment proof; the reply sends the player to the authenticated
booking page instead.

Message content and Page-scoped user ids are not retained. A SHA-256 event id
is stored for 30 days to prevent duplicate replies, and each sender is limited
to 30 processed messages per hour. Failed Send API calls release the event claim
so Meta can retry the delivery.

Meta requires the person to initiate the conversation. Keep automated replies
inside Meta's standard messaging window and let the Page Inbox handle the human
follow-up.
