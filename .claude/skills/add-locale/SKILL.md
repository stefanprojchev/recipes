---
name: add-locale
description: Add a new locale/language to the site (Paraglide + Astro i18n). Use when asked to add a language, translate the site, or make the site multilingual.
---

# Add a New Locale

All seven steps are required — a missed step causes silent fallbacks or build errors.

1. Add the locale to `LOCALES` in `src/lib/locale.ts` (and to `HREFLANG_MAP` if the hreflang code differs from ISO 639-1).
2. Add it to `i18n.locales` in `astro.config.mjs`.
3. Add it to `locales` in `project.inlang/settings.json`.
4. Create `messages/{locale}.json` — copy an existing locale file and translate every key. Never leave keys missing.
5. Create the content directory `src/content/blog/{locale}/` (translate existing posts or leave empty).
6. Add the locale label to the `labels` map in `src/components/LanguagePicker.astro`.
7. Update the sitemap URL in `public/robots.txt` if using a subdomain strategy.

If changing the **default** locale instead: update both `i18n.defaultLocale` in `astro.config.mjs` and `baseLocale` in `project.inlang/settings.json` — they must stay in sync.

Verify: `pnpm build` — confirm localized routes appear in the build output and the language picker lists the new locale.
