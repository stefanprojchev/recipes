/**
 * Quantity formatting shared by the server render and the client-side
 * servings scaler (src/scripts/recipe.ts) — keep it free of Astro imports.
 */

const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** Kitchen-friendly number: fractions for spoons/pieces, rounding for grams. */
export function formatQty(value: number, metric: boolean, locale: string): string {
  const number = (v: number, digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);

  if (metric) {
    if (value >= 100) return number(Math.round(value / 5) * 5, 0);
    if (value >= 10) return number(Math.round(value), 0);
    return number(value, 2);
  }

  // Spoons, bunches, pieces: snap to the nearest kitchen fraction — nobody
  // measures "0,6 bunch". Anything above zero shows at least ¼.
  const whole = Math.floor(value);
  const rest = value - whole;
  const candidates: ReadonlyArray<readonly [number, string]> = [[0, ""], ...FRACTIONS, [1, ""]];
  const [fraction, glyph] = candidates.reduce((best, candidate) =>
    Math.abs(candidate[0] - rest) < Math.abs(best[0] - rest) ? candidate : best,
  );
  if (fraction === 1) return number(whole + 1, 0);
  if (fraction === 0) return whole === 0 ? FRACTIONS[0][1] : number(whole, 0);
  return whole === 0 ? glyph : `${number(whole, 0)}${glyph}`;
}

export function formatRange(
  qty: number,
  qtyMax: number | undefined,
  factor: number,
  metric: boolean,
  locale: string,
): string {
  const low = formatQty(qty * factor, metric, locale);
  if (qtyMax === undefined) return low;
  return `${low}–${formatQty(qtyMax * factor, metric, locale)}`;
}

/** "one" for ½ cup / 1 egg / 21 јајце, otherwise "other". */
export function pluralForm(value: number, locale: string): "one" | "other" {
  if (value <= 1) return "one";
  return new Intl.PluralRules(locale).select(value) === "one" ? "one" : "other";
}
