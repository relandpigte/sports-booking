import * as z from "zod";

// The name shown for an account on rosters, bookings, and BunalQ. Every
// account needs one, so a player never appears as a generic "Player".
export const FullNameSchema = z
  .string()
  .trim()
  .min(2, { error: "Enter your full name" })
  .max(80, { error: "Name must be 80 characters or fewer" });

// True when the account has something other people can recognize it by.
// Display code prefers the player name, then the full name.
export function hasAccountName(user: {
  name: string | null;
  playerName: string | null;
}): boolean {
  return Boolean(user.playerName?.trim() || user.name?.trim());
}
