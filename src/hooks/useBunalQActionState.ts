"use client";

import { useActionState, useCallback } from "react";

import type { OpenPlayActionState } from "@/lib/open-play-shared";

export type BunalQAction = (
  previous: OpenPlayActionState,
  formData: FormData
) => Promise<OpenPlayActionState>;

export async function runBunalQActionSafely(
  action: BunalQAction,
  previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  try {
    return await action(previous, formData);
  } catch (error) {
    console.error("BunalQ action failed", error);
    return {
      message:
        "BunalQ could not complete that update. Reload this page, then try again.",
      reloadRequired: true,
    };
  }
}

export function useBunalQActionState(action: BunalQAction) {
  const safeAction = useCallback(
    (previous: OpenPlayActionState, formData: FormData) =>
      runBunalQActionSafely(action, previous, formData),
    [action]
  );

  return useActionState(safeAction, {});
}
