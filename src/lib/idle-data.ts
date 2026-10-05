import { localizeHref } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";
import { t } from "@/lib/i18n-content";
import { mealLabel } from "@/lib/labels";
import { dishText } from "@/lib/dish-text";
import type { Locale } from "@/lib/locale";
import { addDays, cookingOrder, formatDay, getPlanDays, prepAheadFor, workKey } from "@/lib/mealplan";
import { MEALS, type Meal } from "@/lib/recipe-taxonomy";

export interface IdleDay {
  title: string;
  href: string;
  meals: Array<{ meal: Meal; label: string; items: string[] }>;
  /** Things the chef does today for later days. */
  prep: string[];
  /** Today's work order — the idle screen shows the first item not ticked off. */
  work: Array<{ key: string; title: string }>;
}

/**
 * Pre-rendered strings for the idle kitchen screen, keyed by date. The site
 * is rebuilt weekly, so it covers a week back to four weeks ahead; the tablet
 * picks today/tomorrow itself (src/scripts/idle.ts).
 */
export async function idleData(locale: Locale): Promise<{ days: Record<string, IdleDay> }> {
  const all = await getPlanDays();
  const buildDay = new Date().toISOString().slice(0, 10);
  const from = addDays(buildDay, -7);
  const to = addDays(buildDay, 28);

  const days: Record<string, IdleDay> = {};
  for (const day of all) {
    if (day.date < from || day.date > to) continue;
    const tomorrow = all.find((d) => d.date === addDays(day.date, 1));
    days[day.date] = {
      title: formatDay(day.date, locale),
      href: localizeHref(`/plan/day/${day.date}`, { locale }),
      meals: MEALS.filter((meal) => day.meals[meal].length > 0).map((meal) => ({
        meal,
        label: mealLabel(meal, locale),
        items: day.meals[meal].map((dish) => dishText(dish, locale)),
      })),
      prep: [
        ...day.prep.map(
          (task) =>
            `${m.day_cook_ahead({ day: formatDay(task.for, locale, "short") }, { locale })}: ${t(task.recipe.data.title, locale)}`,
        ),
        ...prepAheadFor(tomorrow).map(({ recipe, text }) => `${t(recipe.data.title, locale)}: ${t(text, locale)}`),
      ],
      work: cookingOrder(day).map((item) => ({ key: workKey(item), title: t(item.recipe.data.title, locale) })),
    };
  }
  return { days };
}
