/**
 * Quiet "offline — showing the saved copy" bar while the tablet has no
 * connection (pages then come from the service worker cache).
 */
import { onPageReady } from "@/scripts/lifecycle";

onPageReady((signal) => {
  const notice = document.querySelector<HTMLElement>("[data-offline-notice]");
  if (!notice) return;
  const update = () => {
    notice.style.display = navigator.onLine ? "none" : "";
  };
  window.addEventListener("online", update, { signal });
  window.addEventListener("offline", update, { signal });
  update();
});
