import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/dal";
import { logoutAction } from "@/lib/actions";
import { SKILL_LEVELS, ROLE_LABELS } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const skillLabel =
    SKILL_LEVELS.find((s) => s.value === user?.skillLevel)?.label ??
    user?.skillLevel;

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <Logo />
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome, {user?.playerName ?? user?.name ?? "Player"}
            </h1>
            {user?.role && (
              <span className="mt-1 shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            You&apos;re signed in. Play. Book. Connect.
          </p>

          <dl className="mt-6 divide-y divide-gray-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-gray-500">Full name</dt>
              <dd className="font-medium text-gray-900">{user?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-gray-500">Skill level</dt>
              <dd className="font-medium text-gray-900">{skillLabel ?? "—"}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-gray-500">Profile</dt>
              <dd className="font-medium text-gray-900">
                {user?.privateProfile ? "Private" : "Public"}
              </dd>
            </div>
          </dl>
        </div>

        <form action={logoutAction} className="mt-5">
          <Button type="submit" variant="soft">
            Log Out
          </Button>
        </form>
      </div>
    </main>
  );
}
