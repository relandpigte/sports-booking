export const REGISTRATION_EVENT_COOKIE = "bunal_registration_complete";

export const REGISTRATION_SUCCESS_PATH = {
  player: "/welcome/player",
  partner: "/welcome/partner",
} as const;

export type RegistrationUserType = keyof typeof REGISTRATION_SUCCESS_PATH;
export type RegistrationMethod = "credentials" | "google";

export function registrationMethodFromMarker(
  cookieHeader: string,
  userType: RegistrationUserType
): RegistrationMethod | null {
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REGISTRATION_EVENT_COOKIE}=`))
    ?.slice(REGISTRATION_EVENT_COOKIE.length + 1);
  if (value === userType) return "credentials";
  if (value === `${userType}:credentials`) return "credentials";
  if (value === `${userType}:google`) return "google";
  return null;
}

export function hasRegistrationEventMarker(
  cookieHeader: string,
  userType: RegistrationUserType
): boolean {
  return registrationMethodFromMarker(cookieHeader, userType) !== null;
}

export function registrationEventData(
  userType: RegistrationUserType,
  method: RegistrationMethod = "credentials"
) {
  return {
    event: "registration_complete",
    user_type: userType,
    method,
  } as const;
}
