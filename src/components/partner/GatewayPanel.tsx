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
import {
  SERVICE_FEE_PERCENT,
  VENUE_GATEWAYS,
} from "@/lib/constants";
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

function PayMongoSetupGuide({ connected }: { connected: boolean }) {
  return (
    <details
      open={!connected}
      className="rounded-xl border border-gray-200 bg-gray-50"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">
        How to create and connect your PayMongo account
      </summary>
      <div className="border-t border-gray-200 px-4 py-4">
        <ol className="flex flex-col gap-4">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              1
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Create your PayMongo account
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                <a
                  href="https://dashboard.paymongo.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  Sign up with PayMongo
                </a>{" "}
                and complete its business verification. You can use test keys
                while setting up; your PayMongo account and payment channels
                must be activated before accepting real payments.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              2
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Copy a matching API-key pair
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                In PayMongo, open{" "}
                <span className="font-medium text-gray-700">
                  Developers → API Keys
                </span>
                . For testing, copy the <code>pk_test_…</code> and{" "}
                <code>sk_test_…</code> keys. For real payments, use the{" "}
                <code>pk_live_…</code> and <code>sk_live_…</code> pair. Never
                mix test and live keys.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              3
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Connect the keys below
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Paste the public key into Publishable key and the matching
                secret into Secret key, then select Connect account. Bunal.club
                verifies the keys and registers the payment webhook
                automatically.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              4
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Activate each payment method
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                In PayMongo live mode, open{" "}
                <span className="font-medium text-gray-700">
                  Settings → Payment Methods
                </span>
                . QR Ph is enabled by default. Card, GCash, and Maya appear at
                checkout only after PayMongo approves and activates them for
                your account.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              5
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Test, then switch to live
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Complete a test booking first. When PayMongo has activated your
                live account, choose Replace keys here and replace both test
                keys with the matching live pair.
              </p>
            </div>
          </li>
        </ol>

        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          Treat your <code>sk_…</code> secret like a password. Never send it by
          chat or email. If it is exposed, regenerate it in PayMongo and replace
          it here immediately.
        </p>
        <a
          href="https://docs.paymongo.com/do/docs/account-settings-api-keys"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
        >
          Read PayMongo&apos;s official API-key guide →
        </a>
      </div>
    </details>
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
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Getting paid by players
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Connect your own payment account. Players pay you directly and you
            keep your full court rate. A {SERVICE_FEE_PERCENT}% service fee is
            deposited alongside it and remitted to Bunal.club through the
            settlement panel below.
          </p>
        </div>
        {connected && <Badge tone="success">Connected</Badge>}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Banner state={disconnectState} />
        <PayMongoSetupGuide connected={connected} />

        {connected && gateway && (
          <>
            <div className="rounded-xl border border-ocean/20 bg-ocean-soft px-4 py-3">
              <p className="text-sm font-bold text-navy">
                Seeing only QR Ph at checkout?
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Bunal.club requests QR Ph, card, GCash, and Maya on every
                PayMongo checkout. PayMongo displays only the methods activated
                for this account. Enable your wallet and review{" "}
                <span className="font-semibold text-navy">
                  Settings → Payment Methods
                </span>{" "}
                in PayMongo live mode.
              </p>
              <a
                href="https://docs.paymongo.com/docs/account-settings-account-capabilities"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-bold text-ocean hover:underline"
              >
                Read PayMongo&apos;s activation guide ↗
              </a>
            </div>
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
              Registered in your PayMongo account automatically — this is how
              they tell us a payment succeeded. Shown here for reference only.
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

            {provider === "paymongo" && (
              <p className="-mt-1 text-xs text-gray-400">
                Both keys are in your PayMongo dashboard under{" "}
                <span className="font-medium text-gray-500">
                  Developers → API Keys
                </span>
                . Use the test keys until you&apos;re ready to take real money —
                and make sure both come from the same mode.
              </p>
            )}

            {/* Only asked for when we couldn't register the webhook ourselves.
                Nothing was stored in that case, so this is a retry, not a
                repair. */}
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
                  Create a webhook in PayMongo pointing at the URL above for the{" "}
                  <code className="text-gray-500">
                    checkout_session.payment.paid
                  </code>{" "}
                  event, then paste the signing secret it shows you.
                </p>
              </div>
            )}

            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Your keys are encrypted before they&apos;re stored and are never
              shown again — only the last few characters. We use them to take
              payments on your behalf and to register the webhook that tells us
              when one succeeds. PayMongo&apos;s processing fee is added at
              checkout so it does not reduce your court revenue.
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
