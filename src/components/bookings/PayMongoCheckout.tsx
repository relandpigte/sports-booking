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
  if (qrImageUrl && checkoutUrl) {
    return (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
          <div className="border-b border-sky-100 bg-sky-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
                <TestModeIcon />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
                  PayMongo test mode
                </p>
                <h2 className="mt-0.5 font-bold text-navy">
                  Complete a simulated payment
                </h2>
              </div>
            </div>
          </div>

          <div className="px-5 py-5">
            <p className="text-sm leading-6 text-navy/70">
              No real money will move. PayMongo will open its test page where
              you can choose the payment result, then this booking will update
              automatically.
            </p>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Complete test payment
              <ExternalLinkIcon />
            </a>
            <p className="mt-3 text-center text-xs font-medium text-sky-700">
              Keep this page open while completing the PayMongo test.
            </p>
          </div>
        </div>

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-semibold leading-5 text-amber-800">
          Do not scan the QR code in test mode. PayMongo recommends using its
          test page because scanning may initiate a real transfer.
        </p>
      </div>
    );
  }

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

            <div className="mt-3 max-w-sm rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-left">
              <p className="flex items-center gap-2 text-xs font-bold text-primary">
                <QrIcon />
                Paying on this device?
              </p>
              <p className="mt-1.5 text-xs leading-5 text-navy/70">
                Download the QR code and import it into your bank or e-wallet
                app. If downloading fails, take a screenshot and select it from
                your gallery instead.
              </p>
            </div>
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

function QrIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h1M17 14v3h-3" />
    </svg>
  );
}

function TestModeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h6M10 9l-4.5 8a2 2 0 0 0 1.75 3h9.5a2 2 0 0 0 1.75-3L14 9V3" />
      <path d="M8.5 15h7" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
