/**
 * `[data-back]` links go back in history when the user arrived from another
 * page of the app (e.g. chef sheet → recipe → Back returns to the sheet), and
 * follow their href otherwise (opened directly, from the home screen, …).
 */
import { hasInAppHistory, onPageReady } from "@/scripts/lifecycle";

onPageReady((signal) => {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-back]")) {
    link.addEventListener(
      "click",
      (event) => {
        if (!hasInAppHistory()) return;
        event.preventDefault();
        history.back();
      },
      { signal },
    );
  }
});
