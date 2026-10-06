import { getCollection } from "astro:content";
import * as m from "@/paraglide/messages.js";
import { t } from "@/lib/i18n-content";
import { tagLabel } from "@/lib/labels";
import type { Locale } from "@/lib/locale";
import { getIngredients, ingredientName, type Recipe } from "@/lib/recipes";

type Variant = Recipe["data"]["variants"][number];

let cache: Promise<Awaited<ReturnType<typeof getCollection<"household">>>> | undefined;

/** Household members; unknown avoided ingredient ids fail the build. */
async function getHousehold() {
  cache ??= (async () => {
    const [members, ingredients] = await Promise.all([getCollection("household"), getIngredients()]);
    for (const member of members) {
      for (const ref of member.data.avoid) {
        if (!ingredients.has(ref.id)) {
          throw new Error(`src/content/household.yaml: "${member.id}" avoids unknown ingredient "${ref.id}"`);
        }
      }
    }
    return members;
  })();
  return cache;
}

/**
 * Warnings for a dish as cooked (variant applied): "Детето: луто",
 * "Детето: модар патлиџан". Empty when everyone can eat it.
 */
export async function householdWarnings(recipe: Recipe, variant: Variant | undefined, locale: Locale): Promise<string[]> {
  const [members, ingredients] = await Promise.all([getHousehold(), getIngredients()]);
  const removed = new Set(variant?.remove.map((ref) => ref.id) ?? []);
  const used = new Set(
    [...recipe.data.ingredients.flatMap((group) => group.items), ...(variant?.add ?? [])]
      .map((line) => line.ingredient.id)
      .filter((id) => !removed.has(id)),
  );

  const tags = new Set([...recipe.data.tags, ...(variant?.tags ?? [])]);

  const warnings: string[] = [];
  for (const member of members) {
    const who = t(member.data.name, locale);
    for (const tag of member.data.avoidTags) {
      if (tags.has(tag)) {
        warnings.push(m.household_warning({ who, reason: tagLabel(tag, locale).toLowerCase() }, { locale }));
      }
    }
    for (const ref of member.data.avoid) {
      const ingredient = ingredients.get(ref.id);
      if (ingredient && used.has(ref.id)) {
        warnings.push(m.household_warning({ who, reason: ingredientName(ingredient, locale, "other") }, { locale }));
      }
    }
  }
  return warnings;
}
