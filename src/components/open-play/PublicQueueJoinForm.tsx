"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SKILL_LEVELS } from "@/lib/constants";
import { joinPublicQueueAction } from "@/lib/open-play-actions";

export function PublicQueueJoinForm({
  publicId,
  approvalRequired,
}: {
  publicId: string;
  approvalRequired: boolean;
}) {
  const [state, action, pending] = useActionState(joinPublicQueueAction, {});
  return (
    <form action={action} className="rounded-2xl bg-accent p-5 text-navy shadow-sm">
      <input type="hidden" name="publicId" value={publicId} />
      <p className="text-xs font-black uppercase tracking-[0.16em]">Quick Queue</p>
      <h2 className="mt-1 text-xl font-black">Join without an account</h2>
      <p className="mt-2 text-xs font-semibold leading-5 text-navy/70">
        {approvalRequired
          ? "Enter your name and skill. The organizer will approve and check you in."
          : "Enter your name and skill to join the waiting queue immediately."}
      </p>
      <label className="mt-4 block text-xs font-black">
        Player name
        <input name="displayName" required maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border-2 border-white bg-white px-3 text-sm font-semibold" />
      </label>
      <div className="mt-3"><Select name="skillLevel" label="Skill level" options={[...SKILL_LEVELS]} defaultValue="intermediate" /></div>
      <Button variant="navy" className="mt-4" disabled={pending}>{pending ? "Joining…" : approvalRequired ? "Request to join" : "Join queue"}</Button>
      {state.message || state.success ? <p role="status" className={`mt-3 text-xs font-black ${state.success ? "text-primary-hover" : "text-red-800"}`}>{state.success ?? state.message}</p> : null}
    </form>
  );
}
