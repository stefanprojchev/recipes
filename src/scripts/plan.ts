/**
 * Everything that depends on today's date. The site is built once a week,
 * so "today" must be decided on the tablet, not at build time:
 * - home: show the `[data-today-panel]` for today (or the "no menu" note)
 * - week view: open the week containing today, prev/next week buttons,
 *   highlight today's row
 * - day sheet: show the "Today" badge when it is today's sheet
 */
import { onPageReady } from "@/scripts/lifecycle";

/** Local calendar date as YYYY-MM-DD (the tablet's timezone, not UTC). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

onPageReady((signal) => {
  const today = localToday();

  // Home: today's menu card.
  const panels = [...document.querySelectorAll<HTMLElement>("[data-today-panel]")];
  if (panels.length > 0 || document.querySelector("[data-today-none]")) {
    const match = panels.find((panel) => panel.dataset.todayPanel === today);
    for (const panel of panels) panel.style.display = panel === match ? "" : "none";
    const none = document.querySelector<HTMLElement>("[data-today-none]");
    if (none) none.style.display = match ? "none" : "";
  }

  // Home (landscape): tomorrow's menu preview.
  const tomorrowPanels = [...document.querySelectorAll<HTMLElement>("[data-tomorrow-panel]")];
  if (tomorrowPanels.length > 0 || document.querySelector("[data-tomorrow-none]")) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const tomorrow = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const match = tomorrowPanels.find((panel) => panel.dataset.tomorrowPanel === tomorrow);
    for (const panel of tomorrowPanels) panel.style.display = panel === match ? "" : "none";
    const none = document.querySelector<HTMLElement>("[data-tomorrow-none]");
    if (none) none.style.display = match ? "none" : "";
  }

  // Day sheet: "Cooked 2 of 5" under the work order (ticks persist via checklist.ts).
  const workList = document.querySelector<HTMLElement>("[data-work-list]");
  const progress = document.querySelector<HTMLElement>("[data-work-progress]");
  if (workList && progress) {
    const update = () => {
      const done = workList.querySelectorAll("input[data-checklist-item]:checked").length;
      progress.textContent = (progress.dataset.template ?? "")
        .replace("{done}", String(done))
        .replace("{total}", progress.dataset.total ?? "0");
    };
    workList.addEventListener("change", update, { signal });
    // checklist.ts restores the saved ticks on the same page-load event — read them after it.
    queueMicrotask(update);
  }

  // Day sheet: "Today" badge.
  const sheet = document.querySelector<HTMLElement>("[data-plan-date]");
  const badge = document.querySelector<HTMLElement>("[data-today-badge]");
  if (sheet && badge) badge.style.display = sheet.dataset.planDate === today ? "" : "none";

  // Week view.
  for (const row of document.querySelectorAll<HTMLElement>("[data-day-row]")) {
    row.toggleAttribute("data-today", row.dataset.dayRow === today);
  }
  const weeks = [...document.querySelectorAll<HTMLElement>("[data-week-section]")];
  if (weeks.length === 0) return;

  const show = (index: number) => {
    weeks.forEach((week, i) => (week.style.display = i === index ? "" : "none"));
  };
  // The week containing today; otherwise the next upcoming one; otherwise the latest.
  let current = weeks.findIndex((w) => (w.dataset.start ?? "") <= today && today <= (w.dataset.end ?? ""));
  if (current === -1) current = weeks.findIndex((w) => (w.dataset.start ?? "") > today);
  if (current === -1) current = weeks.length - 1;
  show(current);

  // The clicked button disappears with its week — move focus to the same button in the new one.
  const go = (to: number, which: "prev" | "next") => {
    show(to);
    weeks[to]?.querySelector<HTMLButtonElement>(`[data-week-${which}]:not([disabled])`)?.focus();
  };
  for (const [i, week] of weeks.entries()) {
    week.querySelector("[data-week-prev]")?.addEventListener("click", () => go(i - 1, "prev"), { signal });
    week.querySelector("[data-week-next]")?.addEventListener("click", () => go(i + 1, "next"), { signal });
  }
});
