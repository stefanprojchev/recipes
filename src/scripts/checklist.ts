/**
 * Persistent checklists: inside `[data-checklist="<key>"]`, every
 * `input[data-checklist-item]` remembers its checked state in localStorage
 * under that key (e.g. the chef's ingredients for a day, a week's shopping).
 * A `[data-checklist-reset]` button inside the container clears it.
 */
import { onPageReady } from "@/scripts/lifecycle";

const PREFIX = "tavce:checklist:";

function load(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch (err) {
    console.warn(`Could not restore checklist "${key}":`, err);
    return new Set();
  }
}

function save(key: string, checked: Set<string>) {
  try {
    if (checked.size === 0) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify([...checked]));
  } catch (err) {
    console.warn(`Could not save checklist "${key}":`, err);
  }
}

onPageReady((signal) => {
  for (const list of document.querySelectorAll<HTMLElement>("[data-checklist]")) {
    const key = list.dataset.checklist;
    if (!key) {
      console.error("data-checklist needs a key:", list);
      continue;
    }
    const checked = load(key);
    const boxes = [...list.querySelectorAll<HTMLInputElement>("input[data-checklist-item]")];
    for (const box of boxes) box.checked = checked.has(box.dataset.checklistItem ?? "");

    list.addEventListener(
      "change",
      (event) => {
        const box = event.target;
        if (!(box instanceof HTMLInputElement) || !box.dataset.checklistItem) return;
        if (box.checked) checked.add(box.dataset.checklistItem);
        else checked.delete(box.dataset.checklistItem);
        save(key, checked);
      },
      { signal },
    );

    list.querySelector("[data-checklist-reset]")?.addEventListener(
      "click",
      () => {
        checked.clear();
        for (const box of boxes) box.checked = false;
        save(key, checked);
      },
      { signal },
    );
  }
});
