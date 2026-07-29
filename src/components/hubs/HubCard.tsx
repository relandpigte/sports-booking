import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { GAME_LABELS } from "@/lib/constants";
import type { Hub } from "@/lib/hubs";

export function HubCard({ hub }: { hub: Hub }) {
  return (
    <Link
      href={`/hubs/${hub.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-navy/5"
    >
      <div className="relative aspect-video overflow-hidden bg-navy-soft">
        {hub.coverPhotos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.coverPhotos[0]}
            alt={`${hub.name} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            No cover photo
          </div>
        )}
        {hub.courts.length > 0 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-navy/85 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {hub.courts.length} {hub.courts.length === 1 ? "court" : "courts"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-3">
          <Avatar src={hub.logo} name={hub.name} size={40} />
          <h2 className="truncate font-semibold text-navy">{hub.name}</h2>
        </div>

        {hub.games.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hub.games.map((g) => (
              <span
                key={g}
                className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
              >
                {GAME_LABELS[g] ?? g}
              </span>
            ))}
          </div>
        )}

        {hub.address && (
          <p className="mt-3 truncate text-xs text-gray-400">{hub.address}</p>
        )}
      </div>
    </Link>
  );
}
