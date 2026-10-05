---
name: go-live
description: Publish the site to production on Cloudflare for the first time. Use when asked to deploy, publish, launch, or go live with a new site, or to set up the domain, Workers Builds, Email Service, or Turnstile for production.
disable-model-invocation: true
---

# Go Live — First-Time Publish

Ordered runbook for taking a cloned site to production. The ordering constraints are real — do not reorder: nameservers first (propagation is the long pole); zone **Active** before Email Service onboarding and custom domains; Turnstile site key before the production build (it's inlined); Worker deployed before `wrangler secret put`; destination address verified before the contact-form test can pass.

## 1. Preflight (local)

- No `example.com` / Turnstile test-key leftovers: `wrangler.toml` (`name`, all `[vars]` incl. `TURNSTILE_HOSTNAMES`), `.env.production` (real `PUBLIC_SITE_URL`; site key gets replaced in step 3 — the shipped test key `1x000…AA` always passes the widget but fails real verification), `astro.config.mjs` `site`, `public/robots.txt` sitemap URL, `CLAUDE.project.md` TODOs filled.
- **The apex domain is canonical** — `PUBLIC_SITE_URL`, `astro.config.mjs` `site`, and `robots.txt` all use `https://example.com`, never `https://www.example.com`. `www` exists only as a 301 to apex (step 6).
- `pnpm install && pnpm build` passes (OG generation needs a `.ttf` in `public/fonts/`).
- `pnpm exec wrangler whoami` — correct account; pin with `CLOUDFLARE_ACCOUNT_ID` if the token sees several.

## 2. Zone (do first — propagation runs while you work)

Dashboard → Add a domain → point nameservers at Cloudflare **at the registrar** (manual, minutes–24h). Wait for **Active**. Confirm SSL/TLS mode Full (Strict).

## 3. Turnstile — use the `cloudflare:turnstile-spin` skill

The skill ships with the `cloudflare` Claude Code plugin, not this repo — if it is not listed, install the plugin (`/plugin`) before continuing.

Never create the widget manually or handle the secret in chat — Spin creates the widget (production hostnames + `localhost`), provisions `TURNSTILE_SECRET`, and validates it. Site key → `PUBLIC_TURNSTILE_SITE_KEY` in the **committed `.env.production`** (build-time, public by definition); secret → `TURNSTILE_SECRET` (runtime Worker secret, never in `[vars]`). If the Worker doesn't exist yet, Spin stores the secret in the gitignored `.env`; push it with `wrangler secret put` right after step 5. Set `TURNSTILE_HOSTNAMES` in `wrangler.toml` `[vars]` to the production hostnames (comma-separated; `localhost` belongs only in `.dev.vars`).

## 4. Email Service (dashboard-only, human-in-the-loop)

Email Service → Email Sending → onboard the sending domain (zone must be Active; DKIM/SPF auto-added). Add the recipient as a **verified destination address** — the client must click the verification email. `EMAIL_FROM` on the onboarded domain; `CONTACT_EMAIL` = the verified address. The `[[send_email]]` binding already exists in `wrangler.toml`.

## 5. First deploy

```bash
# .env.production (committed) must already hold the real
# PUBLIC_TURNSTILE_SITE_KEY and PUBLIC_SITE_URL — `astro build` reads it.
pnpm deploy            # astro build && wrangler deploy
pnpm exec wrangler secret put TURNSTILE_SECRET   # Worker must exist first
```

Smoke-test the `workers.dev` URL: pages, CSS/fonts, styled 404. The contact form is expected to fail here — `workers.dev` isn't a registered Turnstile hostname; test it in step 9 on the real domain.

## 6. Custom domain (config-as-code)

Uncomment/fill the `routes` block in `wrangler.toml` and `pnpm deploy` again — keep the canonical apex **first** (`wrangler dev` simulates the first entry over plain http):

```toml
routes = [
  { pattern = "example.com", custom_domain = true },
  { pattern = "www.example.com", custom_domain = true }
]
```

Then: zone Redirect Rule 301 `www.example.com/*` → `https://example.com/$1` (apex is the canonical public URL — `www` must never serve content directly; never do this redirect in Worker code — it needs `run_worker_first`, which bills every asset request); disable the `workers.dev` URL (Worker → Settings → Domains & Routes) so the site isn't indexed twice.

## 7. Workers Builds (dashboard-only)

Worker → Settings → Builds → connect the Git repo. Build `pnpm build`, deploy `npx wrangler deploy`. Node comes from `.node-version` and pnpm from `packageManager` in `package.json` — nothing to set in the dashboard, but confirm the first build log shows the pinned pnpm version (if not, add a `PNPM_VERSION` build variable as fallback). No dashboard build variables needed — `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_SITE_URL` come from the committed `.env.production`. Never manage runtime vars in the dashboard either: every deploy overwrites them from `wrangler.toml` `[vars]`. Push a trivial commit; confirm the build deploys green.

## 8. Web Analytics

Zone → Analytics & Logs → Web Analytics → enable automatic setup (zone injection; CSP already whitelists it).

## 9. Verify — not live until all pass

- `curl -sI https://<domain>` → 200, valid TLS; headers show CSP + `X-Frame-Options: DENY`; unknown path returns styled 404.
- `robots.txt` and `sitemap-index.xml` carry the real domain; page source has canonical + hreflang; one `/og/` image loads; every locale renders.
- **Contact form end-to-end on the production domain** (run `pnpm exec wrangler tail` while testing): widget renders, submit goes `idle → sending → completed`, the email arrives at the verified inbox. Failure path: submit without solving Turnstile → 403, form preserves values, "Send another message" resets.
- Browser console clean — no CSP violations, no non-whitelisted hosts. Analytics beacons appear after a few visits.
