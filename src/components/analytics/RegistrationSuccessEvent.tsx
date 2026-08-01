"use client";

import { useEffect } from "react";

import {
  REGISTRATION_EVENT_COOKIE,
  hasRegistrationEventMarker,
  registrationEventData,
  type RegistrationUserType,
} from "@/lib/registration-tracking";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function RegistrationSuccessEvent({
  userType,
}: {
  userType: RegistrationUserType;
}) {
  useEffect(() => {
    if (!hasRegistrationEventMarker(document.cookie, userType)) return;

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(registrationEventData(userType));

    document.cookie = `${REGISTRATION_EVENT_COOKIE}=; Max-Age=0; Path=/welcome; SameSite=Lax`;
  }, [userType]);

  return null;
}
