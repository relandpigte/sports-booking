import Image from "next/image";

// The badge plus the wordmark.
//
// The badge already contains the name, but at 40px none of that lettering is
// legible — so the mark carries the identity and the text beside it carries the
// name. `mark` drops the wordmark for tight spaces.
//
// `tone="light"` is for dark surfaces: the badge is a white-background PNG, so
// on navy it gets a white tile rather than being floated on top, which reads as
// deliberate instead of like a missing cutout.
export function Logo({
  className = "",
  size = 40,
  mark = false,
  tone = "dark",
}: {
  className?: string;
  size?: number;
  mark?: boolean;
  tone?: "dark" | "light";
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/bunal-logo.png"
        alt="Bunal.ph"
        width={size}
        height={size}
        priority
        className="shrink-0 rounded-xl bg-white p-0.5 ring-1 ring-black/5"
      />
      {!mark && (
        <span
          className={`text-2xl font-extrabold tracking-tight ${
            tone === "light" ? "text-white" : "text-navy"
          }`}
        >
          Bunal
          <span className={tone === "light" ? "text-accent" : "text-primary"}>
            .Ph
          </span>
        </span>
      )}
    </div>
  );
}
