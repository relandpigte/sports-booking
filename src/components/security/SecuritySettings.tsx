import { MfaSetupPanel } from "@/components/auth/MfaSetupPanel";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { DisableMfaForm } from "@/components/security/DisableMfaForm";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
  startAccountMfaSetupAction,
} from "@/lib/security-actions";
import { roleRequiresMfa } from "@/lib/mfa-policy";

type SecurityOverview = {
  role: "ADMIN" | "PLAYER" | "PARTNER";
  mfaEnabledAt: Date | null;
  hasPassword: boolean;
  googleConnected: boolean;
  unusedRecoveryCodes: number;
  sessions: Array<{
    id: string;
    deviceLabel: string;
    location: string | null;
    ipPrefix: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    current: boolean;
  }>;
  events: Array<{
    id: string;
    type: string;
    deviceLabel: string | null;
    location: string | null;
    createdAt: Date;
  }>;
};

const EVENT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Successful login",
  LOGIN_NEW_DEVICE: "Login from a new device",
  LOGIN_FAILED: "Failed login attempt",
  MFA_CHALLENGE_FAILED: "Failed MFA verification",
  MFA_SETUP_FAILED: "Failed MFA setup verification",
  MFA_ENABLED: "Authenticator MFA enabled",
  MFA_DISABLED: "Authenticator MFA disabled",
  MFA_RECOVERY_CODE_USED: "Recovery code used",
  PASSWORD_CHANGED: "Password changed",
  PASSWORD_RESET: "Password reset",
  SESSION_REVOKED: "Session revoked",
  OTHER_SESSIONS_REVOKED: "Other sessions revoked",
};

function formatDate(value: Date): string {
  return value.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

function eventTone(type: string): string {
  if (type.includes("FAILED")) return "bg-red-500";
  if (type.includes("MFA") || type.includes("PASSWORD")) return "bg-ocean";
  return "bg-primary";
}

export function SecuritySettings({
  overview,
  email,
  passwordChanged,
  setup,
}: {
  overview: SecurityOverview;
  email: string;
  passwordChanged: boolean;
  setup?: { secret: string } | null;
}) {
  const mfaRequired = roleRequiresMfa(overview.role);
  const secured = overview.mfaEnabledAt !== null;
  const googleOnly = overview.googleConnected && !overview.hasPassword;
  const protectedAccount = googleOnly || secured;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          protectedAccount
            ? "border-primary/20 bg-primary-soft/40"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${
            protectedAccount ? "bg-primary" : "bg-amber-500"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-navy">
            Security health: {protectedAccount ? "Protected" : "Needs attention"}
          </h2>
          <p className="text-xs leading-5 text-slate-600">
            {googleOnly
              ? "Google manages your sign-in credentials and account verification."
              : secured
                ? "Your account is protected by password and authenticator MFA."
                : "Enable authenticator MFA to protect your account if your password is exposed."}
          </p>
        </div>
      </div>

      {googleOnly ? (
        <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Sign-in method
          </p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-navy">
            Google Account
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500">
            This account does not have a Bunal.club password. Password and
            authenticator controls are managed through your Google Account.
            You can still review and revoke Bunal.club sessions below.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-navy">
                    Authenticator MFA
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                      secured
                        ? "bg-primary-soft text-primary"
                        : mfaRequired
                          ? "bg-red-50 text-red-700"
                          : "bg-navy-soft text-navy"
                    }`}
                  >
                    {secured
                      ? "Enabled"
                      : mfaRequired
                        ? "Required"
                        : "Recommended"}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  Use Google Authenticator, Microsoft Authenticator, 1Password,
                  or another compatible app to generate secure sign-in codes.
                </p>
                {secured && (
                  <p className="mt-3 text-xs font-medium text-gray-600">
                    {overview.unusedRecoveryCodes} unused recovery codes remain.
                  </p>
                )}
              </div>
              {!secured && !setup && (
                <form action={startAccountMfaSetupAction}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
                  >
                    Enable MFA
                  </button>
                </form>
              )}
            </div>

            {setup && (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <MfaSetupPanel
                  email={email}
                  secret={setup.secret}
                  accountSetup
                />
              </div>
            )}
            {secured && !mfaRequired && <DisableMfaForm />}
            {secured && mfaRequired && (
              <p className="mt-4 text-xs text-gray-500">
                MFA cannot be disabled for administrator accounts.
              </p>
            )}
          </section>

          <ChangePasswordForm changed={passwordChanged} email={email} />
        </>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-navy">
                Active sessions
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Devices currently signed in to your Bunal.club account.
              </p>
            </div>
            {overview.sessions.length > 1 && (
              <form action={revokeOtherSessionsAction}>
                <button
                  type="submit"
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  Revoke all other sessions
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {overview.sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-navy">
                    {session.deviceLabel}
                  </p>
                  {session.current && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      This device
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {[session.location, session.ipPrefix].filter(Boolean).join(" · ") ||
                    "Location unavailable"}
                  {" · Last active "}
                  {formatDate(session.lastSeenAt)}
                </p>
              </div>
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <button
                  type="submit"
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  {session.current ? "Sign out this device" : "Revoke"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 className="text-lg font-bold tracking-tight text-navy">
            Recent security activity
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Sign-ins and important changes from the last 20 events.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {overview.events.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500 sm:px-6">
              No security activity has been recorded yet.
            </p>
          ) : (
            overview.events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${eventTone(event.type)}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {EVENT_LABELS[event.type] ?? event.type.replaceAll("_", " ")}
                    </p>
                    {(event.deviceLabel || event.location) && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {[event.deviceLabel, event.location]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <time className="text-xs text-gray-500">
                  {formatDate(event.createdAt)}
                </time>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
