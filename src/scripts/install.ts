/**
 * "Install on this device" for the setup page.
 *
 * - Chrome / Edge / Samsung Internet (Android, desktop) fire
 *   `beforeinstallprompt`; we keep the event and show our button, which
 *   opens the browser's own install dialog.
 * - iPad/iPhone have no install API: the button reveals the Share →
 *   Add to Home Screen hint instead.
 * - Already running as an installed app: show "already installed".
 *
 * `beforeinstallprompt` fires once per document load — often before any
 * page script runs its init — so it is captured at module level, not in
 * onPageReady. The button wiring itself follows the page lifecycle.
 */
import { onPageReady } from "@/scripts/lifecycle";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); // we show our own button instead of the mini-infobar
  deferred = event as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  installed = true;
  deferred = null;
  notify();
});

function isStandalone(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPadOS reports itself as a Mac — tell them apart by touch support. */
function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

onPageReady((signal) => {
  const root = document.getElementById("install");
  if (!root) return;
  const button = root.querySelector<HTMLButtonElement>("[data-install-button]");
  const iosHint = root.querySelector<HTMLElement>("[data-install-ios]");
  const done = root.querySelector<HTMLElement>("[data-install-done]");

  const render = () => {
    const alreadyInstalled = installed || isStandalone();
    if (done) done.style.display = alreadyInstalled ? "" : "none";
    if (button) button.style.display = !alreadyInstalled && (deferred !== null || isIos()) ? "" : "none";
  };

  button?.addEventListener(
    "click",
    async () => {
      if (deferred) {
        const prompt = deferred;
        deferred = null;
        try {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === "accepted") installed = true;
        } catch (err) {
          console.error("Install prompt failed:", err);
        }
        render();
      } else if (iosHint) {
        iosHint.style.display = "";
      }
    },
    { signal },
  );

  listeners.add(render);
  signal.addEventListener("abort", () => listeners.delete(render));
  render();
});
