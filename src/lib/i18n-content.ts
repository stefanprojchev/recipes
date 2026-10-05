import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locale";

/** Translated content value as stored in YAML: default locale required. */
export type Localized<T> = Partial<Record<Locale, T>>;

/** Pick the current locale's text, falling back to the default locale. */
export function t<T>(value: Localized<T>, locale: Locale): T {
  const picked = value[locale] ?? value[DEFAULT_LOCALE];
  if (picked === undefined) {
    throw new Error(`Content is missing "${DEFAULT_LOCALE}" text: ${JSON.stringify(value)}`);
  }
  return picked;
}

/** Narrow Astro.currentLocale (a plain string) to a configured Locale. */
export function asLocale(value: string | undefined): Locale {
  const locale = value ?? DEFAULT_LOCALE;
  if (!(LOCALES as readonly string[]).includes(locale)) {
    throw new Error(`Unknown locale "${locale}" — add it to LOCALES in src/lib/locale.ts`);
  }
  return locale as Locale;
}
