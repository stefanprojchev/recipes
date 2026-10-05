import { t } from "@/lib/i18n-content";
import { leftoversLabel } from "@/lib/labels";
import type { Locale } from "@/lib/locale";
import type { Dish } from "@/lib/mealplan";

/** One-line text for a planned dish: "Зелник · Со праз", "Остатоци од ручек", a note. */
export function dishText(dish: Dish, locale: Locale): string {
  if (dish.kind === "recipe") {
    const title = t(dish.recipe.data.title, locale);
    return dish.variant ? `${title} · ${t(dish.variant.name, locale)}` : title;
  }
  if (dish.kind === "leftovers") return leftoversLabel(dish.meal, locale);
  return t(dish.note, locale);
}
