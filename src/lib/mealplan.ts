import { getCollection, type CollectionEntry } from "astro:content";
import { MEALS, type Aisle, type Meal, type Unit } from "@/lib/recipe-taxonomy";
import type { Localized } from "@/lib/i18n-content";
import { getIngredients, getRecipes, totalMinutes, type Ingredient, type Recipe } from "@/lib/recipes";

type PlanEntry = CollectionEntry<"mealplans">;
type RawDay = PlanEntry["data"]["days"][number];
type RawDish = RawDay["breakfast"][number];
type Variant = Recipe["data"]["variants"][number];

/** A recipe cooked at a given scale, optionally as one of its variants. */
export interface Cooked {
  recipe: Recipe;
  variant?: Variant;
  servings: number;
}

export type Dish =
  | ({ kind: "recipe"; note?: Localized<string>; preparedOn?: string } & Cooked)
  | { kind: "leftovers"; meal: Meal; from: Cooked[]; note?: Localized<string> }
  | { kind: "note"; note: Localized<string> };

export interface PrepTask extends Cooked {
  for: string;
  note?: Localized<string>;
}

export interface PlanDay {
  date: string;
  week: string;
  meals: Record<Meal, Dish[]>;
  /** Cook-ahead tasks scheduled today for later days. */
  prep: PrepTask[];
  note?: Localized<string>;
}

let cache: Promise<PlanDay[]> | undefined;

/** All planned days, sorted by date. Throws at build time on any broken reference. */
export function getPlanDays(): Promise<PlanDay[]> {
  cache ??= load();
  return cache;
}

