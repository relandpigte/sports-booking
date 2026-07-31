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
          <h2 className="font-semibold text-gray-900">Scan to pay</h2>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Scan with another phone to open your secure PayMongo checkout, then
            choose QR Ph, GCash, Maya, or card.
          </p>
          <div
            className="mt-4 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white p-2"
            dangerouslySetInnerHTML={{
              __html: qrSvg(checkoutUrl, {
                title: "Scan to open the PayMongo booking checkout",
              }),
            }}
          />
        </div>
      </div>

      <a
        href={checkoutUrl}
        className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
      >
        Open secure PayMongo checkout
      </a>

      <p className="text-center text-xs text-gray-400">
        This QR and button open the same one-time checkout for this booking.
      </p>
    </div>
  );
}
