/**
 * Recipe page: servings scaler, variant switcher, ingredient checkboxes
 * (synced across the page list and the cook-mode copies) and cook mode
 * (step-by-step overlay that keeps the screen awake).
 */
import { onPageReady } from "@/scripts/lifecycle";
import { formatRange, pluralForm } from "@/lib/quantity";

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 48;
const SWIPE_THRESHOLD_PX = 60;

onPageReady((signal) => {
  const root = document.getElementById("recipe");
  if (!root) return;

  const locale = document.documentElement.lang;
  const baseServings = Number(root.dataset.baseServings);
  if (!Number.isFinite(baseServings) || baseServings <= 0) {
    console.error("Recipe page is missing a valid data-base-servings:", root.dataset.baseServings);
    return;
  }

  setupServings(root, baseServings, locale, signal);
  setupVariants(root, signal);
  setupCheckboxSync(root, signal);
  setupStepToggles(root, signal);
  setupCookMode(root, signal);
});

/** Tap a step's number to mark it done (dimmed, ✓) — for cooking without cook mode. */
function setupStepToggles(root: HTMLElement, signal: AbortSignal) {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-step-toggle]")) {
    button.addEventListener(
      "click",
      () => {
        const step = button.closest<HTMLElement>("[data-step]");
        const done = !step?.hasAttribute("data-done");
        step?.toggleAttribute("data-done", done);
        button.setAttribute("aria-pressed", String(done));
      },
      { signal },
    );
  }
}

function setupServings(root: HTMLElement, base: number, locale: string, signal: AbortSignal) {
  // The page stepper and the print sheet both show the current servings.
  const values = [...root.querySelectorAll<HTMLElement>("[data-servings-value]")];
  let servings = base;

  const apply = () => {
    const factor = servings / base;
    for (const value of values) value.textContent = String(servings);
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-servings-step]")) {
      const step = Number(button.dataset.servingsStep);
      button.disabled = (step < 0 && servings <= MIN_SERVINGS) || (step > 0 && servings >= MAX_SERVINGS);
    }

    for (const qty of root.querySelectorAll<HTMLElement>("[data-qty]")) {
      const low = Number(qty.dataset.base);
      const high = qty.dataset.baseMax ? Number(qty.dataset.baseMax) : undefined;
      qty.textContent = formatRange(low, high, factor, qty.dataset.metric !== undefined, locale);

      const form = pluralForm((high ?? low) * factor, locale);
      const line = qty.closest("[data-ingredient-line]");
      const unit = line?.querySelector<HTMLElement>("[data-unit]");
      if (unit) unit.textContent = unit.dataset[form] ?? unit.textContent;
      const name = line?.querySelector<HTMLElement>("[data-name][data-counted]");
      if (name) name.textContent = name.dataset[form] ?? name.textContent;
    }
  };

  const clamp = (n: number) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n)));

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-servings-step]")) {
    button.addEventListener(
      "click",
      () => {
        servings = clamp(servings + Number(button.dataset.servingsStep));
        apply();
        // Keep it in the URL (?s=3) like the meal plan's links, so a reload keeps the scale.
        const url = new URL(location.href);
        if (servings === base) url.searchParams.delete("s");
        else url.searchParams.set("s", String(servings));
        history.replaceState(history.state, "", url);
      },
      { signal },
    );
  }

  // Links from the meal plan carry the planned servings.
  const requested = Number(new URL(location.href).searchParams.get("s"));
  if (Number.isFinite(requested) && requested > 0) {
    servings = clamp(requested);
    apply();
  }
}

function setupVariants(root: HTMLElement, signal: AbortSignal) {
  const options = [...root.querySelectorAll<HTMLButtonElement>("[data-variant-option]")];
  if (options.length === 0) return;

  const select = (id: string) => {
    const active = options.some((o) => o.dataset.variantOption === id) ? id : "base";
    root.dataset.variant = active;
    for (const option of options) {
      option.setAttribute("aria-pressed", String(option.dataset.variantOption === active));
    }
    for (const line of root.querySelectorAll<HTMLElement>("[data-variant-add]")) {
      line.style.display = line.dataset.variantAdd?.split(" ").includes(active) ? "" : "none";
    }
    for (const line of root.querySelectorAll<HTMLElement>("[data-variant-remove]")) {
      line.toggleAttribute("data-removed", line.dataset.variantRemove?.split(" ").includes(active) ?? false);
    }
    for (const note of root.querySelectorAll<HTMLElement>("[data-variant-note]")) {
      note.style.display = note.dataset.variantNote === active ? "" : "none";
    }
    // Print sheet: name the variant being printed.
    const activeOption = options.find((o) => o.dataset.variantOption === active);
    for (const label of root.querySelectorAll<HTMLElement>("[data-current-variant]")) {
      label.textContent = activeOption?.textContent?.trim() ?? "";
    }
    for (const wrap of root.querySelectorAll<HTMLElement>("[data-current-variant-wrap]")) {
      wrap.style.display = active === "base" ? "none" : "";
    }

    // Keep the choice in the URL (?v=leek) so links — e.g. from a meal plan — can preselect it.
    const url = new URL(location.href);
    if (active === "base") url.searchParams.delete("v");
    else url.searchParams.set("v", active);
    history.replaceState(history.state, "", url);
  };

  for (const option of options) {
    option.addEventListener("click", () => select(option.dataset.variantOption ?? "base"), { signal });
  }

  const requested = new URL(location.href).searchParams.get("v");
  if (requested) select(requested);
}

