import { defineCollection, reference } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/locale";
import {
  AISLES,
  CATEGORIES,
  DIETS,
  DIFFICULTIES,
  MEALS,
  SEASONS,
  STORES,
  TAGS,
  UNITS,
} from "@/lib/recipe-taxonomy";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    publishedDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

/**
 * Translated text: `{ mk: "...", en: "..." }`. The default locale is
 * required; other locales are optional and fall back to it (see `t()` in
 * src/lib/i18n-content.ts).
 */
function localized<T extends z.ZodType>(inner: T) {
  return z
    .partialRecord(z.enum(LOCALES), inner)
    .refine((value) => value[DEFAULT_LOCALE] !== undefined, {
      message: `Missing "${DEFAULT_LOCALE}" text`,
    });
}

const text = localized(z.string().min(1));

/** A name that changes with count: "1 јајце" / "2 јајца". */
const pluralName = z.union([
  z.string().min(1),
  z.object({ one: z.string().min(1), other: z.string().min(1) }),
]);

/**
 * Shared ingredient dictionary. Recipes reference ingredients by id, so the
 * same item merges across recipes (weekly shopping list) and search matches
 * it in every language.
 */
const ingredients = defineCollection({
  loader: file("src/content/ingredients.yaml"),
  schema: z.object({
    name: localized(pluralName),
    aisle: z.enum(AISLES),
    /** Where it's bought, when it differs from the aisle's default (e.g. cheese from the market). */
    store: z.enum(STORES).optional(),
    /** Pantry staple (salt, oil, water) — left off shopping lists. */
    staple: z.boolean().default(false),
    /** Months (1–12) it's in season locally; omit for all-year items. */
    months: z.array(z.number().int().min(1).max(12)).optional(),
  }),
});

/**
 * Photos and videos stored in the private R2 bucket and served at /media/…
 * through the Worker (behind Cloudflare Access). Entries are written by
 * `node scripts/media.mjs add …` — never by hand.
 */
const media = defineCollection({
  loader: file("src/content/media.yaml"),
  schema: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("image"),
      /** Content hash — part of every object key, so replacing a file never serves a stale copy. */
      hash: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      /** Generated WebP widths: images/<id>.<hash>-<width>.webp */
      widths: z.array(z.number().int().positive()).min(1),
      alt: text.optional(),
    }),
    z.object({
      type: z.literal("video"),
      hash: z.string(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      /** videos/<id>.<hash>.mp4, plus videos/<id>.<hash>-poster.webp when true. */
      poster: z.boolean().default(false),
      alt: text.optional(),
    }),
  ]),
});

/** Who eats here and what they avoid — drives the warnings on menus and recipes. */
const household = defineCollection({
  loader: file("src/content/household.yaml"),
  schema: z.object({
    name: text,
    /** Ingredients this person doesn't eat. */
    avoid: z.array(reference("ingredients")).default([]),
    /** Recipe flags this person avoids, e.g. spicy. */
    avoidTags: z.array(z.enum(TAGS)).default([]),
  }),
});

const ingredientLine = z
  .object({
    ingredient: reference("ingredients"),
    qty: z.number().positive().optional(),
    /** Upper bound for ranges such as "2–3 cloves". */
    qtyMax: z.number().positive().optional(),
    unit: z.enum(UNITS).default("pc"),
    note: text.optional(),
    optional: z.boolean().default(false),
  })
  .refine((line) => line.unit === "to-taste" || line.qty !== undefined, {
    message: 'qty is required unless unit is "to-taste"',
  });

