/**
 * Normalizes text for search so Cyrillic and every common Latin spelling
 * meet in the middle: "Тавче", "Tavče", "tavche" and "tavce" all become
 * "tavce". Applied identically to the index and to the query, so lossy
 * collapses (ch→c, sh→s) never cause misses. Shared by the build-time
 * index and the client — keep it dependency-free.
 */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "g", е: "e", ж: "z", з: "z",
  ѕ: "dz", и: "i", ј: "j", к: "k", л: "l", љ: "l", м: "m", н: "n", њ: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "k", у: "u", ф: "f", х: "h",
  ц: "c", ч: "c", џ: "dz", ш: "s",
};

const DIGRAPHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/dzh|dž/g, "dz"],
  [/ch/g, "c"],
  [/sh/g, "s"],
  [/zh/g, "z"],
  [/gj/g, "g"],
  [/kj/g, "k"],
  [/lj/g, "l"],
  [/nj/g, "n"],
];

export function normalizeForSearch(input: string): string {
  let text = input.toLowerCase();
  text = text.replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC[ch] ?? ch);
  for (const [pattern, replacement] of DIGRAPHS) text = text.replace(pattern, replacement);
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
