import Image from "next/image";

// The supplied mark already contains the full Bunal.club wordmark, so no
// separate text is rendered beside it.
export function Logo({
  className = "",
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <Image
        src="/bunal-logo.png"
        alt="Bunal.club"
        width={Math.round(size * 1.5)}
        height={size}
        priority
        className="shrink-0 object-contain"
      />
    </div>
  );
}
