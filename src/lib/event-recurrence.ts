import { addDays, isValidDateString } from "@/lib/time";

export const MAX_WEEKLY_EVENT_OCCURRENCES = 26;

export function weeklyEventDates(
  startsOn: string,
  endsOn: string
): string[] | null {
  if (!isValidDateString(startsOn) || !isValidDateString(endsOn)) return null;
  if (endsOn < addDays(startsOn, 7)) return null;

  const dates: string[] = [];
  for (
    let date = startsOn;
    date <= endsOn && dates.length <= MAX_WEEKLY_EVENT_OCCURRENCES;
    date = addDays(date, 7)
  ) {
    dates.push(date);
  }

  if (dates.length < 2 || dates.length > MAX_WEEKLY_EVENT_OCCURRENCES) {
    return null;
  }
  return dates;
}
