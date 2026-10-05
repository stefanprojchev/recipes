/** Header quick-timer popover: open/close, close after a preset, custom minutes. */
import { onPageReady } from "@/scripts/lifecycle";
import { startTimer } from "@/scripts/timers";

onPageReady((signal) => {
  const root = document.querySelector<HTMLElement>("[data-quick-timers]");
  const toggle = root?.querySelector<HTMLButtonElement>("[data-quick-toggle]");
  const panel = root?.querySelector<HTMLElement>("[data-quick-panel]");
  const form = root?.querySelector<HTMLFormElement>("[data-quick-custom]");
  if (!root || !toggle || !panel) return;

  const setOpen = (open: boolean, restoreFocus = false) => {
    panel.style.display = open ? "" : "none";
    toggle.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector<HTMLButtonElement>("[data-quick-preset]")?.focus();
    else if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => setOpen(panel.style.display === "none"), { signal });

  // Presets start through timers.ts's [data-timer-start] handler; just close the panel.
  for (const preset of panel.querySelectorAll("[data-quick-preset]")) {
    preset.addEventListener("click", () => setOpen(false), { signal });
  }

  form?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const input = form.elements.namedItem("minutes");
      const minutes = input instanceof HTMLInputElement ? Math.round(Number(input.value)) : NaN;
      if (!Number.isFinite(minutes) || minutes < 1) return;
      startTimer((form.dataset.labelTemplate ?? "").replace("{minutes}", String(minutes)), minutes);
      form.reset();
      setOpen(false);
    },
    { signal },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (panel.style.display !== "none" && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && panel.style.display !== "none") setOpen(false, true);
    },
    { signal },
  );
});
