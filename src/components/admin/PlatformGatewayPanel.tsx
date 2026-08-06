"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  connectPlatformGatewayAction,
  disconnectPlatformGatewayAction,
  type PlatformGatewayFormState,
} from "@/lib/platform-gateway-actions";
import type { PlatformGatewayView } from "@/lib/platform-gateway";

const initialState: PlatformGatewayFormState = {};

function Banner({ state }: { state: PlatformGatewayFormState }) {
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
      >
        {state.success}
      </p>
    );
  }
  if (state.message) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
      >
        {state.message}
      </p>
    );
  }
  return null;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">
        Settlement webhook URL
      </span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function PlatformGatewayPanel({
  gateway,
  webhookUrl,
  webhookUrlReachable,
}: {
  gateway: PlatformGatewayView | null;
  webhookUrl: string;
  webhookUrlReachable: boolean;
}) {
  const [connectState, connectAction, connecting] = useActionState(
    connectPlatformGatewayAction,
    initialState
  );
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectPlatformGatewayAction,
    initialState
  );
  const [showForm, setShowForm] = useState(false);
  const connected = gateway?.connected ?? false;

  return (
    <section className="rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            PayMongo collection account
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Partner service-fee settlements paid through QR Ph are deposited
            directly into this PayMongo account.
          </p>
        </div>
        {connected ? (
          <Badge tone="success">
            {gateway?.mode === "live" ? "Live" : "Test"} · Connected
          </Badge>
        ) : (
          <Badge tone="warn">Not connected</Badge>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <Banner state={disconnectState} />

        {gateway && (
          <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 px-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Account</dt>
              <dd className="font-medium text-gray-900">
                {gateway.accountLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Secret key</dt>
              <dd className="font-mono text-gray-900">
                {gateway.secretKeyHint}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Configured from</dt>
              <dd className="text-gray-900">
                {gateway.source === "dashboard"
                  ? "Admin dashboard"
                  : "Server environment"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Automatic settlement</dt>
              <dd
                className={
                  gateway.webhookConnected
                    ? "font-medium text-green-700"
                    : "font-medium text-amber-700"
                }
              >
                {gateway.webhookConnected
                  ? "Webhook configured"
                  : "Return check only"}
              </dd>
            </div>
          </dl>
        )}

        <CopyField value={gateway?.webhookUrl ?? webhookUrl} />
        <p className="-mt-2 text-xs text-gray-400">
          PayMongo calls this signed endpoint after an online payment succeeds.
          The connection form registers it automatically when possible.
        </p>

        {!webhookUrlReachable && (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            This URL is not reaching the settlement webhook. Funds can still
            arrive in PayMongo, but automatic settlement confirmation and
            checkout returns will be unreliable. Update <code>APP_URL</code>{" "}
            to the live HTTPS site, restart the app, then replace this
            connection.
          </p>
        )}

        {connected && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showForm ? "Cancel" : "Replace key"}
            </button>
            {gateway?.source === "dashboard" && (
              <form action={disconnectAction}>
                <button
                  type="submit"
                  disabled={disconnecting}
                  className="text-sm text-gray-500 hover:underline disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </form>
            )}
          </div>
        )}

        {(!connected || showForm) && (
          <form action={connectAction} noValidate className="flex flex-col gap-4">
            <Banner state={connectState} />

            <Input
              label="PayMongo secret key"
              name="secretKey"
              type="password"
              placeholder="sk_test_… or sk_live_…"
              autoComplete="off"
              error={connectState.errors?.secretKey}
            />
            <p className="-mt-2 text-xs text-gray-400">
              Find it in PayMongo under{" "}
              <span className="font-medium text-gray-500">
                Developers → API Keys
              </span>
              . Start with a test key, then replace it with a live key when
              you&apos;re ready to collect real service fees.
            </p>

            {(connectState.needsWebhookSecret ||
              connectState.errors?.webhookSecret) && (
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Webhook signing secret"
                  name="webhookSecret"
                  type="password"
                  placeholder="whsk_…"
                  autoComplete="off"
                  error={connectState.errors?.webhookSecret}
                />
                <p className="text-xs text-gray-400">
                  In PayMongo, create a webhook for the URL above and subscribe
                  to <code>checkout_session.payment.paid</code>, then paste the
                  signing secret shown at creation.
                </p>
              </div>
            )}

            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              The secret key and webhook signing secret are encrypted before
              storage and are never shown again. Only the final four key
              characters are kept separately for identification.
            </p>

            <Button
              type="submit"
              disabled={connecting}
              className="sm:w-auto sm:px-8"
            >
              {connecting
                ? "Verifying…"
                : connected
                  ? "Replace connection"
                  : "Connect PayMongo"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
