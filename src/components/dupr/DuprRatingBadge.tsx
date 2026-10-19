import { formatDuprRating, type DuprRatingView } from "@/lib/dupr-shared";

// A compact DUPR rating pill: the doubles rating by default, since open play
// and most events are doubles. "Provisional" marks a rating DUPR does not
// yet consider reliable.
export function DuprRatingBadge({
  rating,
  format = "doubles",
  className = "",
}: {
  rating: Pick<
    DuprRatingView,
    "doubles" | "singles" | "doublesReliable" | "singlesReliable"
  > | null | undefined;
  format?: "doubles" | "singles";
  className?: string;
}) {
  if (!rating) return null;
  const value = format === "doubles" ? rating.doubles : rating.singles;
  if (value == null) return null;
  const reliable =
    format === "doubles" ? rating.doublesReliable : rating.singlesReliable;

  return (
    <span
      title={`DUPR ${format} rating${reliable ? "" : " (provisional)"}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy ${className}`}
    >
      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-navy/60">
        DUPR
      </span>
      {formatDuprRating(value)}
      {!reliable && <span className="font-semibold text-navy/50">·P</span>}
    </span>
  );
}
