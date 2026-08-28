import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Every `--color-*` suffix defined in globals.css's `@theme inline` block. */
const THEME_COLOR_TOKENS = [
  "app",
  "sunken",
  "surface",
  "inset",
  "raised",
  "overlay",
  "hover",
  "line",
  "line-strong",
  "line-accent",
  "ink",
  "muted",
  "faint",
  "inverted",
  "accent",
  "accent-hover",
  "accent-soft",
  "accent-border",
  "success",
  "success-soft",
  "success-border",
  "warning",
  "warning-soft",
  "warning-border",
  "danger",
  "danger-soft",
  "danger-border",
  "info",
  "info-soft",
  "info-border",
  "violet",
  "violet-soft",
  "violet-border",
  "teal",
  "teal-soft",
  "teal-border",
  "chip",
  "chip-border",
];

/**
 * tailwind-merge ships a static list of known Tailwind class names — it has
 * no way to see the custom tokens this app defines in `@theme inline`
 * (globals.css). Left at its defaults, an unrecognized `text-{word}` utility
 * gets heuristically bucketed into the same conflict group as *every other*
 * unrecognized `text-{word}` utility, so `cn("text-display", "text-ink")`
 * silently drops one of the two (last one in argument order wins) instead of
 * keeping both — because to tailwind-merge they look like two colors, or two
 * sizes, fighting over the same slot. Registering the real token names below
 * tells it these are two different class groups (font-size vs. text-color)
 * that don't conflict with each other at all.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "meta", "body", "ui", "lede", "figure", "display"] }],
      "text-color": [{ text: THEME_COLOR_TOKENS }],
      "bg-color": [{ bg: THEME_COLOR_TOKENS }],
      "border-color": [{ border: THEME_COLOR_TOKENS }],
    },
  },
});

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
