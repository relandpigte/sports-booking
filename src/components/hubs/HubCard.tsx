import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { GAME_LABELS } from "@/lib/constants";
import type { Hub } from "@/lib/hubs";

export function HubCard({ hub }: { hub: Hub }) {
  return (
    <Link
      href={`/hubs/${hub.id}`}
      className="overflow-hidden rounded-2xl border border-gray-200 transition-colors hover:border-gray-300"
    >
      <div className="aspect-video bg-gray-100">
        {hub.coverPhotos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.coverPhotos[0]}
            alt={`${hub.name} cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            No cover photo
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar src={hub.logo} name={hub.name} size={40} />
          <h2 className="truncate font-semibold text-gray-900">{hub.name}</h2>
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
        {hub.courts.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {hub.courts.length} {hub.courts.length === 1 ? "court" : "courts"}
          </p>
        )}
      </div>
    </Link>
  );
}
