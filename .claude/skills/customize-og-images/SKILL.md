---
name: customize-og-images
description: Customize the auto-generated OG (social share) image design, fonts, or layout. Use when asked to change OG images, social cards, or share previews.
---

# Customize OG Images

OG images are generated at build time by Satori + resvg via `src/pages/og/[...slug].ts`, one per blog post plus a default.

- **Template:** edit `generateOgImage` in `src/lib/og.ts`. It uses Satori's JSX-like *object* syntax (`{type: "div", props: {style, children}}`), not real JSX. Satori supports a flexbox subset — every element with multiple children needs `display: "flex"`.
- **Font:** auto-detected — the first `.ttf` or `.woff` file (alphabetically) in `public/fonts/` is used; the family name derives from the filename. To change the OG font, drop the file there. `.woff2` is NOT supported by Satori — keep one `.ttf` alongside the web `.woff2` files.
- **Per-post override:** put a PNG in `public/og/` **and** set `ogImage` in the post's frontmatter to its path — both are needed.
- **Dimensions:** 1200×630 (standard OG) — don't change.
- **Per-project defaults:** `siteName` (footer line on every card) lives in `src/lib/og.ts`; the default card's title/description (`/og/default`) live in `src/pages/og/[...slug].ts` and must match `site_name`/`site_description` in `messages/` (Paraglide messages aren't available in `.ts` endpoints — that's why they're duplicated).

Verify: `pnpm build`, then inspect the PNGs in `dist/og/` (e.g. open `dist/og/default`).
