/**
 * Shopping list extras:
 * - Items marked in "What I have" (the pantry page, same tablet) are greyed
 *   out with "already have" and left out of what's sent.
 * - "Send to phone": the open items as plain text, grouped by store, via the
 *   system share sheet (Viber, WhatsApp, …) — or copied to the clipboard,
 *   or shown for manual copying where neither is available (plain http).
 */
import { onPageReady } from "@/scripts/lifecycle";

const PANTRY_KEY = "tavce:pantry";

function pantry(): Set<string> {
  try {
    const raw = localStorage.getItem(PANTRY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch (err) {
    console.warn("Shopping list: could not read pantry selection:", err);
    return new Set();
  }
}

onPageReady((signal) => {
  const root = document.getElementById("shopping");
  if (!root) return;

  // Only grocery groups (the staples list lives inside <details> and is not sent).
  const groceryGroups = [...root.querySelectorAll<HTMLElement>("[data-share-group]")].filter((g) => !g.closest("details"));
  const have = pantry();
  let anyHave = false;
  for (const group of groceryGroups) {
    for (const line of group.querySelectorAll<HTMLElement>("[data-ingredient-id]")) {
      const owned = have.has(line.dataset.ingredientId ?? "");
      line.toggleAttribute("data-have", owned);
      const badge = line.querySelector<HTMLElement>("[data-have-badge]");
      if (badge) badge.style.display = owned ? "" : "none";
      anyHave ||= owned;
    }
  }
  const hint = root.querySelector<HTMLElement>("[data-have-hint]");
  if (hint) hint.style.display = anyHave ? "" : "none";

  const buildText = (): string => {
    const sections = groceryGroups.flatMap((group) => {
      const items = [...group.querySelectorAll<HTMLElement>("[data-share-line]")]
        .filter((line) => !line.hasAttribute("data-have"))
        .filter((line) => !line.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked)
        .map((line) => `• ${line.dataset.shareLine}`);
      return items.length > 0 ? [`${(group.dataset.shareGroup ?? "").toLocaleUpperCase(document.documentElement.lang)}\n${items.join("\n")}`] : [];
    });
    return [root.dataset.shareTitle ?? "", ...sections].join("\n\n");
  };

  const status = root.querySelector<HTMLElement>("[data-share-status]");
  const manual = root.querySelector<HTMLElement>("[data-share-manual]");

  root.querySelector("[data-share]")?.addEventListener(
    "click",
    async () => {
      const text = buildText();
      if (status) status.style.display = "none";
      if (manual) manual.style.display = "none";

      if (navigator.share) {
        try {
          await navigator.share({ title: root.dataset.shareTitle, text });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return; // user closed the sheet
          console.warn("Share failed, falling back to copy:", err);
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.style.display = "";
      } catch (err) {
        console.warn("Clipboard unavailable, showing text for manual copy:", err);
        const area = manual?.querySelector("textarea");
        if (manual && area) {
          area.value = text;
          manual.style.display = "";
          area.select();
        }
      }
    },
    { signal },
  );
});
