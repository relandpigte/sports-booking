"use client";

import { useEffect } from "react";

import {
  REGISTRATION_EVENT_COOKIE,
  registrationMethodFromMarker,
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
    const method = registrationMethodFromMarker(document.cookie, userType);
    if (!method) return;

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(registrationEventData(userType, method));

    document.cookie = `${REGISTRATION_EVENT_COOKIE}=; Max-Age=0; Path=/welcome; SameSite=Lax`;
  }, [userType]);

  return null;
}