const recipes = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/recipes" }),
  schema: () =>
    z.object({
      title: text,
      summary: text,
      category: z.enum(CATEGORIES),
      /** Meal slots this recipe fits — used by the weekly planner. */
      meals: z.array(z.enum(MEALS)).min(1),
      servings: z.number().int().positive(),
      time: z.object({
        prep: z.number().int().nonnegative(),
        cook: z.number().int().nonnegative().default(0),
        /** Passive time: resting, rising, soaking, chilling. */
        rest: z.number().int().nonnegative().default(0),
      }),
      difficulty: z.enum(DIFFICULTIES),
      diet: z.array(z.enum(DIETS)).default([]),
      /** Empty = all year. */
      season: z.array(z.enum(SEASONS)).default([]),
      /** Who the recipe comes from, e.g. "Баба Вера". */
      from: z.string().optional(),
      /** Where an adapted recipe comes from — shown as "Извор" with a link. */
      source: z.object({ name: z.string().min(1), url: z.url() }).optional(),
      tags: z.array(z.enum(TAGS)).default([]),
      /** Main photo (a media id of type image). */
      cover: reference("media").optional(),
      /** Extra photos or videos shown under the recipe. */
      gallery: z.array(reference("media")).default([]),
      ingredients: z
        .array(
          z.object({
            title: text.optional(),
            items: z.array(ingredientLine).min(1),
          }),
        )
        .min(1),
      steps: z
        .array(
          z.object({
            text,
            /** Minutes — renders a one-tap timer on the step. */
            timer: z.number().int().positive().optional(),
            /** A photo or short video showing this step. */
            media: reference("media").optional(),
          }),
        )
        .min(1),
      /** Small deviations shown as a switcher on the recipe page. */
      variants: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            name: text,
            note: text.optional(),
            add: z.array(ingredientLine).default([]),
            remove: z.array(reference("ingredients")).default([]),
            /** Flags that apply only to this variant, e.g. a `spicy` version for the adults. */
            tags: z.array(z.enum(TAGS)).default([]),
          }),
        )
        .default([]),
      /** A bigger variation that lives in its own file links to its parent. */
      variantOf: reference("recipes").optional(),
      /**
       * What to serve with it — for a lunch, the salads that suit it (in season
       * order). The weekly plan pairs every lunch with one of these.
       */
      sides: z.array(reference("recipes")).default([]),
      tips: text.optional(),
      story: text.optional(),
      storage: text.optional(),
      /** Make-ahead reminder for the planner, e.g. "soak beans overnight". */
      prepAhead: text.optional(),
      draft: z.boolean().default(false),
    }),
});

/**
 * One dish in a meal slot: a recipe (optionally a variant, scaled to
 * `servings`), leftovers of an earlier meal the same day, or a free-text
 * note ("eating out").
 */
const dish = z
  .object({
    recipe: reference("recipes").optional(),
    /** Variant id from the recipe's `variants` list. */
    variant: z.string().optional(),
    /** Overrides the plan's default servings for this dish. */
    servings: z.number().int().positive().optional(),
    /** Reuse what was cooked for this meal earlier the same day. */
    leftovers: z.enum(MEALS).optional(),
    note: text.optional(),
  })
  .refine((d) => [d.recipe, d.leftovers].filter(Boolean).length <= 1, {
    message: "A dish is either a recipe or leftovers, not both",
  })
  .refine((d) => d.recipe || d.leftovers || d.note, {
    message: "A dish needs a recipe, leftovers or a note",
  });

/** Something the chef cooks today to serve on a later day. */
const prepTask = z.object({
  recipe: reference("recipes"),
  variant: z.string().optional(),
  servings: z.number().int().positive().optional(),
  /** The day it will be served (YYYY-MM-DD). */
  for: z.iso.date(),
  note: text.optional(),
});

/**
 * Weekly meal plan — written by the weekly automation, one file per ISO
 * week: src/content/mealplans/2026-W41.json. The chef cooks breakfast,
 * lunch and snacks each morning; dinner is optional.
 */
const mealplans = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/mealplans" }),
  schema: z.object({
    /** ISO week, e.g. "2026-W41". */
    week: z.string().regex(/^\d{4}-W\d{2}$/),
    /** Default servings for every dish; omit to use each recipe's own servings. */
    servings: z.number().int().positive().optional(),
    days: z
      .array(
        z.object({
          date: z.iso.date(),
          breakfast: z.array(dish).default([]),
          lunch: z.array(dish).default([]),
          snack: z.array(dish).default([]),
          dinner: z.array(dish).default([]),
          /** Cook-ahead tasks for later days (e.g. a dessert that must chill overnight). */
          prep: z.array(prepTask).default([]),
          note: text.optional(),
        }),
      )
      .min(1),
  }),
});

export const collections = { blog, ingredients, media, household, recipes, mealplans };
