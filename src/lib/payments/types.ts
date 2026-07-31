// Shared result shapes for partner-owned booking gateways.

export type Money = { amount: number; currency: "PHP" };

export type ChargeResult =
  | {
      status: "succeeded";
      paymentId: string;
      reference: string | null;
      raw: unknown;
    }
  | {
      status: "requires_action";
      paymentId: string;
      redirectUrl: string;
      clientKey: string | null;
      raw: unknown;
    }
  | {
      status: "pending";
      paymentId: string;
      reference: string | null;
      raw: unknown;
    }
  | {
      status: "failed";
      paymentId: string | null;
      code: string;
      message: string;
      raw: unknown;
    };

export type RefundResult =
  | {
      status: "succeeded" | "pending";
      refundId: string;
      amount: Money;
      raw: unknown;
    }
  | { status: "failed"; code: string; message: string; raw: unknown };

export type ProviderWebhookEvent = {
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "payment.refunded";
  providerPaymentId: string;
  reference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  // Present when PayMongo includes the collected amount in the signed event.
  amountCentavos?: number;
  // How they actually paid, when the hosted checkout tells us.
  methodType?: "CARD" | "GCASH" | "MAYA";
  raw: unknown;
};
