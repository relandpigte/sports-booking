# Theme

## Compact token summary

- Framework: Next.js 16, React 19, Tailwind CSS v4 via `@import "tailwindcss"`.
- Fonts: Geist Sans for UI and Geist Mono for code/numbers where needed.
- Background: `#ffffff`; foreground: `#14202c`.
- Primary court green: `#16803c`; hover `#0f6330`; soft `#e9f5ec`.
- Lime accent: `#a3ce3c`; soft `#f3f9e3`.
- Shield navy: `#10243a`; hover `#1b3a5c`; soft `#eaeff5`.
- Ocean blue: `#2b87b8`; soft `#e8f4fa`.
- Existing components use 8px controls and 16px cards, restrained shadows,
  thin gray borders, and a consistent 2px primary focus ring.
- Responsive breakpoints are Tailwind defaults (`sm`, `md`, `lg`, `xl`, `2xl`).

## Raw source: `src/app/globals.css`

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #14202c;
  --color-primary: #16803c;
  --color-primary-hover: #0f6330;
  --color-primary-soft: #e9f5ec;
  --color-accent: #a3ce3c;
  --color-accent-soft: #f3f9e3;
  --color-navy: #10243a;
  --color-navy-hover: #1b3a5c;
  --color-navy-soft: #eaeff5;
  --color-ocean: #2b87b8;
  --color-ocean-soft: #e8f4fa;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--color-primary);
  --color-primary-hover: var(--color-primary-hover);
  --color-primary-soft: var(--color-primary-soft);
  --color-accent: var(--color-accent);
  --color-accent-soft: var(--color-accent-soft);
  --color-navy: var(--color-navy);
  --color-navy-hover: var(--color-navy-hover);
  --color-navy-soft: var(--color-navy-soft);
  --color-ocean: var(--color-ocean);
  --color-ocean-soft: var(--color-ocean-soft);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

There is no Tailwind config file; Tailwind v4 theme aliases live in
`src/app/globals.css`.
