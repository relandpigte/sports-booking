"use client";

import Image from "next/image";
import { useState } from "react";

import { Modal } from "@/components/ui/Modal";

type Destination = {
  id: "gcash" | "bdo";
  name: string;
  accountName: string;
  accountNumber: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  previewPosition: string;
};

const destinations: Destination[] = [
  {
    id: "gcash",
    name: "GCash",
    accountName: "Reland Pigte",
    accountNumber: "09177711902",
    imageSrc: "/payments/service-fee-owner-gcash.jpg",
    imageWidth: 1080,
    imageHeight: 1920,
    previewPosition: "center 38%",
  },
  {
    id: "bdo",
    name: "BDO",
    accountName: "Reland Pigte",
    accountNumber: "002956001090",
    imageSrc: "/payments/service-fee-owner-bdo.jpg",
    imageWidth: 1144,
    imageHeight: 1688,
    previewPosition: "center 51%",
  },
];

export function ServiceFeeManualDestinations({
  amount,
  qrPhAvailable,
}: {
  amount: string;
  qrPhAvailable: boolean;
}) {
  const [copiedId, setCopiedId] = useState<Destination["id"] | null>(null);
  const [openDestination, setOpenDestination] =
    useState<Destination | null>(null);

  async function copyAccount(destination: Destination) {
    try {
      await navigator.clipboard.writeText(destination.accountNumber);
      setCopiedId(destination.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === destination.id ? null : current));
      }, 1600);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <section
      aria-labelledby="manual-settlement-heading"
      className="border-t border-slate-100 pt-5"
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {qrPhAvailable ? "2 · Manual fallback" : "1 · Manual settlement"}
        </p>
        <h3
          id="manual-settlement-heading"
          className="mt-1 text-base font-semibold text-navy"
        >
          {qrPhAvailable ? "Can’t use QR Ph?" : "Pay by manual transfer"}
        </h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          Transfer the exact {amount} due to the Bunal.club owner using either
          destination below. Keep your receipt so the payment can be reviewed.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {destinations.map((destination) => {
          const isGcash = destination.id === "gcash";
          const copied = copiedId === destination.id;

          return (
            <article
              key={destination.id}
              className={`grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-4 rounded-2xl border p-4 ${
                isGcash
                  ? "border-sky-200 bg-sky-50/60"
                  : "border-amber-200 bg-amber-50/60"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenDestination(destination)}
                aria-label={`View larger ${destination.name} QR code`}
                className={`group relative h-28 w-28 overflow-hidden rounded-xl border bg-white shadow-sm outline-none transition focus:ring-2 focus:ring-primary/40 ${
                  isGcash ? "border-sky-200" : "border-amber-200"
                }`}
              >
                <Image
                  src={destination.imageSrc}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-cover transition-transform group-hover:scale-[1.03]"
                  style={{ objectPosition: destination.previewPosition }}
                />
                <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-navy/85 px-1.5 py-1 text-[10px] font-semibold text-white">
                  View QR
                </span>
              </button>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      isGcash
                        ? "bg-sky-100 text-sky-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {destination.name}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Owner account
                  </span>
                </div>
                <p className="mt-3 text-sm font-bold text-navy">
                  {destination.accountName}
                </p>
                <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-navy">
                  {destination.accountNumber}
                </p>
                <button
                  type="button"
                  onClick={() => copyAccount(destination)}
                  className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    isGcash
                      ? "border-sky-200 text-sky-700 hover:bg-sky-50"
                      : "border-amber-200 text-amber-800 hover:bg-amber-50"
                  }`}
                >
                  <CopyIcon />
                  <span aria-live="polite">
                    {copied ? "Number copied" : "Copy number"}
                  </span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={Boolean(openDestination)}
        onClose={() => setOpenDestination(null)}
        title={`${openDestination?.name ?? "Payment"} QR code`}
      >
        {openDestination && (
          <div>
            <p>
              {openDestination.accountName} · {openDestination.accountNumber}
            </p>
            <Image
              src={openDestination.imageSrc}
              alt={`${openDestination.name} QR code for ${openDestination.accountName}`}
              width={openDestination.imageWidth}
              height={openDestination.imageHeight}
              sizes="(min-width: 640px) 400px, calc(100vw - 80px)"
              className="mt-4 max-h-[65dvh] w-full rounded-xl border border-slate-200 bg-white object-contain"
            />
          </div>
        )}
      </Modal>
    </section>
  );
}

function CopyIcon() {
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
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}
