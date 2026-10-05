/**
 * Fixed vocabularies for recipes. Every value has a matching Paraglide
 * message (`category_<value>`, `meal_<value>`, `unit_<value>_one|other`, …)
 * — add both together, or the label lookup throws at build time.
 */

export const CATEGORIES = [
  "breakfast",
  "soup",
  "salad",
  "main",
  "side",
  "pastry",
  "bread",
  "dessert",
  "snack",
  "spread",
  "preserves",
  "drink",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Meal slots for the weekly planner. Dinner is optional in a plan. */
export const MEALS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** `fasting` = Orthodox fast (посно): no meat, dairy or eggs. */
export const DIETS = ["vegetarian", "vegan", "fasting", "gluten-free"] as const;
export type Diet = (typeof DIETS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** Grocery-store sections, in walking order — groups the shopping list. */
export const AISLES = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "dry",
  "spices",
  "canned",
  "frozen",
  "other",
] as const;
export type Aisle = (typeof AISLES)[number];

export const UNITS = [
  "pc",
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "glass",
  "clove",
  "head",
  "bunch",
  "slice",
  "pinch",
  "can",
  "pack",
  "to-taste",
] as const;
export type Unit = (typeof UNITS)[number];

/** Units measured by weight/volume — scaled values are rounded, not shown as fractions. */
export const METRIC_UNITS: ReadonlySet<Unit> = new Set(["g", "kg", "ml", "l"]);

/** Where an ingredient is bought — groups the shopping list. Default by aisle in STORE_FOR_AISLE. */
export const STORES = ["market", "butcher", "bakery", "supermarket"] as const;
export type Store = (typeof STORES)[number];

export const STORE_FOR_AISLE: Record<Aisle, Store> = {
  produce: "market",
  meat: "butcher",
  dairy: "supermarket",
  bakery: "bakery",
  dry: "supermarket",
  spices: "supermarket",
  canned: "supermarket",
  frozen: "supermarket",
  other: "supermarket",
};

/** Recipe flags that household members can avoid (see src/content/household.yaml). */
export const TAGS = ["kid-friendly", "spicy"] as const;
export type Tag = (typeof TAGS)[number];
