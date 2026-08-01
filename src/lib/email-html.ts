type TransactionalEmailOptions = {
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  note: string;
};

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function transactionalEmailHtml({
  eyebrow,
  heading,
  paragraphs,
  actionLabel,
  actionUrl,
  note,
}: TransactionalEmailOptions): string {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:16px 0 0;color:#5b6470;font-size:15px;line-height:1.6">${escapeEmailHtml(paragraph)}</p>`
    )
    .join("");

  return `
    <div style="background:#f7faf8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#14202c">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
        <p style="margin:0 0 8px;color:#16803c;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">${escapeEmailHtml(eyebrow)}</p>
        <h1 style="margin:0;color:#10243a;font-size:26px;line-height:1.25">${escapeEmailHtml(heading)}</h1>
        ${body}
        <a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;margin-top:24px;background:#16803c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:10px">${escapeEmailHtml(actionLabel)}</a>
        <p style="margin:24px 0 0;color:#8a929d;font-size:12px;line-height:1.6">${escapeEmailHtml(note)}</p>
      </div>
    </div>
  `;
}
