const LIVE_MATCH_PALETTES = [
  "border-fuchsia-300 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700",
  "border-cyan-300 bg-gradient-to-br from-cyan-600 via-blue-600 to-violet-700",
  "border-emerald-300 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700",
  "border-amber-300 bg-gradient-to-br from-amber-700 via-orange-700 to-rose-800",
  "border-pink-300 bg-gradient-to-br from-pink-600 via-rose-600 to-orange-600",
  "border-lime-300 bg-gradient-to-br from-lime-700 via-emerald-700 to-teal-800",
] as const;

export function liveMatchPalette(gameId: string): string {
  let hash = 0;
  for (const character of gameId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return LIVE_MATCH_PALETTES[hash % LIVE_MATCH_PALETTES.length];
}
