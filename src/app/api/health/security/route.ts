import { appOrigin } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET() {
  const missing: string[] = [];
  if (!process.env.AUTH_SECRET?.trim() && !process.env.NEXTAUTH_SECRET?.trim()) {
    missing.push("AUTH_SECRET");
  }
  if (!process.env.ENCRYPTION_KEY?.trim()) missing.push("ENCRYPTION_KEY");
  if (!process.env.BOOKING_SWEEP_SECRET?.trim()) {
    missing.push("BOOKING_SWEEP_SECRET");
  }
  if (!process.env.CRON_SECRET?.trim()) missing.push("CRON_SECRET");
  try {
    appOrigin();
  } catch {
    missing.push("APP_URL");
  }

  if (missing.length > 0) {
    console.error("SECURITY_HEALTH_NOT_READY", { missing });
    return Response.json(
      { ok: false, status: "security configuration incomplete" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