function setupCheckboxSync(root: HTMLElement, signal: AbortSignal) {
  root.addEventListener(
    "change",
    (event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement) || !box.dataset.lineKey) return;
      for (const twin of root.querySelectorAll<HTMLInputElement>(`input[data-line-key="${box.dataset.lineKey}"]`)) {
        twin.checked = box.checked;
      }
    },
    { signal },
  );
}

function setupCookMode(root: HTMLElement, signal: AbortSignal) {
  const overlay = document.getElementById("cook-mode");
  const openButton = root.querySelector<HTMLButtonElement>("[data-cook-open]");
  if (!overlay || !openButton) return;

  const steps = [...overlay.querySelectorAll<HTMLElement>("[data-cook-step]")];
  const prev = overlay.querySelector<HTMLButtonElement>("[data-cook-prev]");
  const next = overlay.querySelector<HTMLButtonElement>("[data-cook-next]");
  const nextLabel = overlay.querySelector<HTMLElement>("[data-cook-next-label]");
  const progress = overlay.querySelector<HTMLElement>("[data-cook-progress]");
  const wakeBadge = overlay.querySelector<HTMLElement>("[data-cook-wake]");
  const swipeArea = overlay.querySelector<HTMLElement>("[data-cook-swipe]");
  let index = 0;
  let open = false;
  let wakeLock: WakeLockSentinel | null = null;

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      if (wakeBadge) wakeBadge.style.display = "";
      wakeLock.addEventListener("release", () => {
        if (wakeBadge) wakeBadge.style.display = "none";
      });
    } catch (err) {
      // Denied (battery saver, unfocused tab) — cooking still works, the screen may just dim.
      console.warn("Screen wake lock unavailable:", err);
    }
  };

  const releaseWakeLock = () => {
    wakeLock?.release().catch((err: unknown) => console.warn("Wake lock release failed:", err));
    wakeLock = null;
  };

  const dots = [...overlay.querySelectorAll<HTMLButtonElement>("[data-cook-goto]")];

  const show = (i: number) => {
    index = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((step, n) => (step.style.display = n === index ? "" : "none"));
    dots.forEach((dot, n) => {
      if (n === index) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
      if (n <= index) dot.toggleAttribute("data-seen", true);
    });
    // aria-disabled (not disabled) so focus isn't dropped when reaching the first step.
    prev?.setAttribute("aria-disabled", String(index === 0));
    const last = index === steps.length - 1;
    if (nextLabel && next) nextLabel.textContent = (last ? next.dataset.labelDone : next.dataset.labelNext) ?? "";
    // The finish slide is not a recipe step — progress reaches 100% there.
    if (progress) progress.style.width = `${(index / Math.max(1, steps.length - 1)) * 100}%`;
  };

  /**
   * The page behind cook mode — made inert so focus and screen readers stay
   * in the overlay. The overlay stays inside #recipe (servings/variant/checkbox
   * logic is scoped there), so its siblings are made inert rather than <main>.
   */
  const background = () =>
    [
      document.querySelector("body > header"),
      document.querySelector("body > footer"),
      ...[...root.children].filter((child) => child !== overlay),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement);

  const openCookMode = () => {
    open = true;
    for (const el of background()) el.inert = true;
    overlay.style.display = "flex";
    document.body.dataset.cooking = "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    for (const dot of dots) dot.removeAttribute("data-seen");
    show(0);
    void requestWakeLock();
    next?.focus();
  };

  const closeCookMode = () => {
    if (!open) return;
    open = false;
    overlay.style.display = "none";
    for (const el of background()) el.inert = false;
    delete document.body.dataset.cooking;
    document.body.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    releaseWakeLock();
    openButton.focus();
  };

  openButton.addEventListener("click", openCookMode, { signal });
  overlay.querySelector("[data-cook-close]")?.addEventListener("click", closeCookMode, { signal });
  prev?.addEventListener("click", () => index > 0 && show(index - 1), { signal });
  for (const dot of dots) {
    dot.addEventListener("click", () => show(Number(dot.dataset.cookGoto)), { signal });
  }
  next?.addEventListener(
    "click",
    () => (index === steps.length - 1 ? closeCookMode() : show(index + 1)),
    { signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!open) return;
      if (event.key === "Escape") closeCookMode();
      else if (event.key === "ArrowRight") show(index + 1);
      else if (event.key === "ArrowLeft") show(index - 1);
    },
    { signal },
  );

  let startX: number | null = null;
  let startY = 0;
  swipeArea?.addEventListener(
    "pointerdown",
    (event) => {
      startX = event.clientX;
      startY = event.clientY;
    },
    { signal },
  );
  swipeArea?.addEventListener(
    "pointerup",
    (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      startX = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
      show(dx < 0 ? index + 1 : index - 1);
    },
    { signal },
  );

  // The browser drops the wake lock whenever the tab is hidden — take it back on return.
  document.addEventListener(
    "visibilitychange",
    () => {
      if (open && document.visibilityState === "visible") void requestWakeLock();
    },
    { signal },
  );

  signal.addEventListener("abort", () => {
    if (!open) return;
    for (const el of background()) el.inert = false;
    delete document.body.dataset.cooking;
    document.body.style.overflow = "";
    releaseWakeLock();
  });
}
