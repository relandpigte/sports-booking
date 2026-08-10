import { setPartnerActiveAction } from "@/lib/admin-actions";
import type { PartnerStatus } from "@prisma/client";

export function PartnerActivationButton({
  userId,
  status,
}: {
  userId: string;
  status: PartnerStatus | null;
}) {
  const active = status === "ACTIVE";
  const disabled = status === "DRAFT";
  const deactivated = status === "DEACTIVATED";
  return (
    <form action={setPartnerActiveAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "The partner must submit venue details first" : undefined}
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          disabled
            ? "cursor-not-allowed bg-gray-100 text-gray-400"
            : active
            ? "text-amber-700 hover:bg-amber-50"
            : "bg-primary-soft text-primary hover:bg-primary/15"
        }`}
      >
        {disabled
          ? "Incomplete"
          : active
            ? "Deactivate"
            : deactivated
              ? "Reactivate"
              : "Activate"}
      </button>
    </form>
  );
}
