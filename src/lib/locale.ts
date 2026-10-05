/**
 * Locale configuration — keep in sync with astro.config.mjs and project.inlang/settings.json.
 */

export const LOCALES = ["mk", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "mk";

/**
 * Map non-ISO locale codes to their ISO 639-1 hreflang equivalents.
 * Only add entries where the Astro locale code differs from the ISO code.
 * Example: { al: "sq" } for Albanian.
 */
export const HREFLANG_MAP: Record<string, string> = {};

/**
 * Strip locale prefix from a URL path.
 * "/en/blog" → "/blog", "/blog" → "/blog", "/en" → "/"
 */
export function stripLocalePrefix(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (
    segments.length > 0 &&
    (LOCALES as readonly string[]).includes(segments[0])
  ) {
    return "/" + segments.slice(1).join("/") || "/";
  }
  return path;
}
