# Shared UI components

## `src/components/Logo.tsx` — Logo

The shared Bunal.club wordmark. It renders inside a responsive 250×60 display
box and preserves the source image proportions.

```tsx
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
```

## `src/components/ui/Button.tsx` — Button

Full-width action button with primary, soft, and navy variants.

```tsx
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "soft" | "navy";
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base =
    "w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";
  const variants = {
    primary:
      "bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-hover hover:shadow-md hover:shadow-primary/25",
    soft: "bg-primary-soft text-primary hover:bg-accent-soft",
    navy: "bg-navy text-white shadow-sm hover:bg-navy-hover",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
```

## `src/components/ui/Badge.tsx` — Badge

Small status pill with semantic tone variants.

```tsx
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
```

## `src/components/ui/Avatar.tsx` — Avatar

Round profile or venue image with an initial fallback.

```tsx
interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className = "" }: AvatarProps) {
  const dimension = { width: size, height: size };
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  if (src) {
    return (
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
```
