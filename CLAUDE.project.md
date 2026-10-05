# Project Configuration

<!--
  Fill this file when starting a new project from the starter.
  CLAUDE.md has all shared stack conventions — this file only has project-specific values.
  Values here override CLAUDE.md where they conflict.
-->

## Site
- **Name:** Тавче / Tavče (working name — `site_name` in `messages/{locale}.json`; the mark is `src/components/LogoMark.astro` + `public/favicon.svg`)
- **Domain:** TODO (apex only, e.g., https://example.com — never `www`; `www` 301-redirects to apex)
- **Description:** Private family recipe site for a kitchen tablet — recipe catalogue, cook mode, weekly meal plan. Protected by Cloudflare Access.

## i18n
- **Default locale:** mk
- **Locales:** mk, en

## Fonts
- **Sans:** "Nunito" (variable 400–800; cyrillic, latin, latin-ext) — `public/fonts/Nunito-*.woff2`
- **Heading/Serif:** "Lora" (variable 400–700; cyrillic, latin, latin-ext) — `public/fonts/Lora-*.woff2`
- Font families are set in `src/styles/starwind.css` `:root` block (`--font-sans-family`, `--font-heading-family`); the `@font-face` rules sit at the top of that file.

## Contact Form
- **Not used.** Private site — the starter's contact form, blog, legal pages, OG images and sitemap are pending removal. The "Turnstile is required" rule only applies while a contact form exists.

## Project-Specific Notes

### Private site
- The whole site sits behind Cloudflare Access. Every page is `noindex` (Layout meta + `X-Robots-Tag` in `public/_headers`); `robots.txt` disallows all.
- At go-live: disable the `workers.dev` URL and preview URLs (they bypass Access) and set a long Access session for the tablet.

### Content model (`src/content/`)
- `ingredients.yaml` — shared ingredient dictionary keyed by id (`name` per locale, `aisle`, `staple`). Recipes reference ingredients by id so search matches both languages and the weekly shopping list can merge quantities. Add new ingredients here first.
- `recipes/<slug>.yaml` — one recipe per file; slug = Latin transliteration (`tavce-gravce`). Schema in `src/content.config.ts`; vocabularies (categories, meals, units, diets…) in `src/lib/recipe-taxonomy.ts`, each with matching Paraglide messages (`category_*`, `unit_*_one|other`, …).
- Translated content fields are `{ mk: "...", en: "..." }` — `mk` required, `en` falls back to `mk` (`t()` in `src/lib/i18n-content.ts`). UI strings still go through Paraglide.
- Whole items use unit `pc` and a `{ one, other }` name; Macedonian count words go into the name ("главица кромид").
- Variants: small changes inline (`variants:` with `add`/`remove`/`note`, preselectable via `?v=<id>`); big variations get their own file with `variantOf: <slug>`.
- `src/lib/recipes.ts` cross-checks every ingredient/`variantOf` reference and throws at build time — Astro's `reference()` alone validates lazily.
- The 12 current recipes are examples, to be replaced by the family's real recipes.

### Routing
- Pages are thin route files in `src/pages/` (mk) and `src/pages/en/` (en) rendering shared views from `src/views/`. Astro's i18n fallback rewrite is not usable: it re-runs middleware on the mk URL, so Paraglide would render mk strings on /en/ pages.

### Scripts
- `src/scripts/recipe.ts` is the reference `onPageReady()` implementation (the starter's `contact-form.ts` is pending removal).
- `src/scripts/timers.ts` is the one deliberate exception to per-page teardown: timer state and its interval are module-level so timers survive navigation; `#timer-tray` uses `transition:persist`.

### Household & chef
- A chef comes every morning at 7:00 and cooks breakfast, lunch and snacks on the kitchen tablet; sometimes also cooks ahead for the next day. Dinner is usually nothing — occasionally leftovers or the snacks.
- 2 adults + 1 child → plans use `"servings": 3`. Shopping is done once a week.

### Meal plans (`src/content/mealplans/<ISO-week>.json`)
- Written by the weekly automation; schema in `src/content.config.ts`, loading/validation in `src/lib/mealplan.ts` (unknown recipes/variants, dates outside the ISO week, bad leftovers or prep links all fail the build).
- Per day: `breakfast`, `lunch`, `snack`, `dinner` (each a list of dishes: `{ recipe, variant?, servings?, note? }`, `{ leftovers: "<earlier meal>" }` or `{ note }`), plus `prep: [{ recipe, for: "<later date>" }]` for cook-ahead.
- Screens: home "Today" card, `/plan` (week view), `/plan/day/<date>` (chef sheet: work order, merged ingredients, prep for tomorrow), `/plan/shopping/<week>` (weekly list, staples separate). "Today" is resolved on the tablet in `src/scripts/plan.ts` — never at build time.
- `/pantry` — "what can I make" from selected ingredients, variants included.

### Kitchen tablets (installed web app + idle screen)
- Installed on always-on kitchen tablets — iPad (Safari → Share → Add to Home Screen) and Android (Chrome install prompt). Still a plain website — no native app. Other kitchens set up via the `/setup` page (install button + per-platform steps).
- `src/scripts/install.ts` is loaded on every page from Layout: Android's `beforeinstallprompt` fires once on the first page load, so it must be captured globally.
- `public/manifest.webmanifest` + `public/icons/` (regenerate with `node scripts/generate-icons.mjs` after a logo change; the manifest name is static — update it on a rename).
- Offline: `integrations/service-worker.mjs` writes `dist/sw.js` from `integrations/sw-template.js` at build with every page/asset to precache; registered in production only (`src/scripts/pwa.ts`). Pages network-first, hashed assets cache-first; Access login redirects are never cached.
- Idle screen: `src/components/IdleScreen.astro` + `src/scripts/idle.ts`, data from `/idle.json` (`src/lib/idle-data.ts`). 3 min idle; morning/day = today's menu, from 17:00 tomorrow's, 22:00–06:30 dim clock; never over cook mode; reloads ~03:00 for a new plan. Preview with `?idle` on any URL.

### Photos & videos (private R2)
- Bucket `tavce-media` (binding `MEDIA` in `wrangler.toml`), served by `worker/index.ts` at `/media/<key>` — same origin, so Cloudflare Access protects it; Range + ETag supported. This replaces `astro:assets <Image>` for recipe media (the stack rule) because files live in R2, not `src/assets/`.
- Add media only with `node scripts/media.mjs add <file> --id <id> [--alt-mk … --alt-en …] [--poster img] [--local|--no-upload]` → WebP 480/960/1600 (images) or H.264 MP4 (videos; needs `brew install ffmpeg` for non-MP4 input and auto poster). It writes `src/content/media.yaml` and the local `.media/` mirror (served by `astro dev` via `integrations/dev-media.mjs`).
- Recipes reference media ids: `cover`, `gallery`, `steps[].media`; unknown ids fail the build. Keys include a content hash, so replacing a file never serves a stale copy.
- The bucket must be created in the Cloudflare account before the first deploy (`wrangler r2 bucket create tavce-media`).

### Household
- `src/content/household.yaml` — members with `avoid` (ingredient ids) and `avoidTags` (`spicy`…); warnings appear on menus, the chef sheet and recipe pages. Recipe flags in `tags` (`kid-friendly`, `spicy`).
- Ingredients carry `store` (market/butcher/bakery/supermarket; default by aisle) for the shopping list and `months` for the "in season" section.

### UX conventions (from the UX/a11y review)
- **Primary target: landscape tablet** (iPad 1180×820, iPad mini 1133×744, Android ~1280×800) → layouts switch at `lg` (1024px). Height is the scarce dimension: recipe page and chef sheet are two independently scrolling panes (`lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto`); home is today | search + tomorrow; week view is one row per day; shopping list flows into two columns; cook mode puts Back · step dots · Next in one row. Portrait/phone stack the same content.
- Touch targets ≥44px (`h-11`); cook-mode controls ≥80px. Kitchen text ≥14px — no `text-xs` for meaningful info.
- Primary buttons hover to `bg-primary-accent` (keeps 6:1 contrast); inputs/checkboxes use `border-input` (≥3:1). Global `:focus-visible` outline in `starwind.css`.
- Overlays (cook mode, idle screen) make the page behind `inert`; the timer tray stays usable. Timers: no live region on clocks, one `role="alert"` when done.
- Reduced motion handled globally in `global.css`; JS drift checks `prefers-reduced-motion`.
- `[data-back]` links use history when the user came from inside the app (`hasInAppHistory()` in `lifecycle.ts`).
- Printing: recipe pages print `RecipePrintSheet.astro` (A4 portrait, category-colored, follows the on-screen variant and servings; the interactive page is `print:hidden`). The weekly menu prints on the named `@page menu` (A4 landscape). Print always uses the light palette (`@media print` override in `starwind.css`).
- Language picker and light/dark toggle live in the footer (set once per device; the header stays for navigation and the quick timer). The footer is on every page and viewport, so the "LanguagePicker in every nav variant" rule is met.

### Planned
- Weekly plan generator (automation), `/add-recipe` command, fuzzy search.
