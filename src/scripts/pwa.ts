/**
 * Registers the offline service worker (dist/sw.js, generated at build by
 * integrations/service-worker.mjs). Production only — in `astro dev` there
 * is no sw.js and caching would fight hot reload. Runs once per session;
 * registration is not tied to page lifecycle.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
    console.error("Service worker registration failed:", err);
  });
}
