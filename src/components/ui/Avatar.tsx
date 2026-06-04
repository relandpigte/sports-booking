interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

// Round avatar that shows the image when present, otherwise an initial.
export function Avatar({ src, name, size = 40, className = "" }: AvatarProps) {
  const dimension = { width: size, height: size };
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Profile picture"}
        style={dimension}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={dimension}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary ${className}`}
    >
      {initial}
    </div>
  );
}
