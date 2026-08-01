import Image from "next/image";

export function Logo({
  className = "",
  size = "compact",
}: {
  className?: string;
  size?: "compact" | "standard" | "large";
}) {
  const dimensions = {
    compact: "h-[60px] w-[70px]",
    standard: "h-[84px] w-[98px]",
    large: "h-[112px] w-[130px]",
  }[size];
  const imageSize = {
    compact: "70px",
    standard: "98px",
    large: "130px",
  }[size];

  return (
    <div className={`relative shrink-0 ${dimensions} ${className}`}>
      <Image
        src="/bunal-logo-v2-wordmark.png"
        alt="Bunal.club"
        fill
        sizes={imageSize}
        priority
        className="object-contain drop-shadow-[0_1px_1px_rgba(3,11,32,0.75)]"
      />
    </div>
  );
}