async function load(): Promise<PlanDay[]> {
  const [plans, recipes] = await Promise.all([getCollection("mealplans"), getRecipes()]);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const problems: string[] = [];
  const days: PlanDay[] = [];
  const seenDates = new Map<string, string>();

  for (const plan of plans) {
    const where = `src/content/mealplans/${plan.data.week}.json`;

    const cook = (
      ref: { id: string },
      variantId: string | undefined,
      servings: number | undefined,
      context: string,
    ): Cooked | undefined => {
      const recipe = recipeById.get(ref.id);
      if (!recipe) {
        problems.push(`${where}: ${context}: unknown or draft recipe "${ref.id}"`);
        return undefined;
      }
      const variant = variantId ? recipe.data.variants.find((v) => v.id === variantId) : undefined;
      if (variantId && !variant) {
        problems.push(`${where}: ${context}: recipe "${ref.id}" has no variant "${variantId}"`);
      }
      return { recipe, variant, servings: servings ?? plan.data.servings ?? recipe.data.servings };
    };

    for (const raw of plan.data.days) {
      const context = raw.date;
      if (seenDates.has(raw.date)) {
        problems.push(`${where}: ${raw.date} is also planned in ${seenDates.get(raw.date)}`);
      }
      seenDates.set(raw.date, where);
      if (isoWeek(raw.date) !== plan.data.week) {
        problems.push(`${where}: ${raw.date} is in ${isoWeek(raw.date)}, not ${plan.data.week}`);
      }

      const meals = {} as Record<Meal, Dish[]>;
      for (const meal of MEALS) {
        meals[meal] = [];
        for (const rawDish of raw[meal]) {
          const dish = resolveDish(rawDish, meal, meals, `${context} ${meal}`, cook, problems, where);
          if (dish) meals[meal].push(dish);
        }
      }

      const prep: PrepTask[] = [];
      for (const task of raw.prep) {
        if (task.for <= raw.date) {
          problems.push(`${where}: ${context} prep for ${task.for} must be for a later day`);
        }
        const cooked = cook(task.recipe, task.variant, task.servings, `${context} prep`);
        if (cooked) prep.push({ ...cooked, for: task.for, note: task.note });
      }

      days.push({ date: raw.date, week: plan.data.week, meals, prep, note: raw.note });
    }
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  // Mark dishes the chef already cooked on an earlier morning.
  for (const day of days) {
    for (const task of day.prep) {
      const target = days.find((d) => d.date === task.for);
      const dish = target && MEALS.flatMap((meal) => target.meals[meal]).find(
        (d) => d.kind === "recipe" && d.recipe.id === task.recipe.id,
      );
      if (!dish || dish.kind !== "recipe") {
        problems.push(`${day.week}: ${day.date} prepares "${task.recipe.id}" for ${task.for}, but it isn't on that day's menu`);
      } else {
        dish.preparedOn = day.date;
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Meal plan errors:\n  ${problems.join("\n  ")}`);
  }
  return days;
}

function resolveDish(
  raw: RawDish,
  meal: Meal,
  meals: Record<Meal, Dish[]>,
  context: string,
  cook: (ref: { id: string }, variant: string | undefined, servings: number | undefined, context: string) => Cooked | undefined,
  problems: string[],
  where: string,
): Dish | undefined {
  if (raw.recipe) {
    const cooked = cook(raw.recipe, raw.variant, raw.servings, context);
    return cooked && { kind: "recipe", ...cooked, note: raw.note };
  }
  if (raw.leftovers) {
    const earlier = MEALS.indexOf(raw.leftovers) < MEALS.indexOf(meal) ? meals[raw.leftovers] : [];
    const from = earlier.filter((d) => d.kind === "recipe");
    if (from.length === 0) {
      problems.push(`${where}: ${context}: leftovers of "${raw.leftovers}", but no earlier ${raw.leftovers} recipe that day`);
      return undefined;
    }
    return { kind: "leftovers", meal: raw.leftovers, from, note: raw.note };
  }
  // The schema guarantees a note when there is neither recipe nor leftovers.
  return raw.note ? { kind: "note", note: raw.note } : undefined;
}

/** ISO-8601 week ("2026-W41") of a YYYY-MM-DD date. */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "понеделник, 5 октомври" — formatted in UTC so build machines can't shift the day. */
export function formatDay(date: string, locale: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * What the chef cooks this morning, in working order: breakfast first
 * (served right away), then everything else longest-first so ovens and
 * pots start early. Dishes cooked on an earlier morning are skipped;
 * today's cook-ahead tasks are included.
 */
/** One line of the chef's work order: a meal for today or a cook-ahead task. */
export type WorkItem = Cooked & ({ meal: Meal } | { meal: "prep"; for: string });

export function cookingOrder(day: PlanDay): WorkItem[] {
  const cooked = (meal: Meal) =>
    day.meals[meal]
      .filter((d): d is Extract<Dish, { kind: "recipe" }> => d.kind === "recipe" && !d.preparedOn)
      .map((d): WorkItem => ({ recipe: d.recipe, variant: d.variant, servings: d.servings, meal }));

  const rest: WorkItem[] = [
    ...(["lunch", "snack", "dinner"] as const).flatMap(cooked),
    ...day.prep.map((task): WorkItem => ({ recipe: task.recipe, variant: task.variant, servings: task.servings, meal: "prep", for: task.for })),
  ].sort((a, b) => totalMinutes(b.recipe) - totalMinutes(a.recipe));

  return [...cooked("breakfast"), ...rest];
}

/**
 * Stable key for a work-order line — the chef's ticks are stored under it
 * (checklist `work:<date>`) and the idle screen reads them to show "Next: …".
 */
export function workKey(item: WorkItem): string {
  return `${item.meal}|${item.recipe.id}|${item.variant?.id ?? ""}`;
}

/** Prep-ahead reminders from the next day's recipes ("soak the beans tonight"). */
export function prepAheadFor(nextDay: PlanDay | undefined): Array<{ recipe: Recipe; text: Localized<string> }> {
  if (!nextDay) return [];
  return MEALS.flatMap((meal) => nextDay.meals[meal])
    .filter((d): d is Extract<Dish, { kind: "recipe" }> => d.kind === "recipe" && !d.preparedOn)
    .flatMap((d) => (d.recipe.data.prepAhead ? [{ recipe: d.recipe, text: d.recipe.data.prepAhead }] : []));
}

const BASE_UNIT: Partial<Record<Unit, [Unit, number]>> = { kg: ["g", 1000], l: ["ml", 1000] };
const LARGER_UNIT: Partial<Record<Unit, Unit>> = { g: "kg", ml: "l" };

export interface MergedLine {
  ingredient: Ingredient;
  unit: Unit;
  qty?: number;
  qtyMax?: number;
  /** Recipes that need it — shown so the chef knows where it goes. */
  recipes: Recipe[];
}

/**
 * The day's ingredients merged across every dish, scaled to plan servings:
 * same ingredient + same unit are summed, grouped by aisle.
 */
export async function mergedIngredients(list: Cooked[]): Promise<Map<Aisle, MergedLine[]>> {
  const ingredients = await getIngredients();
  const merged = new Map<string, MergedLine & { high?: number }>();

  for (const { recipe, variant, servings } of list) {
    const factor = servings / recipe.data.servings;
    const removed = new Set(variant?.remove.map((ref) => ref.id) ?? []);
    const lines = [
      ...recipe.data.ingredients.flatMap((group) => group.items),
      ...(variant?.add ?? []),
    ].filter((line) => !removed.has(line.ingredient.id) && !line.optional);

    for (const line of lines) {
      const ingredient = ingredients.get(line.ingredient.id);
      if (!ingredient) throw new Error(`Unknown ingredient "${line.ingredient.id}" in ${recipe.id}`);
      // Sum kg with g and l with ml; scaled back up for display below.
      const [unit, toBase] = BASE_UNIT[line.unit] ?? [line.unit, 1];
      const key = `${line.ingredient.id}|${unit}`;
      const entry = merged.get(key) ?? { ingredient, unit, recipes: [] };
      if (line.qty !== undefined) {
        entry.qty = (entry.qty ?? 0) + line.qty * factor * toBase;
        entry.high = (entry.high ?? 0) + (line.qtyMax ?? line.qty) * factor * toBase;
      }
      if (!entry.recipes.includes(recipe)) entry.recipes.push(recipe);
      merged.set(key, entry);
    }
  }

  const byAisle = new Map<Aisle, MergedLine[]>();
  for (const { high, ...line } of merged.values()) {
    if (high !== undefined && line.qty !== undefined && high > line.qty) line.qtyMax = high;
    const larger = LARGER_UNIT[line.unit];
    if (larger && line.qty !== undefined && line.qty >= 1000) {
      line.unit = larger;
      line.qty /= 1000;
      if (line.qtyMax !== undefined) line.qtyMax /= 1000;
    }
    const aisle = line.ingredient.data.aisle;
    byAisle.set(aisle, [...(byAisle.get(aisle) ?? []), line]);
  }
  return byAisle;
}

/** Recipe link carrying the plan's variant and servings (?v=…&s=…). */
export function dishQuery(cooked: Cooked): string {
  const params = new URLSearchParams();
  if (cooked.variant) params.set("v", cooked.variant.id);
  if (cooked.servings !== cooked.recipe.data.servings) params.set("s", String(cooked.servings));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** getStaticPaths for /plan/day/[date] — shared by every locale's route file. */
export async function dayStaticPaths() {
  return (await getPlanDays()).map((day) => ({ params: { date: day.date }, props: { day } }));
}

/** getStaticPaths for /plan/shopping/[week]. */
export async function weekStaticPaths() {
  const weeks = [...new Set((await getPlanDays()).map((day) => day.week))];
  return weeks.map((week) => ({ params: { week }, props: { week } }));
}
