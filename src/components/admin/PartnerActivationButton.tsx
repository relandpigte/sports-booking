import { setPartnerActiveAction } from "@/lib/admin-actions";

export function PartnerActivationButton({
  userId,
  active,
}: {
  userId: string;
  active: boolean;
}) {
  return (
    <form action={setPartnerActiveAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          active
            ? "text-amber-700 hover:bg-amber-50"
            : "bg-primary-soft text-primary hover:bg-primary/15"
        }`}
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}
