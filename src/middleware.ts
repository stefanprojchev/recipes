import { defineMiddleware } from "astro:middleware";
import { paraglideMiddleware } from "./paraglide/server.js";

/**
 * Must use Paraglide's paraglideMiddleware() wrapper — a bare
 * setLocale(context.currentLocale) breaks localizeHref() during
 * prerender: every link on non-default-locale pages resolves to the
 * base locale.
 *
 * A headers-free Request is passed because the locale strategy is
 * ["url", "baseLocale"] (headers are never consulted) and accessing
 * Astro.request.headers warns on every prerendered route.
 */
export const onRequest = defineMiddleware((context, next) =>
  paraglideMiddleware(new Request(context.url), () => next()),
);
