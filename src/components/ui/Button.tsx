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
    // The lift is subtle on purpose: enough to make the primary action feel
    // pressable, not enough to look like a different design language.
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
