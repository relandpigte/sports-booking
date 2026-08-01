export const REGISTRATION_EVENT_COOKIE = "bunal_registration_complete";

export const REGISTRATION_SUCCESS_PATH = {
  player: "/welcome/player",
  partner: "/welcome/partner",
} as const;

export type RegistrationUserType = keyof typeof REGISTRATION_SUCCESS_PATH;

export function hasRegistrationEventMarker(
  cookieHeader: string,
  userType: RegistrationUserType
): boolean {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${REGISTRATION_EVENT_COOKIE}=${userType}`);
}

export function registrationEventData(userType: RegistrationUserType) {
  return {
    event: "registration_complete",
    user_type: userType,
    method: "credentials",
  } as const;
}
