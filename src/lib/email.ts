import "server-only";

type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  idempotencyKey: string;
};

export function passwordResetEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()
  );
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  idempotencyKey,
}: PasswordResetEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Password-reset email delivery is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Bunal.club password",
      text: [
        "Someone requested a password reset for your Bunal.club account.",
        "",
        `Reset your password: ${resetUrl}`,
        "",
        "This link expires in 30 minutes and can only be used once.",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: `
        <div style="background:#f7faf8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#14202c">
          <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
            <p style="margin:0 0 8px;color:#16803c;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Bunal.club account</p>
            <h1 style="margin:0;color:#10243a;font-size:26px;line-height:1.25">Reset your password</h1>
            <p style="margin:16px 0 24px;color:#5b6470;font-size:15px;line-height:1.6">Someone requested a password reset for your Bunal.club account. Use the secure link below to choose a new password.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#16803c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:10px">Reset password</a>
            <p style="margin:24px 0 0;color:#8a929d;font-size:12px;line-height:1.6">This link expires in 30 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Password-reset email failed with status ${response.status}`);
  }
}
