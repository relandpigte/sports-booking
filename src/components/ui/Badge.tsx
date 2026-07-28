// The status pill this codebase already inlines in several places. Extracted
// now that subscription status has five values that each need a different tone.

export type BadgeTone = "neutral" | "primary" | "warn" | "danger" | "success";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  primary: "bg-primary-soft text-primary",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  success: "bg-green-50 text-green-700",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
