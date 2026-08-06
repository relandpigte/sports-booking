import { qrSvg } from "@/lib/qr";
import { HoldCountdown } from "@/components/bookings/HoldCountdown";

export function PayMongoCheckout({
  qrImageUrl,
  checkoutUrl,
  expiresAt,
  initialSeconds,
}: {
  qrImageUrl?: string | null;
  checkoutUrl?: string | null;
  expiresAt?: string;
  initialSeconds?: number;
}) {
  if (qrImageUrl) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
          <div className="flex flex-col items-center text-center">
            <h2 className="font-bold text-navy">Scan QR Ph code to pay</h2>
            <p className="mt-1 text-xs text-gray-500">
              Use any participating QR Ph bank or e-wallet app.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[10px] font-bold text-gray-500">
              {["GCash", "Maya", "BPI", "GoTyme"].map((app) => (
                <span
                  key={app}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1"
                >
                  {app}
                </span>
              ))}
            </div>

            <div className="relative mt-6">
              {expiresAt && initialSeconds != null && (
                <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap">
                  <HoldCountdown
                    expiresAt={expiresAt}
                    initialSeconds={initialSeconds}
                    tone="qr"
                    label="QR expires"
                  />
                </div>
              )}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                {/* PayMongo returns the signed QR as a Base64 data image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt="PayMongo QR Ph code for this booking"
                  className="h-56 w-56 object-contain sm:h-60 sm:w-60"
                />
              </div>
            </div>

            <a
              href={qrImageUrl}
              download="bunal-qrph-payment.png"
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <DownloadIcon />
              Download QR code
            </a>
          </div>
        </div>

        <p className="rounded-xl bg-primary-soft px-3 py-3 text-center text-xs font-medium leading-5 text-primary">
          Confirmation happens automatically after your bank processes the
          payment. Keep this page open.
        </p>
        <p className="text-center text-xs text-gray-400">
          This QR expires with your booking hold and can only be paid once.
        </p>
      </div>
    );
  }

  if (!checkoutUrl) return null;

  // Existing holds created before the direct QR rollout can finish through
  // their original hosted Checkout Session.
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col items-center text-center">
          <h2 className="font-semibold text-gray-900">
            Scan to open QR Ph checkout
          </h2>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Scan with another device to open this booking&apos;s secure,
            one-time PayMongo checkout and pay with a participating QR Ph app.
          </p>
          <div
            className="mt-4 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white p-2"
            dangerouslySetInnerHTML={{
              __html: qrSvg(checkoutUrl, {
                title: "Scan to open the QR Ph checkout",
              }),
            }}
          />
        </div>
      </div>

      <a
        href={checkoutUrl}
        className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
      >
        Continue on this device
      </a>

      <p className="text-center text-xs text-gray-400">
        This code opens the checkout; PayMongo displays the payment QR securely.
      </p>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
