// Registration success tracking stays audience-specific and contains no PII.
//
//   npm run check:registration
import { ok, report } from "./harness";
import {
  REGISTRATION_EVENT_COOKIE,
  REGISTRATION_SUCCESS_PATH,
  hasRegistrationEventMarker,
  registrationEventData,
} from "@/lib/registration-tracking";

const playerCookies = `theme=light; ${REGISTRATION_EVENT_COOKIE}=player`;
const partnerCookies = `${REGISTRATION_EVENT_COOKIE}=partner; session=check`;

ok(
  "player and partner registrations have distinct success URLs",
  REGISTRATION_SUCCESS_PATH.player === "/welcome/player" &&
    REGISTRATION_SUCCESS_PATH.partner === "/welcome/partner"
);
ok(
  "the player marker only matches the player success page",
  hasRegistrationEventMarker(playerCookies, "player") &&
    !hasRegistrationEventMarker(playerCookies, "partner")
);
ok(
  "the partner marker only matches the partner success page",
  hasRegistrationEventMarker(partnerCookies, "partner") &&
    !hasRegistrationEventMarker(partnerCookies, "player")
);
ok(
  "missing and similarly named cookies do not trigger registration",
  !hasRegistrationEventMarker("", "player") &&
    !hasRegistrationEventMarker(
      `${REGISTRATION_EVENT_COOKIE}_old=player`,
      "player"
    )
);

const playerEvent = registrationEventData("player");
const partnerEvent = registrationEventData("partner");
ok(
  "GTM receives one stable event name with an audience dimension",
  playerEvent.event === "registration_complete" &&
    playerEvent.user_type === "player" &&
    partnerEvent.event === "registration_complete" &&
    partnerEvent.user_type === "partner"
);
ok(
  "registration tracking contains no direct personal data",
  !JSON.stringify([playerEvent, partnerEvent]).match(
    /email|phone|full_name|player_name/
  )
);

report();
