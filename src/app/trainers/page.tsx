import type { Metadata } from "next";

import { PageShell } from "@/components/PageShell";
import {
  TrainerDirectory,
  type TrainerDirectoryView,
} from "@/components/trainers/TrainerDirectory";
import { GAME_VALUES } from "@/lib/constants";
import { formatManilaDate, manilaToday } from "@/lib/time";
import { listPublicTrainers } from "@/lib/trainers";

export const metadata: Metadata = {
  title: "Find a Sports Trainer — Bunal.club",
  description: "Discover verified trainers, compare rates, and request a session on Bunal.club.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isSort(
  value: string
): value is "newest" | "name" | "rate-asc" | "rate-desc" {
  return ["newest", "name", "rate-asc", "rate-desc"].includes(value);
}

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = first(params.q).slice(0, 100);
  const sportValue = first(params.sport);
  const sport = GAME_VALUES.includes(sportValue as (typeof GAME_VALUES)[number])
    ? sportValue
    : undefined;
  const area = first(params.area).slice(0, 100);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(params.date))
    ? first(params.date)
    : undefined;
  const parsedRate = Number(first(params.maxRate));
  const maxRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : undefined;
  const sortValue = first(params.sort);
  const trainers = await listPublicTrainers({ sport, area, date, maxRate });
  const view: TrainerDirectoryView[] = trainers.map((trainer, order) => ({
    id: trainer.id,
    username: trainer.user.username!,
    name: trainer.user.playerName ?? trainer.user.name ?? "Bunal.club trainer",
    image: trainer.user.image,
    area: trainer.area ?? "Philippines",
    hourlyRate: Number(trainer.hourlyRate),
    bio: trainer.bio ?? "",
    sports: trainer.sports,
    specialties: trainer.specialties,
    order,
  }));
  const today = manilaToday();

  return (
    <PageShell maxWidth="max-w-7xl" backgroundClass="bg-[#f7faf8]">
      <TrainerDirectory
        trainers={view}
        today={today}
        availableDateLabel={date ? formatManilaDate(date) : null}
        initial={{
          query,
          sport: sport ?? "",
          area,
          date: date ?? "",
          maxRate: maxRate?.toString() ?? "",
          sort: isSort(sortValue) ? sortValue : "newest",
        }}
      />
    </PageShell>
  );
}
