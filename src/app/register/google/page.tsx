import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/AuthLayout";
import { GoogleRoleForm } from "@/components/registration/GoogleRoleForm";
import { auth } from "@/lib/auth";
import { dashboardHomeFor } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import { isIncompleteGoogleRegistration } from "@/lib/registration-state";

function safeInternalPath(value: string | undefined): string {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
    ? value
    : "";
}

export default async function GoogleRegistrationChoicePage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string | string[];
    next?: string | string[];
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      registrationCompletedAt: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) redirect("/login");
  if (!isIncompleteGoogleRegistration(user)) {
    redirect(dashboardHomeFor(user.role));
  }

  const query = await searchParams;
  const requestedRole = Array.isArray(query.role) ? query.role[0] : query.role;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;

  return (
    <AuthLayout
      title="Choose your account type"
      subtitle={`Google verified ${user.email}. Profile details can be completed after sign-in.`}
    >
      <GoogleRoleForm
        defaultRole={requestedRole === "partner" ? "PARTNER" : "PLAYER"}
        next={safeInternalPath(requestedNext)}
      />
    </AuthLayout>
  );
}
