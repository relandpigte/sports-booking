function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function passwordResetEmailHtml(resetUrl: string): string {
  const safeResetUrl = escapeHtml(resetUrl);

  return `
    <div style="background:#f7faf8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#14202c">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
        <p style="margin:0 0 8px;color:#16803c;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Bunal.club account</p>
        <h1 style="margin:0;color:#10243a;font-size:26px;line-height:1.25">Reset your password</h1>
        <p style="margin:16px 0 24px;color:#5b6470;font-size:15px;line-height:1.6">Someone requested a password reset for your Bunal.club account. Use the secure link below to choose a new password.</p>
        <a href="${safeResetUrl}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:10px">Reset password</a>
        <p style="margin:24px 0 0;color:#8a929d;font-size:12px;line-height:1.6">This link expires in 30 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>
  `;
}
