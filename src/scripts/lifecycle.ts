/**
 * Page-lifecycle helper for ClientRouter (view transitions).
 *
 * ClientRouter does NOT re-execute identical inline scripts after
 * client-side navigation, and bundled modules execute only once per
 * session. Every script that touches the DOM must therefore re-init
 * through this helper: `astro:page-load` fires on the initial load AND
 * after every navigation, and the AbortSignal tears down the previous
 * page's listeners before the new init runs.
 *
 * Usage:
 *   onPageReady((signal) => {
 *     const el = document.getElementById("thing");
 *     if (!el) return; // current page doesn't have this component
 *     el.addEventListener("click", handler, { signal });
 *   });
 *
 * Rules:
 * - Every addEventListener inside init MUST pass `{ signal }`.
 * - Intervals/observers set up in init MUST be cleared via
 *   `signal.addEventListener("abort", cleanup)`.
 */
export function onPageReady(
  init: (signal: AbortSignal) => void | Promise<void>,
): void {
  let controller: AbortController | undefined;
  document.addEventListener("astro:page-load", () => {
    controller?.abort();
    controller = new AbortController();
    void init(controller.signal);
  });
}
