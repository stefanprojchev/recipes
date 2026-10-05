import * as m from "@/paraglide/messages.js";
import type { Locale } from "@/lib/locale";
import type { Aisle, Category, Diet, Difficulty, Meal, Season, Store, Tag, Unit } from "@/lib/recipe-taxonomy";

type MessageFn = (inputs?: Record<string, never>, options?: { locale?: Locale }) => string;

/**
 * Looks up a taxonomy label such as `category_soup` or `unit_to_taste_one`.
 * Hyphens become underscores (message keys must be identifiers). Throws on a
 * missing key so a new enum value without a message fails the build.
 */
function label(key: string, locale: Locale): string {
  const fn = (m as unknown as Record<string, MessageFn | undefined>)[key.replace(/-/g, "_")];
  if (typeof fn !== "function") {
    throw new Error(`Missing Paraglide message "${key}" — add it to every messages/{locale}.json`);
  }
  return fn({}, { locale });
}

export const categoryLabel = (value: Category, locale: Locale) => label(`category_${value}`, locale);
export const mealLabel = (value: Meal, locale: Locale) => label(`meal_${value}`, locale);
export const dietLabel = (value: Diet, locale: Locale) => label(`diet_${value}`, locale);
export const seasonLabel = (value: Season, locale: Locale) => label(`season_${value}`, locale);
export const difficultyLabel = (value: Difficulty, locale: Locale) =>
  label(`difficulty_${value}`, locale);
export const storeLabel = (value: Store, locale: Locale) => label(`store_${value}`, locale);
export const tagLabel = (value: Tag, locale: Locale) => label(`tag_${value}`, locale);
export const aisleLabel = (value: Aisle, locale: Locale) => label(`aisle_${value}`, locale);
export const leftoversLabel = (value: Meal, locale: Locale) => label(`leftovers_${value}`, locale);
export const unitLabel = (value: Unit, form: "one" | "other", locale: Locale) =>
  label(`unit_${value}_${form}`, locale);

/** "45 мин", "2 ч", "1 ч 30 мин". */
export function formatDuration(totalMinutes: number, locale: Locale): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return m.time_minutes({ minutes }, { locale });
  if (minutes === 0) return m.time_hours({ hours }, { locale });
  return m.time_hours_minutes({ hours, minutes }, { locale });
}
