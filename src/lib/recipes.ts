import { getCollection, type CollectionEntry } from "astro:content";
import { LOCALES, type Locale } from "@/lib/locale";
import { t } from "@/lib/i18n-content";
import { pluralForm } from "@/lib/quantity";
import { normalizeForSearch } from "@/lib/search-normalize";
import { categoryLabel, dietLabel } from "@/lib/labels";
import { getMediaMap } from "@/lib/media";

export type Recipe = CollectionEntry<"recipes">;
export type Ingredient = CollectionEntry<"ingredients">;
export type IngredientLine = Recipe["data"]["ingredients"][number]["items"][number];

let cache: Promise<{ recipes: Recipe[]; ingredients: Map<string, Ingredient> }> | undefined;

/**
 * Loads and cross-checks all content once per build. Astro's `reference()`
 * only validates lazily, so a typo in an ingredient id or `variantOf` would
 * otherwise render as a silent gap — here it fails the build instead.
 */
function load() {
  cache ??= (async () => {
    const [allRecipes, allIngredients, mediaMap] = await Promise.all([
      getCollection("recipes"),
      getCollection("ingredients"),
      getMediaMap(),
    ]);
    const ingredients = new Map(allIngredients.map((entry) => [entry.id, entry]));
    const recipeIds = new Set(allRecipes.map((entry) => entry.id));
    const problems: string[] = [];

    for (const recipe of allRecipes) {
      const where = `src/content/recipes/${recipe.id}.yaml`;
      const lines = [
        ...recipe.data.ingredients.flatMap((group) => group.items),
        ...recipe.data.variants.flatMap((variant) => variant.add),
      ];
      for (const line of lines) {
        if (!ingredients.has(line.ingredient.id)) {
          problems.push(`${where}: unknown ingredient "${line.ingredient.id}"`);
        }
      }
      for (const variant of recipe.data.variants) {
        for (const ref of variant.remove) {
          if (!ingredients.has(ref.id)) {
            problems.push(`${where}: variant "${variant.id}" removes unknown ingredient "${ref.id}"`);
          }
        }
      }
      const { cover, gallery, steps } = recipe.data;
      if (cover) {
        const media = mediaMap.get(cover.id);
        if (!media) problems.push(`${where}: unknown cover media "${cover.id}"`);
        else if (media.data.type !== "image") problems.push(`${where}: cover "${cover.id}" must be an image`);
      }
      for (const ref of [...gallery, ...steps.flatMap((step) => (step.media ? [step.media] : []))]) {
        if (!mediaMap.has(ref.id)) problems.push(`${where}: unknown media "${ref.id}"`);
      }
      for (const side of recipe.data.sides) {
        if (!recipeIds.has(side.id)) problems.push(`${where}: sides lists unknown recipe "${side.id}"`);
        if (side.id === recipe.id) problems.push(`${where}: a recipe can't be its own side`);
      }
      const parent = recipe.data.variantOf;
      if (parent && !recipeIds.has(parent.id)) {
        problems.push(`${where}: variantOf points to unknown recipe "${parent.id}"`);
      }
    }

    if (problems.length > 0) {
      throw new Error(`Recipe content errors:\n  ${problems.join("\n  ")}`);
    }

    return { recipes: allRecipes.filter((recipe) => !recipe.data.draft), ingredients };
  })();
  return cache;
}

export async function getRecipes(): Promise<Recipe[]> {
  return (await load()).recipes;
}

export async function getIngredients(): Promise<Map<string, Ingredient>> {
  return (await load()).ingredients;
}

export function sortByTitle(recipes: Recipe[], locale: Locale): Recipe[] {
  return [...recipes].sort((a, b) =>
    t(a.data.title, locale).localeCompare(t(b.data.title, locale), locale),
  );
}

export function totalMinutes(recipe: Recipe): number {
  const { prep, cook, rest } = recipe.data.time;
  return prep + cook + rest;
}

/** Ingredient name for display: count-aware for whole items ("2 јајца"). */
export function ingredientName(
  ingredient: Ingredient,
  locale: Locale,
  form: "one" | "other",
): string {
  const name = t(ingredient.data.name, locale);
  return typeof name === "string" ? name : name[form];
}

/** Both plural forms, for the client-side scaler's data attributes. */
export function ingredientNameForms(ingredient: Ingredient, locale: Locale) {
  return { one: ingredientName(ingredient, locale, "one"), other: ingredientName(ingredient, locale, "other") };
}

/** Whole items ("pc") agree with their count; other units take the "other" form. */
export function nameFormFor(line: IngredientLine, factor: number, locale: Locale): "one" | "other" {
  if (line.unit !== "pc" || line.qty === undefined) return "other";
  return pluralForm((line.qtyMax ?? line.qty) * factor, locale);
}

/**
 * Normalized search text for a recipe across every locale: titles,
 * summaries, ingredient names and category/diet labels — so a search in
 * either language or script finds it.
 */
export function searchText(recipe: Recipe, ingredients: Map<string, Ingredient>): string {
  const parts: string[] = [];
  for (const locale of LOCALES) {
    parts.push(t(recipe.data.title, locale), t(recipe.data.summary, locale));
    parts.push(categoryLabel(recipe.data.category, locale));
    for (const diet of recipe.data.diet) parts.push(dietLabel(diet, locale));
    for (const group of recipe.data.ingredients) {
      for (const line of group.items) {
        const ingredient = ingredients.get(line.ingredient.id);
        if (ingredient) parts.push(...Object.values(ingredientNameForms(ingredient, locale)));
      }
    }
  }
  return normalizeForSearch(parts.join(" "));
}

/** getStaticPaths for /recipes/[slug] — shared by every locale's route file. */
export async function recipeStaticPaths() {
  return (await getRecipes()).map((recipe) => ({ params: { slug: recipe.id }, props: { recipe } }));
}
