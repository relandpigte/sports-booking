import { WEEKDAYS, type OperatingHours, type Weekday } from "@/lib/constants";

// "09:00" -> "9:00 AM", "00:00" -> "12:00 AM"
export function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t;
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${(mStr ?? "00").padStart(2, "0")} ${period}`;
}

const SHORT: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

// Collapses a weekly schedule into compact ranges, grouping consecutive days
// with identical hours. e.g. [{ label: "Mon–Sat", value: "6:00 AM – 12:00 AM" }, ...]
export function summarizeOperatingHours(
  hours: OperatingHours
): { label: string; value: string }[] {
  const days = WEEKDAYS.map(({ value }) => {
    const d = hours[value as Weekday];
    const v =
      !d || d.closed ? "Closed" : `${formatTime(d.open)} – ${formatTime(d.close)}`;
    return { key: value as Weekday, v };
  });

  const out: { label: string; value: string }[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1].v === days[i].v) j++;
    const label =
      i === j ? SHORT[days[i].key] : `${SHORT[days[i].key]}–${SHORT[days[j].key]}`;
    out.push({ label, value: days[i].v });
    i = j + 1;
  }
  return out;
}
