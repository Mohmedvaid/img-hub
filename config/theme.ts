/**
 * Design tokens. This file is the single source of truth for colour and type.
 *
 * How it reaches the page:
 *   1. `cssVariables()` renders these values into a `:root { ... }` block in the
 *      root layout (server-rendered, so zero client cost).
 *   2. `src/app/globals.css` uses `@theme inline` to map Tailwind utility names
 *      onto those same variables. Tokens are emitted with a `--t-` prefix so they
 *      never collide with the `--color-*` names Tailwind itself generates.
 *
 * That means changing a brand colour is a one-line edit here, and every Tailwind
 * utility, raw CSS rule and inline style picks it up. Do not write hex codes
 * anywhere else in the codebase.
 */

/** Every colour is a CSS colour string; `oklch` keeps hue consistent when lightening. */
type ColorScale = Record<string, string>

const light = {
  /* Surfaces, back to front */
  'bg-base': 'oklch(99% 0.002 250)',
  'bg-raised': 'oklch(100% 0 0)',
  'bg-sunken': 'oklch(96.5% 0.004 250)',

  /* Text */
  'fg-primary': 'oklch(21% 0.015 250)',
  'fg-secondary': 'oklch(45% 0.012 250)',
  'fg-muted': 'oklch(60% 0.010 250)',

  /* Lines */
  border: 'oklch(90% 0.006 250)',
  'border-strong': 'oklch(80% 0.010 250)',

  /* Brand — the accent. Change these two and the product changes colour. */
  brand: 'oklch(58% 0.19 258)',
  'brand-hover': 'oklch(52% 0.19 258)',
  'brand-fg': 'oklch(100% 0 0)',
  'brand-subtle': 'oklch(95% 0.03 258)',

  /* Status. Used by the error surface — see src/lib/pipeline/errors.ts */
  success: 'oklch(60% 0.15 150)',
  warning: 'oklch(72% 0.16 75)',
  danger: 'oklch(58% 0.20 27)',
  'danger-subtle': 'oklch(96% 0.03 27)',
} satisfies ColorScale

const dark = {
  'bg-base': 'oklch(17% 0.012 250)',
  'bg-raised': 'oklch(21% 0.014 250)',
  'bg-sunken': 'oklch(14% 0.010 250)',

  'fg-primary': 'oklch(96% 0.004 250)',
  'fg-secondary': 'oklch(76% 0.010 250)',
  'fg-muted': 'oklch(60% 0.012 250)',

  border: 'oklch(29% 0.012 250)',
  'border-strong': 'oklch(40% 0.014 250)',

  brand: 'oklch(70% 0.16 258)',
  'brand-hover': 'oklch(76% 0.16 258)',
  'brand-fg': 'oklch(17% 0.012 250)',
  'brand-subtle': 'oklch(28% 0.05 258)',

  success: 'oklch(70% 0.14 150)',
  warning: 'oklch(78% 0.15 75)',
  danger: 'oklch(68% 0.17 27)',
  'danger-subtle': 'oklch(26% 0.06 27)',
} satisfies ColorScale

export const theme = {
  colors: { light, dark },

  font: {
    /**
     * Font family stacks. To adopt a webfont, load it in the root layout with
     * next/font and put the generated CSS variable at the front of the stack.
     */
    sans: "var(--font-sans-loaded, ui-sans-serif), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },

  radius: {
    sm: '0.375rem',
    md: '0.625rem',
    lg: '0.875rem',
    full: '9999px',
  },
} as const

/**
 * Renders the token set as CSS custom property declarations.
 *
 * Emitted once in the root layout. Dark mode is applied via a media query plus a
 * `[data-theme]` override so an explicit user choice beats the OS setting.
 */
export function cssVariables(): string {
  const declare = (tokens: ColorScale) =>
    Object.entries(tokens)
      .map(([key, value]) => `--t-${key}:${value}`)
      .join(';')

  const staticTokens = [
    `--t-font-sans:${theme.font.sans}`,
    `--t-font-mono:${theme.font.mono}`,
    ...Object.entries(theme.radius).map(([key, value]) => `--t-radius-${key}:${value}`),
  ].join(';')

  return [
    `:root{${declare(theme.colors.light)};${staticTokens}}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${declare(theme.colors.dark)}}}`,
    `:root[data-theme="dark"]{${declare(theme.colors.dark)}}`,
  ].join('')
}
