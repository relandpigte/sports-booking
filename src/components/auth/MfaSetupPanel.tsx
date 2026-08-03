import { MfaSetupForm } from "@/components/auth/MfaSetupForm";
import { authenticatorUri } from "@/lib/totp";
import { qrSvg } from "@/lib/qr";

export function MfaSetupPanel({
  email,
  secret,
  accountSetup,
}: {
  email: string;
  secret: string;
  accountSetup: boolean;
}) {
  const uri = authenticatorUri({ secret, email });
  const svg = qrSvg(uri, { title: "Authenticator setup QR code" });

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
        <div
          className="mx-auto w-full max-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white p-3"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div>
          <ol className="space-y-2 text-sm leading-6 text-gray-600">
            <li>1. Open your authenticator app.</li>
            <li>2. Scan this QR code or enter the setup key manually.</li>
            <li>3. Enter the generated 6-digit code below.</li>
          </ol>
          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Manual setup key</p>
            <code className="mt-1 block break-all font-mono text-sm text-navy">
              {secret}
            </code>
          </div>
        </div>
      </div>
      <MfaSetupForm accountSetup={accountSetup} />
    </div>
  );
}

