# Astro Static Site Starter

Production-ready starter for static websites built with Astro 7 and deployed on Cloudflare Workers (static assets). Designed to be used as a template — clone it, customize it, ship it.

## Stack

| Layer | Tool |
|-------|------|
| Framework | [Astro 7](https://astro.build) (static output) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Components | [Starwind UI v3](https://starwind.dev) — 49 pre-installed Astro-native components |
| Animations | [Motion](https://motion.dev) — vanilla JS, no React |
| Icons | [Tabler Icons](https://tabler.io/icons) |
| i18n | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) — type-safe, URL-based routing |
| OG Images | Auto-generated at build time via [Satori](https://github.com/vercel/satori) + resvg |
| Contact Form | Worker API route + [Turnstile](https://www.cloudflare.com/products/turnstile/) captcha + [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) |
| Hosting | [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) (static assets) |
| Analytics | Cloudflare Web Analytics (cookieless, auto-injected via zone setting) |

## Quick Start

```bash
# Clone and install (one-time: `corepack enable pnpm` so `pnpm` uses the pinned version)
git clone <repo-url> my-project && cd my-project
pnpm install

# Set up environment (both ship Cloudflare's Turnstile test keys — works as-is)
cp .env.example .env              # build-time PUBLIC_* vars for astro dev/build
cp .dev.vars.example .dev.vars    # runtime Worker vars for pnpm preview:worker

# Start developing
pnpm dev
```

Email settings (`CONTACT_EMAIL`, `EMAIL_FROM`) live in `wrangler.toml` `[vars]`; real Turnstile keys are provisioned at go-live.

## Project Structure

```
worker/index.ts                 Worker entry (contact API route + asset fallback)
messages/{locale}.json          Translation files (Paraglide)
public/
  fonts/                        Font files (.woff2 for web, .ttf for OG images)
  _headers                      Security headers (CSP, X-Frame-Options, etc.)
src/
  components/
    starwind/                   49 pre-installed Starwind UI components (v3, runtime-backed)
    Header.astro                Site header + navigation
    Footer.astro                Site footer
    ContactForm.astro           Contact form (Starwind inputs + Turnstile + UI states)
    SEO.astro                   Meta tags, OG, hreflang
    LanguagePicker.astro        Locale switcher
  content/blog/{locale}/        Blog posts (Markdown)
  layouts/Layout.astro          Base layout (imports both CSS files)
  lib/
    og.ts                       OG image generator (auto-detects font)
    locale.ts                   Locale config + helpers
  scripts/                      Client-side TS modules (onPageReady lifecycle)
  middleware.ts                 Paraglide locale middleware
  pages/                        File-based routing
  styles/
    starwind.css                Tailwind v4 + design tokens + Starwind theme
    global.css                  Project-specific CSS overrides
```

## Setup Checklist

After cloning for a new project:

- [ ] Fill in `CLAUDE.project.md` with project-specific values
- [ ] Update `site` in `astro.config.mjs` with your production URL
- [ ] Update `PUBLIC_SITE_URL` in `.env.production` (committed) and `.env`
- [ ] Update `name` in `wrangler.toml` with your project name
- [ ] Replace `site_name` and `site_description` in `messages/en.json`
- [ ] Update the OG defaults: `siteName` in `src/lib/og.ts`, default title/description in `src/pages/og/[...slug].ts`
- [ ] Replace `public/favicon.svg`
- [ ] Add your font files to `public/fonts/` (`.ttf` for OG images, `.woff2` for web)
- [ ] Update font families in `:root` block of `src/styles/starwind.css`
- [ ] Set Turnstile keys at go-live — `PUBLIC_TURNSTILE_SITE_KEY` in the committed `.env.production`, `TURNSTILE_SECRET` via `wrangler secret put` (see the `go-live` skill)
- [ ] Onboard your domain to Email Service (Cloudflare dashboard → Email Service → Email Sending) and verify the recipient address
- [ ] Update `CONTACT_EMAIL` and `EMAIL_FROM` in `wrangler.toml`
- [ ] Replace placeholder content in privacy and terms pages
- [ ] Update sitemap URL in `public/robots.txt`
- [ ] Delete the example blog post in `src/content/blog/`

## Commands

```bash
pnpm dev              # Start dev server (no Worker — contact API 404s here)
pnpm build            # Build for production (static output to dist/)
pnpm check            # Type-check .astro + .ts (keep at 0 errors)
pnpm preview          # Preview static build locally
pnpm preview:worker   # wrangler dev — full-stack preview incl. contact API
pnpm deploy           # Build + deploy to Cloudflare Workers
```

## Styling

The design system lives in `src/styles/starwind.css`:

- **Colors** — `:root` block for light mode, `.dark` block for dark mode
- **Fonts** — `--font-sans-family` and `--font-heading-family` in `:root`
- **Radii** — `--radius` base value, all sizes derive from it
- **Dark mode** — `.dark` class block is pre-configured and ready to use

`src/styles/global.css` is reserved for project-specific overrides that don't belong in Starwind's theme.

## i18n

Default locale is project-specific — set in `astro.config.mjs` (`i18n.defaultLocale`) and `project.inlang/settings.json` (`baseLocale`). Keep them in sync.

**Adding a locale:** follow `.claude/skills/add-locale/SKILL.md` — every step is required.

## Blog

Posts go in `src/content/blog/{locale}/slug.md`. Frontmatter schema, drafts, and per-post OG overrides: see `.claude/skills/write-blog-post/SKILL.md` (schema source: `src/content.config.ts`).

OG images are auto-generated per post. To use a custom one, place a PNG in `public/og/` **and** point the post's `ogImage` frontmatter at it.

## Contact Form

- **Frontend:** `src/components/ContactForm.astro` — Starwind UI inputs, vanilla JS with explicit UI states (`idle` → `sending` → `completed`/`failed`, with a "Send another message" button on both end states)
- **Backend:** `worker/index.ts` — validates Turnstile, sends via the Email Service `send_email` binding (`env.EMAIL.send()`)
- **Config:** Non-secret vars and the `[[send_email]]` binding in `wrangler.toml`; the `TURNSTILE_SECRET` secret via `wrangler secret put` or the dashboard
- **Email Service setup:** Onboard your sending domain (dashboard → Email Service → Email Sending) and verify the recipient. Sending to verified destination addresses in your own account is free on all plans.

## OG Images

Auto-generated at build time for every blog post. The font is auto-detected from `public/fonts/` — drop a `.ttf` or `.woff` file and it works. Customize the template in `src/lib/og.ts`.

## Security

`public/_headers` ships security headers for all pages:
- CSP whitelisting self, Turnstile, and Cloudflare Analytics
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

If you add third-party scripts, update the CSP to whitelist their domains.

## Cookie Banner

Not included — the default stack is fully cookieless (Cloudflare Web Analytics + Turnstile strictly necessary cookies).

**Required if you add:** third-party analytics, social media embeds, ad pixels, YouTube/Vimeo embeds, or any non-essential cookies.

## Deployment

Connect the repo to Cloudflare Workers Builds (dashboard → Workers & Pages → Create → import repository):

| Setting | Value |
|---------|-------|
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Node.js version | Auto — read from `.node-version` (24) |

All Worker config (assets directory, `send_email` binding, vars) lives in `wrangler.toml`. Alternatively, deploy from CI or locally with `pnpm build && pnpm exec wrangler deploy`. Non-secret env vars go in `wrangler.toml` under `[vars]`. Secrets go in the Cloudflare dashboard or via `wrangler secret put`.

## AI Integration

This starter includes documentation for AI-assisted development:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Shared stack conventions (single source of truth) — do not edit per-project. Imports `CLAUDE.project.md` so both load automatically. |
| `CLAUDE.project.md` | Project-specific config (locale, fonts, domain, contact email) — fill this when starting a new project |
| `AGENTS.md` | Thin entry point for non-Claude tools that read the AGENTS.md standard — points to `CLAUDE.md` |
| `.claude/skills/` | On-demand task walkthroughs (go live for the first time, add a locale, write a blog post, customize OG images) — loaded only when relevant. `go-live` runs only when invoked explicitly (`/go-live`) |
| `.claude/settings.json` | Shared Claude Code permissions — pre-approves `pnpm` dev/build/check, blocks reading local secrets (`.env`, `.env.local`, `.dev.vars`) |
| `.mcp.json` | Registers the Astro docs MCP server (`https://mcp.docs.astro.build/mcp`) — Claude Code asks to enable it on first use |

When starting a new project, fill in the TODOs in `CLAUDE.project.md`. The shared conventions in `CLAUDE.md` apply automatically.

## License

Private — update as needed.
