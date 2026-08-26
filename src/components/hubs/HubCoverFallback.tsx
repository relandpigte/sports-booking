export function HubCoverFallback({
  hubName,
  sport,
  showPhotoLabel = true,
  className = "",
}: {
  hubName: string;
  sport?: string | null;
  showPhotoLabel?: boolean;
  className?: string;
}) {
  const sportLabel = fallbackSportLabel(sport);

  return (
    <div
      role="img"
      aria-label={`${hubName} has no cover photo`}
      className={`relative isolate flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-navy via-navy-hover to-ocean ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute -left-[12%] -top-[35%] h-[110%] w-[55%] rounded-full bg-primary/20 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-[45%] -right-[5%] h-[110%] w-[55%] rounded-full bg-accent/20 blur-3xl"
      />
      {showPhotoLabel && (
        <span className="absolute left-3 top-3 z-20 rounded-full border border-white/15 bg-navy/75 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          Photo coming soon
        </span>
      )}
      <CourtBlueprint sport={sport} />
      <span className="absolute bottom-3 right-3 z-20 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-navy shadow-sm backdrop-blur-sm">
        {sportLabel}
      </span>
    </div>
  );
}

function CourtBlueprint({ sport }: { sport?: string | null }) {
  const isRacquetSport = ["pickleball", "tennis", "badminton"].includes(
    sport ?? ""
  );
  const isBadminton = sport === "badminton";
  const isVolleyball = sport === "volleyball";

  return (
    <svg
      viewBox="0 0 520 320"
      fill="none"
      aria-hidden="true"
      className="absolute inset-0 z-10 h-full w-full p-8 drop-shadow-[0_8px_22px_rgba(3,11,32,0.2)]"
    >
      <rect
        x="58"
        y="32"
        width="404"
        height="256"
        rx="10"
        stroke="rgba(255,255,255,0.72)"
        strokeWidth="3"
      />
      <path
        d="M260 32v256M58 160h404"
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="2"
      />
      {isRacquetSport && (
        <>
          <path
            d="M126 32v256M394 32v256"
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="2"
          />
          {isBadminton && (
            <path
              d="M82 54h356v212H82z"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="2"
            />
          )}
          <path
            d="M58 160h404"
            stroke="#a3ce3c"
            strokeWidth="5"
            strokeDasharray="8 7"
          />
        </>
      )}
      {isVolleyball && (
        <>
          <path
            d="M175 32v256M345 32v256"
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="2"
          />
          <path
            d="M260 32v256"
            stroke="#a3ce3c"
            strokeWidth="5"
            strokeDasharray="8 7"
          />
        </>
      )}
      {!isRacquetSport && !isVolleyball && (
        <path
          d="M193 32v256M327 32v256"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2"
        />
      )}
      <circle cx="146" cy="103" r="8" fill="#a3ce3c" />
      <circle
        cx="367"
        cy="219"
        r="8"
        fill="#2b87b8"
        stroke="white"
        strokeWidth="2"
      />
    </svg>
  );
}

function fallbackSportLabel(sport?: string | null): string {
  if (!sport) return "Multi-sport court";
  return `${sport[0].toUpperCase()}${sport.slice(1)} court`;
}
