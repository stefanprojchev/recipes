import type { Category } from "@/lib/recipe-taxonomy";

/** OKLCH hue per category — tints placeholders and category tiles. */
export const CATEGORY_HUE: Record<Category, number> = {
  breakfast: 85,
  soup: 45,
  salad: 140,
  main: 30,
  side: 110,
  pastry: 70,
  bread: 60,
  dessert: 350,
  snack: 15,
  spread: 25,
  preserves: 5,
  drink: 220,
};
