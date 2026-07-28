"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { RadioCards } from "@/components/ui/RadioCards";
import {
  connectGatewayAction,
  disconnectGatewayAction,
  type GatewayFormState,
} from "@/lib/gateway-actions";
import { VENUE_GATEWAYS } from "@/lib/constants";
import type { GatewayView } from "@/lib/partner-gateway";

const initial: GatewayFormState = {};

function Banner({ state }: { state: GatewayFormState }) {
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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">{label}</span>
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

// Connect / disconnect a partner's own gateway.
//
// A secret key is never rendered and the form is never pre-filled — the only
// thing shown for a connected account is the hint (…9f2a), which is stored in
// plaintext for exactly this reason.
export function GatewayPanel({ gateway }: { gateway: GatewayView | null }) {
  const [provider, setProvider] = useState<string>(
    gateway?.provider ?? VENUE_GATEWAYS[0].value
  );
  const [connectState, connectAction, connecting] = useActionState(
    connectGatewayAction,
    initial
  );
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectGatewayAction,
    initial
  );
  const [showForm, setShowForm] = useState(false);

  const connected = gateway?.connected ?? false;

  return (
    <section className="rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Getting paid by players
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Connect your own payment account. Players pay you directly — Sports
            360 takes no cut and never holds your money.
          </p>
        </div>
        {connected && <Badge tone="success">Connected</Badge>}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Banner state={disconnectState} />

        {connected && gateway && (
          <>
            <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Account</dt>
                <dd className="text-gray-900">
                  {gateway.accountLabel ?? gateway.provider}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Secret key</dt>
                <dd className="font-mono text-gray-900">
                  {gateway.secretKeyHint}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Publishable key</dt>
                <dd className="truncate font-mono text-gray-900">
                  {gateway.publicKey}
                </dd>
              </div>
            </dl>

            <CopyField label="Your webhook URL" value={gateway.webhookUrl} />
            <p className="-mt-1 text-xs text-gray-400">
              Paste this into your gateway&apos;s dashboard so it can tell us
              when a payment succeeds.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {showForm ? "Cancel" : "Replace keys"}
              </button>
              <form action={disconnectAction}>
                <button
                  type="submit"
                  disabled={disconnecting}
                  className="text-sm text-gray-500 hover:underline disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </form>
            </div>
          </>
        )}

        {(!connected || showForm) && (
          <form action={connectAction} noValidate className="flex flex-col gap-4">
            <Banner state={connectState} />

            <RadioCards
              name="provider"
              value={provider}
              onChange={setProvider}
              error={connectState.errors?.provider}
              options={VENUE_GATEWAYS.map((g) => ({
                value: g.value,
                label: g.label,
                description: g.hint,
              }))}
            />

            <Input
              label="Publishable key"
              name="publicKey"
              placeholder="pk_test_…"
              autoComplete="off"
              error={connectState.errors?.publicKey}
            />
            {/* type=password so the value isn't shoulder-surfed or captured by
                a password manager's autofill preview. */}
            <Input
              label="Secret key"
              name="secretKey"
              type="password"
              placeholder="sk_test_…"
              autoComplete="off"
              error={connectState.errors?.secretKey}
            />
            <Input
              label="Webhook signing secret"
              name="webhookSecret"
              type="password"
              autoComplete="off"
              error={connectState.errors?.webhookSecret}
            />

            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Your keys are encrypted before they&apos;re stored and are never
              shown again — only the last few characters. You can replace or
              disconnect them at any time.
            </p>

            <Button
              type="submit"
              disabled={connecting}
              className="sm:w-auto sm:px-8"
            >
              {connecting
                ? "Verifying…"
                : connected
                  ? "Replace keys"
                  : "Connect account"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
