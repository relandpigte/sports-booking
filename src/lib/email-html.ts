export type TransactionalEmailDetail = { label: string; value: string };

// An itemised statement. Amounts arrive already formatted so the HTML and
// plain-text parts can never disagree about a figure.
export type TransactionalEmailLineItems = {
  heading: string;
  rows: Array<{ title: string; detail?: string | null; amount: string }>;
  totalLabel: string;
  totalAmount: string;
};

export type TransactionalEmailOptions = {
  preheader: string;
  eyebrow: string;
  heading: string;
  recipientName?: string;
  paragraphs: string[];
  // Optional label/value facts shown under the paragraphs.
  details?: TransactionalEmailDetail[];
  lineItems?: TransactionalEmailLineItems;
  actionLabel: string;
  actionUrl: string;
  note: string;
};

export type TransactionalEmailContentOptions = TransactionalEmailOptions & {
  subject: string;
};

export type TransactionalEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function transactionalEmailText({
  subject,
  recipientName,
  paragraphs,
  details,
  lineItems,
  actionLabel,
  actionUrl,
  note,
}: TransactionalEmailContentOptions): string {
  const sections = [
    subject,
    recipientName ? `Hi ${recipientName},` : null,
    ...paragraphs,
    details?.length
      ? details.map((row) => `${row.label}: ${row.value}`).join("\n")
      : null,
    lineItems
      ? [
          lineItems.heading,
          ...lineItems.rows.map(
            (row) =>
              `- ${row.title}${row.detail ? ` (${row.detail})` : ""}: ${row.amount}`
          ),
          `${lineItems.totalLabel}: ${lineItems.totalAmount}`,
        ].join("\n")
      : null,
    `${actionLabel}: ${actionUrl}`,
    note,
    "Bunal.club — Play · Compete · Connect",
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}

export function transactionalEmailContent(
  options: TransactionalEmailContentOptions
): TransactionalEmailContent {
  return {
    subject: options.subject,
    html: transactionalEmailHtml(options),
    text: transactionalEmailText(options),
  };
}

export function transactionalEmailHtml({
  preheader,
  eyebrow,
  heading,
  recipientName,
  paragraphs,
  details,
  lineItems,
  actionLabel,
  actionUrl,
  note,
}: TransactionalEmailOptions): string {
  const homeUrl = new URL("/", actionUrl).toString();
  const logoUrl = new URL("/bunal-logo-v2-wordmark.png", actionUrl).toString();
  const privacyUrl = new URL("/privacy", actionUrl).toString();
  const safeActionUrl = escapeEmailHtml(actionUrl);
  const greeting = recipientName
    ? `<p style="margin:24px 0 0;color:#14202c;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.5;">Hi ${escapeEmailHtml(recipientName)},</p>`
    : "";
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:14px 0 0;color:#52606d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;">${escapeEmailHtml(paragraph)}</p>`
    )
    .join("");
  const detailTable = details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-collapse:collapse;border-top:1px solid #dfe7e2;">${details
        .map(
          (row) =>
            `<tr><td valign="top" style="width:42%;padding:10px 12px 10px 0;border-bottom:1px solid #dfe7e2;color:#7a8591;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">${escapeEmailHtml(row.label)}</td><td valign="top" style="padding:10px 0;border-bottom:1px solid #dfe7e2;color:#10243a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.5;word-break:break-word;">${escapeEmailHtml(row.value)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const lineItemTable = lineItems
    ? `<p style="margin:28px 0 0;color:#10243a;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;line-height:1.4;">${escapeEmailHtml(lineItems.heading)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:8px;border-collapse:collapse;">${lineItems.rows
        .map(
          (row) =>
            `<tr><td valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid #dfe7e2;font-family:Arial,Helvetica,sans-serif;"><span style="display:block;color:#14202c;font-size:14px;font-weight:700;line-height:1.45;">${escapeEmailHtml(row.title)}</span>${
              row.detail
                ? `<span style="display:block;margin-top:2px;color:#7a8591;font-size:12px;line-height:1.5;">${escapeEmailHtml(row.detail)}</span>`
                : ""
            }</td><td valign="top" align="right" style="padding:10px 0;border-bottom:1px solid #dfe7e2;color:#14202c;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.45;white-space:nowrap;">${escapeEmailHtml(row.amount)}</td></tr>`
        )
        .join("")}<tr><td valign="top" style="padding:12px 12px 0 0;color:#10243a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:1.45;">${escapeEmailHtml(lineItems.totalLabel)}</td><td valign="top" align="right" style="padding:12px 0 0;color:#16803c;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800;line-height:1.3;white-space:nowrap;">${escapeEmailHtml(lineItems.totalAmount)}</td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeEmailHtml(heading)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-header { padding: 20px 24px !important; }
        .email-content { padding: 28px 22px !important; }
        .email-footer { padding: 22px !important; }
        .email-button-cell { width: 100% !important; }
        .email-button { display: block !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f7faf8;color:#14202c;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;mso-hide:all;">${escapeEmailHtml(preheader)}&#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7faf8" style="width:100%;border-collapse:collapse;background:#f7faf8;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td align="center" bgcolor="#10243a" class="email-header" style="padding:24px 32px;border-radius:16px 16px 0 0;background:#10243a;">
                <a href="${escapeEmailHtml(homeUrl)}" target="_blank" style="display:inline-block;text-decoration:none;">
                  <img src="${escapeEmailHtml(logoUrl)}" width="132" alt="Bunal.club" style="display:block;width:132px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">
                </a>
              </td>
            </tr>
            <tr>
              <td height="4" bgcolor="#a3ce3c" style="height:4px;font-size:0;line-height:0;background:#a3ce3c;">&nbsp;</td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-content" style="padding:38px 42px;border-right:1px solid #dfe7e2;border-left:1px solid #dfe7e2;background:#ffffff;">
                <p style="margin:0 0 10px;color:#16803c;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.8px;line-height:1.4;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</p>
                <h1 style="margin:0;color:#10243a;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">${escapeEmailHtml(heading)}</h1>
                ${greeting}
                ${body}
                ${detailTable}
                ${lineItemTable}
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="#16803c" class="email-button-cell" style="border-radius:10px;background:#16803c;">
                      <a href="${safeActionUrl}" target="_blank" class="email-button" style="display:inline-block;padding:14px 24px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;border:1px solid #16803c;border-radius:10px;">${escapeEmailHtml(actionLabel)}</a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:28px;border-collapse:collapse;">
                  <tr>
                    <td style="padding-top:20px;border-top:1px solid #dfe7e2;">
                      <p style="margin:0;color:#7a8591;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">Button not working? Copy and paste this link into your browser:</p>
                      <p style="margin:5px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${safeActionUrl}" target="_blank" style="color:#16803c;text-decoration:underline;">${safeActionUrl}</a></p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;border-collapse:separate;">
                  <tr>
                    <td bgcolor="#e9f5ec" style="padding:16px 18px;border:1px solid #cfe8d5;border-radius:12px;background:#e9f5ec;">
                      <p style="margin:0;color:#53645a;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">${escapeEmailHtml(note)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="#10243a" class="email-footer" style="padding:22px 32px;border-radius:0 0 16px 16px;background:#10243a;">
                <p style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.6px;line-height:1.5;text-transform:uppercase;">Play <span style="color:#a3ce3c;">·</span> Compete <span style="color:#a3ce3c;">·</span> Connect</p>
                <p style="margin:8px 0 0;color:#aeb9c3;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;">Transactional email from <a href="${escapeEmailHtml(homeUrl)}" target="_blank" style="color:#ffffff;text-decoration:underline;">Bunal.club</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escapeEmailHtml(privacyUrl)}" target="_blank" style="color:#ffffff;text-decoration:underline;">Privacy</a><br>Philippines</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
