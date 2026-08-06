"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5_000;

export function PaymentStatusPoller({
  paymentId,
  initialStatus,
  initialChargeInFlight,
}: {
  paymentId: string;
  initialStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  initialChargeInFlight: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let running = false;

    async function poll() {
      if (
        stopped ||
        running ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      ) {
        return;
      }

      running = true;
      try {
        const response = await fetch(`/api/payments/${paymentId}/status`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;

        const payment = (await response.json()) as {
          status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
          secondsLeft: number;
          chargeInFlight: boolean;
        };
        if (stopped) return;
        if (
          payment.status !== initialStatus ||
          payment.chargeInFlight !== initialChargeInFlight ||
          payment.secondsLeft <= 0
        ) {
          stopped = true;
          router.refresh();
        }
      } catch {
        // The hold countdown keeps running; the next interval can retry after
        // a transient network failure without disrupting the checkout.
      } finally {
        running = false;
      }
    }

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [initialChargeInFlight, initialStatus, paymentId, router]);

  return null;
}
