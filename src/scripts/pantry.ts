/**
 * "What do I have?" — tap the ingredients you have, get recipes grouped by
 * how many required ingredients are missing (0, 1, 2–3). A recipe's
 * variants count too: no spinach but leek → "Зелник, with leek". The
 * selection is remembered on the tablet; staples start selected.
 */
import { onPageReady } from "@/scripts/lifecycle";
import { normalizeForSearch } from "@/lib/search-normalize";

const STORAGE_KEY = "tavce:pantry";
const MAX_MISSING = 3;

interface PantryData {
  staples: string[];
  names: Record<string, string>;
  recipes: Array<{ id: string; options: Array<{ variant: string; name: string; needs: string[] }> }>;
}

function loadSelection(staples: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch (err) {
    console.warn("Could not restore pantry selection:", err);
  }
  return new Set(staples);
}

function saveSelection(selected: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
  } catch (err) {
    console.warn("Could not save pantry selection:", err);
  }
}

onPageReady((signal) => {
  const root = document.getElementById("pantry");
  const dataEl = document.getElementById("pantry-data");
  if (!root || !dataEl) return;

  let data: PantryData;
  try {
    data = JSON.parse(dataEl.textContent ?? "") as PantryData;
  } catch (err) {
    console.error("Pantry data is not valid JSON:", err);
    return;
  }

  const staples = new Set(data.staples);
  const selected = loadSelection(data.staples);
  const chips = [...root.querySelectorAll<HTMLButtonElement>("[data-ingredient]")];
  const pool = root.querySelector<HTMLElement>("[data-result-pool]");
  const prompt = root.querySelector<HTMLElement>("[data-pantry-prompt]");
  const none = root.querySelector<HTMLElement>("[data-pantry-none]");
  const count = root.querySelector<HTMLElement>("[data-selected-count]");
  const recipesHref = root.dataset.recipesHref ?? "/recipes";
  const groups = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-result-group]")].map((g) => [g.dataset.resultGroup ?? "", g]),
  );
  const cards = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-pantry-recipe]")].map((c) => [c.dataset.pantryRecipe ?? "", c]),
  );

  const render = () => {
    for (const chip of chips) {
      chip.setAttribute("aria-pressed", String(selected.has(chip.dataset.ingredient ?? "")));
    }
    const picked = [...selected].filter((id) => !staples.has(id));
    if (count) count.textContent = (root.dataset.labelSelected ?? "").replace("{count}", String(picked.length));

    // Score every recipe by its best option (base or a variant).
    const results = data.recipes.flatMap((recipe) => {
      const scored = recipe.options.map((option) => ({
        ...option,
        missing: option.needs.filter((id) => !selected.has(id)),
        matched: option.needs.filter((id) => selected.has(id) && !staples.has(id)).length,
      }));
      scored.sort((a, b) => a.missing.length - b.missing.length || b.matched - a.matched);
      const best = scored[0];
      // Must use at least one thing you picked — staples alone don't count.
      if (!best || best.matched === 0 || best.missing.length > MAX_MISSING) return [];
      return [{ id: recipe.id, ...best }];
    });
    results.sort((a, b) => a.missing.length - b.missing.length || b.matched - a.matched);

    if (pool) for (const card of cards.values()) pool.append(card);
    for (const group of groups.values()) group.style.display = "none";

    for (const result of results) {
      const key = result.missing.length === 0 ? "0" : result.missing.length === 1 ? "1" : "few";
      const group = groups.get(key);
      const card = cards.get(result.id);
      if (!group || !card) continue;
      group.style.display = "";
      group.querySelector("[data-result-list]")?.append(card);

      const link = card.querySelector<HTMLAnchorElement>("a");
      if (link) {
        link.href = `${recipesHref}/${result.id}${result.variant ? `?v=${encodeURIComponent(result.variant)}` : ""}`;
      }
      const variant = card.querySelector<HTMLElement>("[data-pantry-variant]");
      if (variant) {
        variant.textContent = result.variant ? (root.dataset.labelVariant ?? "").replace("{variant}", result.name) : "";
        variant.style.display = result.variant ? "" : "none";
      }
      const missing = card.querySelector<HTMLElement>("[data-pantry-missing]");
      if (missing) {
        const names = result.missing.map((id) => data.names[id] ?? id).join(", ");
        missing.textContent = names ? (root.dataset.labelMissing ?? "").replace("{items}", names) : "";
        missing.style.display = names ? "" : "none";
      }
    }

    if (prompt) prompt.style.display = picked.length === 0 ? "" : "none";
    if (none) none.style.display = picked.length > 0 && results.length === 0 ? "" : "none";

    const ready = results.filter((r) => r.missing.length === 0).length;
    const summaryText = (root.dataset.labelSummary ?? "")
      .replace("{ready}", String(ready))
      .replace("{close}", String(results.length - ready));
    const summary = root.querySelector<HTMLElement>("[data-pantry-summary]");
    if (summary) summary.textContent = picked.length > 0 ? summaryText : "";
    const jump = root.querySelector<HTMLElement>("[data-pantry-jump]");
    const jumpText = root.querySelector<HTMLElement>("[data-pantry-jump-text]");
    if (jump) jump.style.display = picked.length > 0 ? "" : "none";
    if (jumpText) jumpText.textContent = summaryText;
  };

  for (const chip of chips) {
    chip.addEventListener(
      "click",
      () => {
        const id = chip.dataset.ingredient ?? "";
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        saveSelection(selected);
        render();
      },
      { signal },
    );
  }

  root.querySelector("[data-pantry-reset]")?.addEventListener(
    "click",
    () => {
      selected.clear();
      for (const id of data.staples) selected.add(id);
      saveSelection(selected);
      render();
    },
    { signal },
  );

  const filter = root.querySelector<HTMLInputElement>("[data-chip-filter]");
  filter?.addEventListener(
    "input",
    () => {
      const query = normalizeForSearch(filter.value);
      for (const chip of chips) {
        chip.style.display = !query || (chip.dataset.search ?? "").includes(query) ? "" : "none";
      }
      for (const group of root.querySelectorAll<HTMLElement>("[data-chip-group]")) {
        const anyVisible = [...group.querySelectorAll<HTMLElement>("[data-ingredient]")].some((c) => c.style.display !== "none");
        group.style.display = anyVisible ? "" : "none";
      }
    },
    { signal },
  );

  render();
});
