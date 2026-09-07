const LIVE_MATCH_PALETTES = [
  {
    team1Panel: "border-indigo-300 bg-indigo-50",
    team1Accent: "bg-indigo-700 text-white",
    team1Button: "bg-indigo-700 text-white hover:bg-indigo-800",
    team2Panel: "border-rose-300 bg-rose-50",
    team2Accent: "bg-rose-600 text-white",
    team2Button: "bg-rose-600 text-white hover:bg-rose-700",
  },
  {
    team1Panel: "border-violet-300 bg-violet-50",
    team1Accent: "bg-violet-700 text-white",
    team1Button: "bg-violet-700 text-white hover:bg-violet-800",
    team2Panel: "border-amber-300 bg-amber-50",
    team2Accent: "bg-amber-600 text-white",
    team2Button: "bg-amber-600 text-white hover:bg-amber-700",
  },
  {
    team1Panel: "border-blue-300 bg-blue-50",
    team1Accent: "bg-blue-700 text-white",
    team1Button: "bg-blue-700 text-white hover:bg-blue-800",
    team2Panel: "border-orange-300 bg-orange-50",
    team2Accent: "bg-orange-600 text-white",
    team2Button: "bg-orange-600 text-white hover:bg-orange-700",
  },
  {
    team1Panel: "border-emerald-300 bg-emerald-50",
    team1Accent: "bg-emerald-700 text-white",
    team1Button: "bg-emerald-700 text-white hover:bg-emerald-800",
    team2Panel: "border-fuchsia-300 bg-fuchsia-50",
    team2Accent: "bg-fuchsia-700 text-white",
    team2Button: "bg-fuchsia-700 text-white hover:bg-fuchsia-800",
  },
  {
    team1Panel: "border-cyan-300 bg-cyan-50",
    team1Accent: "bg-cyan-700 text-white",
    team1Button: "bg-cyan-700 text-white hover:bg-cyan-800",
    team2Panel: "border-pink-300 bg-pink-50",
    team2Accent: "bg-pink-700 text-white",
    team2Button: "bg-pink-700 text-white hover:bg-pink-800",
  },
  {
    team1Panel: "border-purple-300 bg-purple-50",
    team1Accent: "bg-purple-700 text-white",
    team1Button: "bg-purple-700 text-white hover:bg-purple-800",
    team2Panel: "border-teal-300 bg-teal-50",
    team2Accent: "bg-teal-700 text-white",
    team2Button: "bg-teal-700 text-white hover:bg-teal-800",
  },
] as const;

export function liveMatchPalette(gameId: string) {
  let hash = 0;
  for (const character of gameId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return LIVE_MATCH_PALETTES[hash % LIVE_MATCH_PALETTES.length];
}

export function openPlayThreeColumnGridClass(itemCount: number) {
  if (itemCount <= 1) return "md:grid-cols-1";
  if (itemCount === 2) return "md:grid-cols-2";
  return "md:grid-cols-3";
}
