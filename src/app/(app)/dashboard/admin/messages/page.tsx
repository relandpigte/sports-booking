import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import {
  liftMessageRestrictionAction,
  reviewMessageReportAction,
} from "@/lib/messages-admin-actions";
import {
  listMessageReports,
  listRestrictedMessageUsers,
} from "@/lib/messages-admin";

export const metadata: Metadata = { title: "Message reports — Bunal.club" };

type ReportFilter = "OPEN" | "RESOLVED" | "DISMISSED";

export default async function MessageReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const value = (await searchParams).status;
  const requested = Array.isArray(value) ? value[0] : value;
  const status: ReportFilter =
    requested === "RESOLVED" || requested === "DISMISSED" ? requested : "OPEN";
  const [reports, restrictedUsers] = await Promise.all([
    listMessageReports(status),
    listRestrictedMessageUsers(),
  ]);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Safety"
        title="Message reports"
        description="Review only content members have reported. Private conversations are not otherwise browsable."
      />
      <nav className="mt-6 flex gap-2" aria-label="Report status">
        {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((item) => (
          <Link
            key={item}
            href={`/dashboard/admin/messages${item === "OPEN" ? "" : `?status=${item}`}`}
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              status === item ? "bg-navy text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"
            }`}
          >
            {item[0] + item.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>

      {restrictedUsers.length > 0 && (
        <details className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold text-amber-950">
            {restrictedUsers.length} messaging restriction{restrictedUsers.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 divide-y divide-amber-200/70">
            {restrictedUsers.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-amber-950">{user.playerName ?? user.name ?? user.email}</p>
                  <p className="text-xs text-amber-800">{user.chatRestrictionReason ?? "No reason recorded"}</p>
                </div>
                <form action={liftMessageRestrictionAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-900 shadow-sm">Lift restriction</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-5 space-y-4">
        {reports.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">No {status.toLowerCase()} reports.</div>
        )}
        {reports.map((report) => {
          const sender = report.message.sender;
          const reporter = report.reporter;
          const room = report.message.conversation.event?.title ?? report.message.conversation.hub?.name ?? "Conversation";
          return (
            <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">{report.category}</p>
                  <h2 className="mt-1 font-bold text-navy">{room}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Reported by {reporter?.playerName ?? reporter?.name ?? reporter?.email ?? "Deleted account"}
                    {sender ? ` · Sent by ${sender.playerName ?? sender.name ?? sender.email}` : " · Sender deleted"}
                  </p>
                </div>
                <time className="text-xs text-slate-400">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(report.createdAt)}</time>
              </div>
              <blockquote className="mt-4 rounded-xl border-l-4 border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {report.evidenceBody ?? "Message content was unavailable."}
              </blockquote>
              {report.details && <p className="mt-3 text-sm text-slate-600"><span className="font-semibold">Reporter’s note:</span> {report.details}</p>}

              {status === "OPEN" ? (
                <form action={reviewMessageReportAction} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="reportId" value={report.id} />
                  <div>
                    <label htmlFor={`resolution-${report.id}`} className="text-xs font-bold text-navy">Resolution note</label>
                    <textarea id={`resolution-${report.id}`} name="resolution" required maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                      <label className="flex items-center gap-2"><input type="checkbox" name="removeMessage" /> Remove message</label>
                      {sender && <label className="flex items-center gap-2"><input type="checkbox" name="restrictSender" /> Restrict sender</label>}
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button name="decision" value="DISMISSED" className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Dismiss</button>
                    <button name="decision" value="RESOLVED" className="rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white">Resolve</button>
                  </div>
                </form>
              ) : (
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600"><span className="font-semibold">Resolution:</span> {report.resolution ?? "No note recorded."}</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
