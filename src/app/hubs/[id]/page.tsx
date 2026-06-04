import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTopBar } from "@/components/hubs/PublicTopBar";
import { Avatar } from "@/components/ui/Avatar";
import { getPublicHub } from "@/lib/hubs";
import { WEEKDAYS, GAME_LABELS, type Weekday } from "@/lib/constants";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hub = await getPublicHub(id);
  return {
    title: hub ? `${hub.name} — Sports 360` : "Hub — Sports 360",
    description: hub?.about ?? undefined,
  };
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t;
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${(mStr ?? "00").padStart(2, "0")} ${period}`;
}

export default async function PublicHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hub = await getPublicHub(id);

  if (!hub) {
    notFound();
  }

  const [cover, ...moreCovers] = hub.coverPhotos;
  const hours = hub.operatingHours;

  return (
    <div className="min-h-screen bg-white">
      <PublicTopBar />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        {/* Cover */}
        <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-gray-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${hub.name} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
              No cover photo
            </div>
          )}
        </div>

        {moreCovers.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {moreCovers.map((src, i) => (
              <div
                key={i}
                className="aspect-video overflow-hidden rounded-lg bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${hub.name} photo ${i + 2}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Header: logo + name */}
        <div className="mt-6 flex items-center gap-4">
          <Avatar src={hub.logo} name={hub.name} size={64} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{hub.name}</h1>
            {hub.games.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {hub.games.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {GAME_LABELS[g] ?? g}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sports 360 hub</p>
            )}
          </div>
        </div>

        {/* About */}
        {hub.about && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-gray-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {hub.about}
            </p>
          </section>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {/* Contact */}
          <section>
            <h2 className="text-base font-semibold text-gray-900">Contact</h2>
            <dl className="mt-2 flex flex-col gap-2 text-sm">
              {hub.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Phone</span>
                  <a
                    href={`tel:${hub.phone}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {hub.phone}
                  </a>
                </div>
              )}
              {hub.email && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Email</span>
                  <a
                    href={`mailto:${hub.email}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {hub.email}
                  </a>
                </div>
              )}
              {!hub.phone && !hub.email && (
                <p className="text-gray-400">No contact info provided.</p>
              )}
            </dl>
          </section>

          {/* Operating hours */}
          <section>
            <h2 className="text-base font-semibold text-gray-900">
              Operating Hours
            </h2>
            {hours ? (
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                {WEEKDAYS.map(({ value, label }) => {
                  const day = hours[value as Weekday];
                  return (
                    <div
                      key={value}
                      className="flex items-center justify-between"
                    >
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium text-gray-900">
                        {!day || day.closed
                          ? "Closed"
                          : `${formatTime(day.open)} – ${formatTime(day.close)}`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Hours not set.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
