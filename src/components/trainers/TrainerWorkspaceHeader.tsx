import type { ReactNode } from "react";

type TrainerWorkspaceIcon = "profile" | "schedule" | "sessions" | "payments";

export function TrainerWorkspaceHeader({
  eyebrow = "Trainer tools",
  title,
  description,
  badge,
  calloutLabel,
  callout,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  badge?: ReactNode;
  calloutLabel: string;
  callout: string;
  icon: TrainerWorkspaceIcon;
}) {
  return (
    <header className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
            </p>
            {badge}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        <div className="flex max-w-md items-start gap-3 rounded-xl border border-primary/20 bg-primary-soft p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary">
            <TrainerWorkspaceGlyph icon={icon} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              {calloutLabel}
            </p>
            <p className="mt-1 text-sm font-semibold leading-5 text-navy">
              {callout}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function TrainerWorkspaceGlyph({ icon }: { icon: TrainerWorkspaceIcon }) {
  const paths: Record<TrainerWorkspaceIcon, ReactNode> = {
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="m17.5 6.5 1 1 2-2" />
      </>
    ),
    schedule: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="M12 14v3l2 1" />
      </>
    ),
    sessions: (
      <>
        <path d="M4 5h16v14H7l-3 3Z" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M16 15h2" />
      </>
    ),
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[icon]}
    </svg>
  );
}
