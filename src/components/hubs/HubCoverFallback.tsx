import Image from "next/image";

export function HubCoverFallback({
  hubName,
  className = "",
}: {
  hubName: string;
  className?: string;
}) {
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
      <Image
        src="/bunal-logo-v2-wordmark.png"
        alt=""
        width={220}
        height={180}
        sizes="(max-width: 640px) 42vw, 220px"
        className="relative z-10 h-auto w-[42%] max-w-[220px] object-contain opacity-35 drop-shadow-[0_8px_24px_rgba(3,11,32,0.35)] grayscale-[20%]"
      />
    </div>
  );
}
