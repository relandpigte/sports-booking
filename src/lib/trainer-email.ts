import "server-only";

export type TrainerLifecycleEmailInput = {
  recipientName: string;
  subject: string;
  heading: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function trainerLifecycleEmailContent(input: TrainerLifecycleEmailInput) {
  const name = escapeHtml(input.recipientName);
  const heading = escapeHtml(input.heading);
  const message = escapeHtml(input.message);
  const actionUrl = escapeHtml(input.actionUrl);
  const actionLabel = escapeHtml(input.actionLabel);
  return {
    subject: input.subject,
    text: [`Hi ${input.recipientName},`, "", input.message, "", `${input.actionLabel}: ${input.actionUrl}`].join("\n"),
    html: `<!doctype html><html><body style="margin:0;background:#f7faf8;font-family:Arial,sans-serif;color:#14202c"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dfe7e2;border-radius:16px;padding:28px"><p style="margin:0 0 16px;color:#64748b">Hi ${name},</p><h1 style="margin:0 0 12px;font-size:24px;color:#10243a">${heading}</h1><p style="margin:0 0 24px;line-height:1.6;color:#475569">${message}</p><a href="${actionUrl}" style="display:inline-block;border-radius:10px;background:#16803c;padding:12px 18px;color:#fff;text-decoration:none;font-weight:700">${actionLabel}</a></div></div></body></html>`,
  };
}
