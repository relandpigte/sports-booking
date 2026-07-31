import Image from "next/image";

export function Logo({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`relative h-[60px] w-[250px] max-w-full shrink ${className}`}
    >
      <Image
        src="/bunal-logo.png"
        alt="Bunal.club"
        fill
        sizes="250px"
        priority
        className="object-contain object-left"
      />
    </div>
  );
}
