import type { APIRoute } from "astro";
import { asLocale } from "@/lib/i18n-content";
import { idleData } from "@/lib/idle-data";

/** Menu data for the idle kitchen screen (src/scripts/idle.ts). */
export const GET: APIRoute = async ({ currentLocale }) =>
  new Response(JSON.stringify(await idleData(asLocale(currentLocale))), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
