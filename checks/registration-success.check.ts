// Registration success tracking stays audience-specific and contains no PII.
//
//   npm run check:registration
import { ok, report } from "./harness";
import {
  REGISTRATION_EVENT_COOKIE,
  REGISTRATION_SUCCESS_PATH,
  hasRegistrationEventMarker,
  registrationMethodFromMarker,
  registrationEventData,
} from "@/lib/registration-tracking";
import { isIncompleteGoogleRegistration } from "@/lib/registration-state";
import {
  GoogleRegistrationSchema,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PartnerApplicationSchema,
  ProfileSchema,
  RegisterSchema,
} from "@/lib/validation";

const playerCookies = `theme=light; ${REGISTRATION_EVENT_COOKIE}=player:credentials`;
const partnerCookies = `${REGISTRATION_EVENT_COOKIE}=partner:google; session=check`;

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
const partnerEvent = registrationEventData("partner", "google");
ok(
  "GTM receives one stable event name with an audience dimension",
  playerEvent.event === "registration_complete" &&
    playerEvent.user_type === "player" &&
    partnerEvent.event === "registration_complete" &&
    partnerEvent.user_type === "partner" &&
    playerEvent.method === "credentials" &&
    partnerEvent.method === "google"
);
ok(
  "registration markers retain the authentication method",
  registrationMethodFromMarker(playerCookies, "player") === "credentials" &&
    registrationMethodFromMarker(partnerCookies, "partner") === "google"
);
ok(
  "registration tracking contains no direct personal data",
  !JSON.stringify([playerEvent, partnerEvent]).match(
    /email|phone|full_name|player_name/
  )
);

const googleAccount = [{ provider: "google" }];
ok(
  "only unfinished Google identities require role selection",
  isIncompleteGoogleRegistration({
    role: "PLAYER",
    registrationCompletedAt: null,
    passwordHash: null,
    accounts: googleAccount,
  })
);
ok(
  "password users and completed Google players stay complete without profiles",
  !isIncompleteGoogleRegistration({
    role: "PLAYER",
    registrationCompletedAt: new Date(),
    passwordHash: "hash",
    accounts: googleAccount,
  }) &&
    !isIncompleteGoogleRegistration({
      role: "PLAYER",
      registrationCompletedAt: new Date(),
      passwordHash: null,
      accounts: googleAccount,
    })
);

ok(
  "credential registration requires only email and one password",
  RegisterSchema.safeParse({
    email: "minimal-player@example.test",
    password: "correct-horse-battery-staple",
  }).success &&
    !RegisterSchema.safeParse({
      email: "not-an-email",
      password: "correct-horse-battery-staple",
    }).success
);
ok(
  "new passwords enforce a bcrypt-safe length policy",
  MIN_PASSWORD_LENGTH === 15 &&
    MAX_PASSWORD_BYTES === 64 &&
    !RegisterSchema.safeParse({
      email: "minimal-player@example.test",
      password: "too-short",
    }).success &&
    !RegisterSchema.safeParse({
      email: "minimal-player@example.test",
      password: "x".repeat(65),
    }).success
);
ok(
  "Google registration requires only a valid app role",
  GoogleRegistrationSchema.safeParse({ role: "PLAYER" }).success &&
    GoogleRegistrationSchema.safeParse({ role: "PARTNER" }).success &&
    !GoogleRegistrationSchema.safeParse({ role: "ADMIN" }).success
);
ok(
  "player profile fields remain optional after signup",
  ProfileSchema.safeParse({
    name: "",
    playerName: "",
    phone: "",
    facebookPage: "",
    skillLevel: "intermediate",
    privateProfile: false,
  }).success
);
ok(
  "partner review submission requires complete owner and venue details",
  PartnerApplicationSchema.safeParse({
    fullName: "Venue Owner",
    phone: "09171234567",
    hubName: "Test Courts",
    slug: "test-courts",
    hubAbout: "",
    hubPhone: "",
    hubEmail: "",
    address: "123 Test Street, Manila",
    games: ["pickleball"],
    facebookPage: "",
  }).success &&
    !PartnerApplicationSchema.safeParse({
      fullName: "Venue Owner",
      phone: "09171234567",
      hubName: "",
      slug: "",
      hubAbout: "",
      hubPhone: "",
      hubEmail: "",
      address: "",
      games: [],
      facebookPage: "",
    }).success
);

report();
