import type { Role } from "@prisma/client";

export const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];

export const DEFAULT_SKILL_LEVEL: SkillLevel = "intermediate";

// The User.role enum values.
export const ROLE_VALUES = ["ADMIN", "PLAYER", "PARTNER"] as const;

// Human-readable labels for the User.role enum (ADMIN | PLAYER | PARTNER).
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PLAYER: "Player",
  PARTNER: "Partner",
};

// Options for role <select> inputs.
export const ROLE_OPTIONS = ROLE_VALUES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

// Days of the week, used for hub operating hours.
export const WEEKDAYS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["value"];

export type DayHours = { closed: boolean; open: string; close: string };
export type OperatingHours = Record<Weekday, DayHours>;
