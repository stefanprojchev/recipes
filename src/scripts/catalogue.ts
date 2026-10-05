/**
 * Recipe catalogue filtering: search (any language/script), category,
 * meal, quick (≤30 min) and diet. Filters live in the query string
 * (?q=&c=&m=&quick=1&d=fasting) so links from the home page and the back
 * button restore them.
 */
import { onPageReady } from "@/scripts/lifecycle";
import { normalizeForSearch } from "@/lib/search-normalize";

const QUICK_MINUTES = 30;

interface Filters {
  q: string;
  category: string;
  meal: string;
  quick: boolean;
  diets: Set<string>;
  tags: Set<string>;
}

function readFilters(): Filters {
  const params = new URL(location.href).searchParams;
  return {
    q: params.get("q") ?? "",
    category: params.get("c") ?? "",
    meal: params.get("m") ?? "",
    quick: params.get("quick") === "1",
    diets: new Set(params.getAll("d")),
    tags: new Set(params.getAll("t")),
  };
}

function writeFilters(filters: Filters) {
  const url = new URL(location.href);
  url.search = "";
  if (filters.q) url.searchParams.set("q", filters.q);
  if (filters.category) url.searchParams.set("c", filters.category);
  if (filters.meal) url.searchParams.set("m", filters.meal);
  if (filters.quick) url.searchParams.set("quick", "1");
  for (const diet of filters.diets) url.searchParams.append("d", diet);
  for (const tag of filters.tags) url.searchParams.append("t", tag);
  history.replaceState(history.state, "", url);
}

onPageReady((signal) => {
  const root = document.getElementById("catalogue");
  if (!root) return;

  const search = root.querySelector<HTMLInputElement>("[data-filter-search]");
  const cards = [...root.querySelectorAll<HTMLElement>("[data-recipe-card]")];
  const empty = root.querySelector<HTMLElement>("[data-empty]");
  const count = root.querySelector<HTMLElement>("[data-result-count]");
  const categoryChips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter-category]")];
  const mealChips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter-meal]")];
  const dietChips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter-diet]")];
  const quickChip = root.querySelector<HTMLButtonElement>("[data-filter-quick]");
  const tagChips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter-tag]")];

  const filters = readFilters();
  if (search) search.value = filters.q;

  const apply = () => {
    const terms = normalizeForSearch(filters.q).split(" ").filter(Boolean);
    let visible = 0;

    for (const card of cards) {
      const haystack = card.dataset.search ?? "";
      const diets = (card.dataset.diet ?? "").split(" ");
      const tags = (card.dataset.tags ?? "").split(" ");
      const match =
        terms.every((term) => haystack.includes(term)) &&
        (!filters.category || card.dataset.category === filters.category) &&
        (!filters.meal || (card.dataset.meals ?? "").split(" ").includes(filters.meal)) &&
        (!filters.quick || Number(card.dataset.minutes) <= QUICK_MINUTES) &&
        [...filters.diets].every((diet) => diets.includes(diet)) &&
        [...filters.tags].every((tag) => tags.includes(tag));
      card.style.display = match ? "" : "none";
      if (match) visible++;
    }

    if (empty) empty.style.display = visible === 0 ? "" : "none";
    if (count?.dataset.countTemplate) {
      count.textContent = count.dataset.countTemplate.replace("{count}", String(visible));
    }

    for (const chip of categoryChips) {
      chip.setAttribute("aria-pressed", String(chip.dataset.filterCategory === filters.category));
    }
    for (const chip of mealChips) {
      chip.setAttribute("aria-pressed", String(chip.dataset.filterMeal === filters.meal));
    }
    for (const chip of dietChips) {
      chip.setAttribute("aria-pressed", String(filters.diets.has(chip.dataset.filterDiet ?? "")));
    }
    quickChip?.setAttribute("aria-pressed", String(filters.quick));
    for (const chip of tagChips) {
      chip.setAttribute("aria-pressed", String(filters.tags.has(chip.dataset.filterTag ?? "")));
    }

    writeFilters(filters);
  };

  search?.addEventListener(
    "input",
    () => {
      filters.q = search.value;
      apply();
    },
    { signal },
  );

  for (const chip of categoryChips) {
    chip.addEventListener(
      "click",
      () => {
        filters.category = chip.dataset.filterCategory ?? "";
        apply();
      },
      { signal },
    );
  }
  for (const chip of mealChips) {
    chip.addEventListener(
      "click",
      () => {
        const meal = chip.dataset.filterMeal ?? "";
        filters.meal = filters.meal === meal ? "" : meal;
        apply();
      },
      { signal },
    );
  }
  for (const chip of dietChips) {
    chip.addEventListener(
      "click",
      () => {
        const diet = chip.dataset.filterDiet ?? "";
        if (filters.diets.has(diet)) filters.diets.delete(diet);
        else filters.diets.add(diet);
        apply();
      },
      { signal },
    );
  }
  for (const chip of tagChips) {
    chip.addEventListener(
      "click",
      () => {
        const tag = chip.dataset.filterTag ?? "";
        if (filters.tags.has(tag)) filters.tags.delete(tag);
        else filters.tags.add(tag);
        apply();
      },
      { signal },
    );
  }
  quickChip?.addEventListener(
    "click",
    () => {
      filters.quick = !filters.quick;
      apply();
    },
    { signal },
  );
  root.querySelector("[data-filter-clear]")?.addEventListener(
    "click",
    () => {
      Object.assign(filters, { q: "", category: "", meal: "", quick: false, diets: new Set(), tags: new Set() });
      if (search) search.value = "";
      apply();
    },
    { signal },
  );

  apply();
});
