import { qrSvg } from "@/lib/qr";

export function PayMongoCheckout({
  checkoutUrl,
}: {
  checkoutUrl: string;
}) {
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
