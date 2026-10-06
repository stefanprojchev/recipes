import type { APIRoute, GetStaticPaths } from "astro";
import { renderDishArt } from "@/lib/dish-art";
import { getRecipes, type Recipe } from "@/lib/recipes";

/** One static illustration per recipe that has an `art` spec (both locales share it). */
export const getStaticPaths = (async () => {
  const recipes = await getRecipes();
  return recipes.filter((recipe) => recipe.data.art).map((recipe) => ({ params: { id: recipe.id }, props: { recipe } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ recipe: Recipe }> = ({ props }) => {
  const { art } = props.recipe.data;
  if (!art) throw new Error(`recipe "${props.recipe.id}" has no art spec`);
  return new Response(renderDishArt(art, props.recipe.id), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
};
