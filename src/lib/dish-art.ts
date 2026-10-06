/**
 * Vector dish illustrations. A recipe describes its picture in a few words —
 *
 *   art:
 *     vessel: clay
 *     fill: beans
 *     items: [bean*14, dill*6, pepper-roasted]
 *     side: [bread]
 *
 * — and this module draws a consistent flat illustration from that: a vessel
 * seen from above (or from the side for glasses and jars), the food scattered
 * inside with a deterministic layout seeded by the recipe id, and a few props
 * beside it. Served as one static SVG per recipe from `/art/<id>.svg`.
 *
 * Kept free of imports so it also runs under plain `node` for previews.
 */

export const VESSELS = ["plate", "bowl", "clay", "pan", "dish", "tray", "board", "glass", "jar", "cup"] as const;
export type Vessel = (typeof VESSELS)[number];

/** Base colours: soup, sauce, batter, juice. */
export const FILLS = {
  broth: "#f1cf7b",
  "beef-broth": "#c98f4f",
  tomato: "#d9452f",
  "tomato-soup": "#e2552f",
  "meat-sauce": "#a83a22",
  gravy: "#8a4a24",
  cream: "#f4e6c6",
  pumpkin: "#f29a36",
  green: "#5f9a3d",
  "spinach-rice": "#7d9a45",
  leek: "#d6d99c",
  peas: "#8fb04a",
  "potato-stew": "#d7a24a",
  beans: "#c46a32",
  lentil: "#a8612f",
  yogurt: "#fbf8f0",
  chocolate: "#5a3423",
  "rice-pudding": "#f7f0dd",
  oats: "#e8d4a6",
  polenta: "#f3cd57",
  hummus: "#e8cf9c",
  ajvar: "#b8321f",
  beet: "#a3214e",
  rice: "#f4eedd",
  mash: "#f3e2b5",
  bulgur: "#d8b06a",
  "pasta-cream": "#f2e6c8",
  gratin: "#e3b562",
  egg: "#f6d36a",
  chia: "#e6dccb",
  "green-juice": "#9cc94a",
  "orange-juice": "#f7a428",
  "carrot-juice": "#f58220",
  "abc-juice": "#a3214e",
  "watermelon-juice": "#f2647a",
  "pear-juice": "#e2e49a",
  parchment: "#f6eedc",
  berry: "#e8687e",
  granola: "#c99a5a",
  syrup: "#d68a3a",
  roast: "#d9a05a",
  tarana: "#e8c56a",
  salad: "#dcecc0",
} as const;
export type Fill = keyof typeof FILLS;

export interface ArtSpec {
  vessel: Vessel;
  fill?: Fill;
  /** Side views: liquid layers from the bottom up (defaults to `fill`). */
  layers?: Fill[];
  /** `kind` or `kind*count`, drawn in order (later ones on top). */
  items?: string[];
  /** Props next to the vessel: a lemon, bread, the fruit a juice is made of. */
  side?: string[];
  /** Size of the items (not the vessel or props): 1.4 for a few big pieces. */
  scale?: number;
}

type Rnd = () => number;

interface Shape {
  /** Footprint radius used for layout. */
  r: number;
  draw: (rnd: Rnd) => string;
  /** Don't rotate (things with a clear up side). */
  upright?: boolean;
}

// ── tiny SVG helpers ────────────────────────────────────────────────────────

const f2 = (n: number) => Math.round(n * 10) / 10;
const circle = (x: number, y: number, r: number, fill: string, extra = "") =>
  `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="${fill}"${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${fill}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, rr: number, fill: string, extra = "") =>
  `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(rr)}" fill="${fill}"${extra}/>`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d: string, color: string, w: number, extra = "") =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const st = (color: string, w: number) => ` stroke="${color}" stroke-width="${w}"`;
const op = (o: number) => ` opacity="${o}"`;
const g = (inner: string, transform: string) => `<g transform="${transform}">${inner}</g>`;

/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
function smooth(points: [number, number][]): string {
  const n = points.length;
  let d = `M${f2(points[0][0])},${f2(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f2(c1[0])},${f2(c1[1])} ${f2(c2[0])},${f2(c2[1])} ${f2(p2[0])},${f2(p2[1])}`;
  }
  return `${d}Z`;
}

/** An irregular round blob of radius ~r. */
function blob(rnd: Rnd, r: number, wobble = 0.15, n = 8, sx = 1, sy = 1): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rnd() * wobble);
    pts.push([Math.cos(a) * rr * sx, Math.sin(a) * rr * sy]);
  }
  return smooth(pts);
}

const leafPath = (len: number, w: number) =>
  `M${-len},0 C${-len / 2},${-w} ${len / 2},${-w} ${len},0 C${len / 2},${w} ${-len / 2},${w} ${-len},0Z`;

function radial(n: number, r1: number, r2: number, color: string, w: number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += `M${f2(Math.cos(a) * r1)},${f2(Math.sin(a) * r1)}L${f2(Math.cos(a) * r2)},${f2(Math.sin(a) * r2)}`;
  }
  return line(d, color, w);
}

function dots(rnd: Rnd, n: number, r: number, size: number, color: string): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    out += circle(Math.cos(a) * d, Math.sin(a) * d, size, color);
  }
  return out;
}

const HI = "rgba(255,255,255,0.55)";
const SHADE = "rgba(70,40,15,0.18)";

// ── food shapes (drawn around 0,0) ─────────────────────────────────────────

const citrus = (r: number, rind: string, flesh: string): Shape => ({
  r,
  draw: () => circle(0, 0, r, rind) + circle(0, 0, r * 0.84, flesh) + radial(8, r * 0.12, r * 0.78, "rgba(255,255,255,0.75)", 1.4) + circle(0, 0, r * 0.12, "rgba(255,255,255,0.8)"),
});

const strip = (color: string, light: string): Shape => ({
  r: 16,
  draw: () => line("M-16,3 Q0,-8 16,3", color, 7) + line("M-12,0 Q0,-6.5 12,0", light, 1.6),
});

const leaf = (r: number, color: string, vein: string, wide = 0.45): Shape => ({
  r,
  draw: () => path(leafPath(r, r * wide * 1.6), color) + line(`M${-r * 0.85},0 L${r * 0.85},0`, vein, 1.4),
});

const scoop = (color: string, ridge: string): Shape => ({
  r: 24,
  draw: (rnd) => path(blob(rnd, 24, 0.12, 9), color, st(ridge, 1.5)) + line("M-14,-6 Q-4,-12 8,-8 M-16,4 Q-2,-2 14,2 M-10,13 Q2,8 14,11", ridge, 1.6) + ellipse(-8, -10, 6, 3, HI),
});

const ITEMS: Record<string, Shape> = {
  // eggs
  "egg-fried": {
    r: 34,
    draw: (rnd) =>
      path(blob(rnd, 34, 0.22, 9), "#fffaf0", st("#efe4cf", 1.5)) + circle(4, -3, 12, "#f6b62b") + circle(4, -3, 12, "none", st("#e89a10", 1.2)) + circle(0, -7, 3.5, HI),
  },
  "egg-half": {
    r: 16,
    draw: () => ellipse(0, 0, 16, 12, "#fffaf0", st("#ece1cb", 1.2)) + circle(0, 0, 7.5, "#f4b434") + circle(-1.5, -1.5, 4, "#f8c95a"),
  },
  "egg-poached": {
    r: 26,
    draw: (rnd) => path(blob(rnd, 25, 0.18, 9), "#fffcf5", st("#efe6d4", 1.2)) + ellipse(2, 0, 11, 10, "#f7c04a") + ellipse(0, -3, 5, 3, HI),
  },
  scrambled: { r: 14, draw: (rnd) => path(blob(rnd, 14, 0.35, 7), "#f8d24f", st("#eebd34", 1.2)) + ellipse(-3, -3, 4, 2, HI) },

  // vegetables
  "tomato-slice": {
    r: 18,
    draw: () => {
      let s = circle(0, 0, 18, "#e04a32") + circle(0, 0, 14.5, "#f0664a");
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        s += ellipse(Math.cos(a) * 8, Math.sin(a) * 8, 4.2, 2.6, "#f7c873", ` transform="rotate(${f2((a * 180) / Math.PI)} ${f2(Math.cos(a) * 8)} ${f2(Math.sin(a) * 8)})"`);
      }
      return s + circle(0, 0, 3, "#f39a7a");
    },
  },
  "cherry-tomato": {
    r: 10,
    draw: () => circle(0, 0, 10, "#e2412d") + ellipse(-3.5, -3.5, 3, 2, HI) + path("M0,-1 L-4,-5 L0,-3 L4,-5 L2,-1 L5,1 L0,0 L-5,1Z", "#4f8a2b"),
  },
  "cherry-half": { r: 9, draw: () => circle(0, 0, 9, "#e2412d") + circle(0, 0, 7, "#f2734f") + ellipse(-2.5, 0, 2, 1.3, "#f7c873") + ellipse(2.5, 0, 2, 1.3, "#f7c873") },
  "cucumber-slice": {
    r: 15,
    draw: () => circle(0, 0, 15, "#4f8f3a") + circle(0, 0, 13, "#d3eabd") + circle(0, 0, 6, "#e9f5dc") + radial(6, 2.5, 5, "#bcd9a0", 1.5),
  },
  "pepper-strip-red": strip("#d93a2b", "#f27a66"),
  "pepper-strip-green": strip("#4f9a32", "#8cc65f"),
  "pepper-strip-yellow": strip("#f0b92a", "#f8dc7a"),
  "pepper-red": {
    r: 30,
    draw: (rnd) => path(blob(rnd, 29, 0.14, 7), "#d93a2b", st("#b52a1e", 1.5)) + path(blob(rnd, 19, 0.2, 7), "#e8553f") + circle(0, 0, 7, "#4f8a2b") + circle(0, 0, 3, "#3d6e20") + ellipse(-12, -12, 6, 3, HI),
  },
  "pepper-roasted": {
    r: 30,
    draw: (rnd) => {
      let s = path(blob(rnd, 30, 0.2, 8, 1, 0.5), "#c8321f", st("#a5281a", 1.2));
      for (let i = 0; i < 4; i++) s += ellipse((rnd() - 0.5) * 36, (rnd() - 0.5) * 10, 3 + rnd() * 3, 1.5 + rnd() * 1.5, "#5a2a1a", op(0.45));
      return s + ellipse(-8, -5, 8, 2, "rgba(255,255,255,0.35)");
    },
  },
  "zucchini-slice": { r: 14, draw: () => circle(0, 0, 14, "#3f7d2b") + circle(0, 0, 12, "#e6f0c0") + radial(7, 3, 6, "#cfe0a0", 1.4) },
  "zucchini-boat": {
    r: 36,
    draw: (rnd) => ellipse(0, 0, 38, 16, "#3f7d2b") + ellipse(0, 0, 33, 11, "#b5653a") + dots(rnd, 10, 9, 1.8, "#8a4524") + circle(-12, -3, 2.5, "#e04a32") + circle(10, 2, 2.5, "#e04a32") + ellipse(-20, -9, 8, 2, "rgba(255,255,255,0.3)"),
  },
  "onion-ring": { r: 13, draw: () => circle(0, 0, 12.5, "none", st("#b06aa8", 3)) + circle(0, 0, 8.5, "none", st("#e7c6e3", 1.6)) },
  "spring-onion": { r: 5, draw: () => circle(0, 0, 4.5, "none", st("#6fae3c", 2.4)) },
  olive: { r: 8, draw: () => ellipse(0, 0, 8, 6, "#3a3232") + ellipse(0, 0, 2.6, 2, "#6b5a4a") + ellipse(-3, -2.5, 2.5, 1.2, "rgba(255,255,255,0.35)") },
  lettuce: {
    r: 26,
    draw: (rnd) => path(blob(rnd, 26, 0.3, 11), "#8cc63f", st("#6aa832", 1.4)) + line("M-18,4 Q0,-2 18,-6 M-4,0 L-8,-10 M6,-3 L4,-14 M-6,1 L-2,12", "#c4e58a", 1.8),
  },
  spinach: leaf(16, "#3e7d2c", "#6aa848"),
  nettle: { r: 14, draw: () => path("M-14,0 L-10,-5 L-6,-4 L-3,-8 L1,-6 L4,-9 L7,-6 L10,-6 L14,0 L10,6 L7,6 L4,9 L1,6 L-3,8 L-6,4 L-10,5Z", "#4a8a35") + line("M-12,0 L12,0", "#7ab35a", 1.2) },
  basil: leaf(10, "#4a9a3a", "#7cc062"),
  mint: { r: 11, draw: () => g(path(leafPath(9, 6), "#5cb85c") + line("M-8,0 L8,0", "#8fd38a", 1.1), "translate(-5,0) rotate(-25)") + g(path(leafPath(9, 6), "#4cae4c") + line("M-8,0 L8,0", "#8fd38a", 1.1), "translate(5,0) rotate(25)") },
  herb: { r: 4, draw: (rnd) => path(blob(rnd, 3.6, 0.6, 5), "#4b8b32") },
  dill: { r: 10, draw: () => line("M-10,4 Q0,0 10,-4 M-4,2 L-7,-4 M0,1 L-1,-6 M4,-1 L5,-7 M-2,2 L-1,8 M3,0 L6,5", "#5a9e3a", 1.4) },
  arugula: {
    r: 15,
    draw: () => path("M-15,0 C-13,-4 -10,-3 -9,-6 C-6,-3 -4,-7 -2,-5 C1,-8 3,-4 5,-6 C8,-5 9,-3 11,-4 C13,-2 15,-1 15,0 C12,3 9,4 6,4 C4,7 1,4 -1,6 C-4,4 -6,7 -8,4 C-11,5 -13,3 -15,0Z", "#4f8f2f") + line("M-13,0 L13,0", "#7fb860", 1.2),
  },
  "cabbage-shred": { r: 12, draw: () => line("M-12,0 Q0,-7 12,0", "#cfe6a8", 3) + line("M-10,3 Q0,-3 10,3", "#b8d888", 1.5) },
  "cabbage-purple": { r: 12, draw: () => line("M-12,0 Q0,-7 12,0", "#8e3a7a", 3) },
  "carrot-coin": { r: 9, draw: () => circle(0, 0, 9, "#f08a24") + circle(0, 0, 5.8, "none", st("#f7a957", 1.4)) + circle(0, 0, 1.6, "#f7a957") },
  "carrot-shred": { r: 8, draw: () => line("M-8,1 Q0,-4 8,1", "#f08a24", 2.6) },
  "carrot-stick": { r: 15, draw: () => rect(-15, -3.5, 30, 7, 3.5, "#f08a24") + line("M-11,-1 L11,-1", "#f7a957", 1) },
  broccoli: {
    r: 16,
    draw: () => rect(-3, 4, 6, 12, 3, "#9cc66a") + circle(-7, -2, 7.5, "#3f7f25") + circle(7, -2, 7.5, "#3f7f25") + circle(0, -8, 8, "#4e8f2e") + circle(0, 1, 7, "#4e8f2e") + circle(-3, -9, 2, "#6aaa45") + circle(5, -4, 2, "#6aaa45"),
  },
  cauliflower: {
    r: 16,
    draw: () => rect(-3, 4, 6, 12, 3, "#c9dca0") + circle(-7, -2, 7.5, "#f2ead3", st("#e0d2ad", 1)) + circle(7, -2, 7.5, "#f2ead3", st("#e0d2ad", 1)) + circle(0, -8, 8, "#f6efdc", st("#e0d2ad", 1)) + circle(0, 1, 7, "#f6efdc"),
  },
  "green-bean": { r: 17, draw: () => line("M-17,2 Q-4,-5 17,-1", "#4f9a32", 6) + line("M-12,-0.5 Q-2,-4.5 12,-2", "#83c25a", 1.4) },
  pea: { r: 5, draw: () => circle(0, 0, 5, "#79b84a") + circle(-1.5, -1.5, 1.5, HI) },
  "potato-chunk": { r: 15, draw: (rnd) => path(blob(rnd, 14.5, 0.25, 6), "#e9b85a", st("#c99436", 1.4)) + ellipse(-4, -4, 5, 2.5, "rgba(255,255,255,0.4)") },
  "potato-new": {
    r: 14,
    draw: (rnd) => ellipse(0, 0, 14, 11, "#e8c27a", st("#c9a35a", 1.3)) + dots(rnd, 3, 8, 1, "#b48a48") + ellipse(-4, -4, 5, 2.5, "rgba(255,255,255,0.45)"),
  },
  "potato-wedge": { r: 16, draw: () => path("M-16,6 Q0,-14 16,6 Z", "#e7b04e", st("#b98a32", 1.5)) + line("M-11,3 Q0,-8 11,3", "#f4d38a", 1.5) },
  "leek-ring": { r: 11, draw: () => circle(0, 0, 10.5, "#eef5dc", st("#c8dfa0", 2.5)) + circle(0, 0, 6.5, "none", st("#d8e8b8", 1.2)) + circle(0, 0, 3, "none", st("#d8e8b8", 1)) },
  mushroom: { r: 12, draw: () => path("M-12,0 C-12,-12 12,-12 12,0 L4,0 L4,9 L-4,9 L-4,0Z", "#e3cfb0", st("#b89a74", 1.3)) },
  "beet-cube": { r: 9, draw: () => rect(-8, -8, 16, 16, 3.5, "#9b1f48") + rect(-6, -6, 7, 3, 1.5, "rgba(255,255,255,0.25)") },
  "radish-slice": { r: 9, draw: () => circle(0, 0, 9, "#fdf7f7", st("#d64a6a", 2.2)) + radial(6, 2, 5.5, "#f3dfe3", 1) },
  garlic: { r: 8, draw: () => path("M0,-8 C6,-6 7,4 2,8 L-2,8 C-7,4 -6,-6 0,-8Z", "#f6efe0", st("#e0d4bc", 1.2)) },
  chili: { r: 13, draw: () => line("M-11,3 Q0,-3 10,-1", "#d42a1e", 5.5) + line("M10,-1 L14,-4", "#4f8a2b", 2.5) },
  "avocado-half": {
    r: 30,
    upright: true,
    draw: () => path("M0,-30 C14,-30 24,-4 24,10 C24,24 13,30 0,30 C-13,30 -24,24 -24,10 C-24,-4 -14,-30 0,-30Z", "#3f6b2a") + path("M0,-26 C11,-26 20,-3 20,10 C20,21 11,26 0,26 C-11,26 -20,21 -20,10 C-20,-3 -11,-26 0,-26Z", "#b4d465") + ellipse(0, 9, 14, 14, "#d8e89a") + circle(0, 9, 9.5, "#7a4a2a") + ellipse(-3, 6, 3, 2, "rgba(255,255,255,0.3)"),
  },
  "avocado-egg": {
    r: 30,
    upright: true,
    draw: () => path("M0,-30 C14,-30 24,-4 24,10 C24,24 13,30 0,30 C-13,30 -24,24 -24,10 C-24,-4 -14,-30 0,-30Z", "#3f6b2a") + path("M0,-26 C11,-26 20,-3 20,10 C20,21 11,26 0,26 C-11,26 -20,21 -20,10 C-20,-3 -11,-26 0,-26Z", "#b4d465") + ellipse(0, 8, 14, 15, "#fffaf0") + circle(0, 8, 7, "#f6b62b") + circle(-2, 5, 2, HI),
  },
  "avocado-slice": { r: 15, draw: () => path("M-15,4 Q0,-12 15,4 Q0,-4 -15,4Z", "#b9d86a", st("#3f6b2a", 1.8)) },
  "eggplant-slice": { r: 16, draw: (rnd) => circle(0, 0, 15, "#f1e6c4", st("#4b2a5a", 3)) + dots(rnd, 8, 8, 0.9, "#c9b98a") },
  "pumpkin-cube": { r: 9, draw: () => rect(-8, -8, 16, 16, 4, "#f28a24") + rect(-6, -6, 7, 3, 1.5, "rgba(255,255,255,0.3)") },

  // protein
  meatball: { r: 14, draw: (rnd) => path(blob(rnd, 13.5, 0.1, 8), "#7a4026", st("#5f2f1b", 1.2)) + dots(rnd, 5, 9, 1.4, "#5f2f1b") + ellipse(-4, -5, 4.5, 2.5, "rgba(255,255,255,0.3)") },
  chicken: {
    r: 30,
    draw: (rnd) => path(blob(rnd, 30, 0.18, 8, 1, 0.75), "#d99a4e", st("#b8742f", 1.5)) + line("M-18,-10 L-4,10 M-6,-14 L8,8 M6,-15 L19,3", "#9a5a22", 3.2, op(0.75)) + ellipse(-10, -9, 8, 3, "rgba(255,255,255,0.3)"),
  },
  "chicken-strip": { r: 15, draw: () => rect(-15, -5, 30, 10, 5, "#dba25c", st("#b8742f", 1.2)) + line("M-6,-4 L-9,4 M3,-4 L0,4", "#9a5a22", 2, op(0.7)) },
  "chicken-leg": {
    r: 30,
    draw: () => rect(-31, -3.5, 22, 7, 3.5, "#f3ead8") + circle(-31, -4, 4, "#f3ead8") + circle(-31, 4, 4, "#f3ead8") + ellipse(6, 0, 25, 17, "#c7802f", st("#9a5a22", 1.5)) + ellipse(0, -7, 10, 4, "rgba(255,255,255,0.3)") + ellipse(12, 5, 8, 4, "#a8632a", op(0.6)),
  },
  "meat-chunk": { r: 12, draw: (rnd) => path(blob(rnd, 12, 0.3, 6), "#8a4b2a", st("#6a3520", 1.2)) + ellipse(-3, -3, 4, 2, "rgba(255,255,255,0.25)") },
  "meat-slice": { r: 30, draw: () => ellipse(0, 0, 30, 20, "#c98060", st("#7a3f22", 3.5)) + ellipse(0, 0, 18, 10, "#d99a7a", op(0.6)) },
  minced: { r: 4, draw: (rnd) => path(blob(rnd, 4, 0.5, 5), "#8a4b2a") },
  salmon: {
    r: 38,
    draw: () => rect(-36, -18, 72, 36, 12, "#f28a6b", st("#d96a4c", 1.5)) + line("M-24,-17 L-30,17 M-10,-17 L-16,17 M4,-17 L-2,17 M18,-17 L12,17", "#fbd3c4", 2.4) + rect(-30, -14, 30, 6, 3, "rgba(255,255,255,0.25)"),
  },
  tuna: { r: 8, draw: (rnd) => path(blob(rnd, 8, 0.4, 6), "#d9b08f", st("#c09070", 1)) },
  ham: { r: 18, draw: () => circle(0, 0, 18, "#f2a0a6", st("#e5848c", 1.5)) + circle(0, 0, 14, "none", st("#f8c4c8", 1.4)) + line("M-18,0 Q0,6 18,0", "#e5848c", 1.4) },
  prosciutto: { r: 18, draw: () => line("M-18,0 C-12,-8 -6,8 0,0 C6,-8 12,8 18,0", "#e98a8f", 9) + line("M-18,2 C-12,-6 -6,10 0,2 C6,-6 12,10 18,2", "#fbe0e2", 1.8) },
  feta: { r: 8, draw: (rnd) => rect(-7, -7, 14, 14, 3, "#fbf9f3", st("#e3dccb", 1.2)) + dots(rnd, 3, 4, 0.8, "#e3dccb") },
  "feta-slab": { r: 32, draw: (rnd) => rect(-30, -18, 60, 36, 5, "#fbf9f3", st("#e3dccb", 1.5)) + dots(rnd, 14, 16, 1.1, "#6b8f3a") },
  "cheese-grated": { r: 6, draw: () => line("M-5,-1 L5,1", "#f5c84a", 2.4) },
  parmesan: { r: 5, draw: (rnd) => path(blob(rnd, 4.5, 0.6, 5, 1.4, 0.7), "#f6ecc8", st("#e5d7a2", 0.8)) },
  mozzarella: { r: 14, draw: () => circle(0, 0, 14, "#fffefa", st("#ece8dc", 1.5)) + ellipse(-4, -4, 5, 3, "#ffffff") },
  "sausage-slice": { r: 9, draw: (rnd) => circle(0, 0, 9, "#b5482f", st("#8a3220", 1.5)) + dots(rnd, 5, 5.5, 1.1, "#f0c8b8") },
  bean: { r: 6, draw: () => ellipse(0, 0, 7, 4.5, "#f6eedc", st("#d9caa8", 1)) + ellipse(-2, -1.5, 2.5, 1, HI) },
  chickpea: { r: 7, draw: () => circle(0, 0, 7, "#e6c58f", st("#c9a465", 1)) + line("M-2,-6 Q2,-1 0,5", "#c9a465", 1) },
  lentil: { r: 3, draw: () => ellipse(0, 0, 3, 2.4, "#b5652e") },

  // grains, bread, pastry
  rice: { r: 3, draw: () => ellipse(0, 0, 3.6, 1.7, "#ffffff", st("#d6cbb0", 0.7)) },
  bulgur: { r: 2.5, draw: () => ellipse(0, 0, 2.2, 1.6, "#c99a52") },
  pasta: { r: 13, draw: () => path("M-13,-4 L9,-4 L13,4 L-9,4Z", "#f3c867", st("#d9a73f", 1.2)) + line("M-6,-4 L-2,4 M0,-4 L4,4 M6,-4 L9,2", "#e2b04e", 1) },
  noodle: { r: 14, draw: () => line("M-14,0 C-9,-7 -4,7 0,0 C4,-7 9,7 14,0", "#f3d27a", 3) },
  tarana: { r: 3, draw: (rnd) => path(blob(rnd, 3, 0.6, 5), "#e8c56a") },
  bread: {
    r: 30,
    upright: true,
    draw: () => path("M-24,30 L-24,-8 C-34,-10 -34,-30 -14,-30 C-6,-34 6,-34 14,-30 C34,-30 34,-10 24,-8 L24,30Z", "#e8c08a", st("#a8692f", 4)) + ellipse(-6, -10, 9, 4, "rgba(255,255,255,0.25)"),
  },
  crouton: { r: 7, draw: () => rect(-6, -6, 12, 12, 2.5, "#d9a35f", st("#b07a3a", 1)) },
  sarma: { r: 24, draw: () => ellipse(0, 0, 24, 14, "#a8bd6e", st("#7f9a4a", 1.5)) + line("M-14,-10 Q-10,0 -14,10 M-2,-13 Q2,0 -2,13 M10,-11 Q14,0 10,11", "#8fa85a", 1.4) + ellipse(-8, -6, 7, 2.5, "rgba(255,255,255,0.3)") },
  pancakes: {
    r: 42,
    draw: () => circle(4, 6, 40, "#c98a3a") + circle(2, 3, 40, "#dd9e48") + circle(0, 0, 40, "#e3a84f") + circle(0, 0, 32, "#edc072") + ellipse(-12, -14, 12, 5, "rgba(255,255,255,0.3)"),
  },
  "roll-egg": { r: 22, draw: () => circle(0, 0, 22, "#f6d36a", st("#e5b53a", 1.5)) + line("M0,0 C5,-2 6,6 0,8 C-9,10 -11,-4 -3,-10 C8,-16 16,-2 12,8", "#5a9e3a", 4) + circle(0, 0, 3, "#e04a32") },
  "roll-zucchini": { r: 22, draw: () => circle(0, 0, 22, "#8bb85a", st("#5f8f35", 1.5)) + line("M0,0 C5,-2 6,6 0,8 C-9,10 -11,-4 -3,-10 C8,-16 16,-2 12,8", "#e9d3a8", 5) + circle(0, 0, 3, "#f2c25a") },
  "sandwich-half": {
    r: 34,
    upright: true,
    draw: () => path("M-32,26 L32,26 L-32,-30Z", "#cfd89a", st("#8fa85a", 3)) + line("M-24,20 L20,20", "#6aa832", 3) + line("M-27,15 L12,15", "#e04a32", 3) + line("M-29,10 L5,10", "#d99a4e", 3),
  },
  muffin: {
    r: 25,
    draw: (rnd) => circle(0, 0, 25, "#f2e3c4") + radial(18, 19, 25, "#dfc9a0", 1.2) + path(blob(rnd, 19.5, 0.12, 8), "#d8a258") + dots(rnd, 7, 12, 1.6, "#4f8a2b") + dots(rnd, 3, 10, 1.6, "#e04a32") + ellipse(-6, -7, 7, 3, "rgba(255,255,255,0.3)"),
  },
  "muffin-egg": {
    r: 25,
    draw: (rnd) => circle(0, 0, 25, "#f2e3c4") + radial(18, 19, 25, "#dfc9a0", 1.2) + path(blob(rnd, 19.5, 0.12, 8), "#f2c84f") + dots(rnd, 6, 12, 2, "#d93a2b") + dots(rnd, 6, 12, 2, "#4f8a2b") + ellipse(-6, -7, 7, 3, "rgba(255,255,255,0.35)"),
  },
  "egg-cup": {
    r: 24,
    draw: () => circle(0, 0, 24, "#e98a8f", st("#d26b72", 2)) + circle(0, 0, 18, "#fffaf0") + circle(1, 0, 8, "#f6b62b") + circle(-2, -3, 2.5, HI),
  },
  cookie: { r: 20, draw: (rnd) => path(blob(rnd, 20, 0.12, 9), "#d9a35f", st("#b07a3a", 1.2)) + dots(rnd, 8, 14, 1.6, "#b07a3a") + dots(rnd, 3, 12, 2.4, "#ead9b0") },
  "cookie-choc": { r: 20, draw: (rnd) => path(blob(rnd, 20, 0.12, 9), "#d9a35f", st("#b07a3a", 1.2)) + dots(rnd, 6, 13, 2.6, "#4a2a1c") + dots(rnd, 3, 12, 2.4, "#ead9b0") },
  "energy-ball": { r: 13, draw: (rnd) => circle(0, 0, 13, "#a56a3a", st("#82502a", 1.2)) + dots(rnd, 6, 9, 1.4, "#e6cf9e") + dots(rnd, 3, 8, 1.6, "#3b2218") + ellipse(-4, -5, 4, 2, "rgba(255,255,255,0.3)") },
  "energy-ball-coco": { r: 13, draw: (rnd) => circle(0, 0, 13, "#6b4027") + dots(rnd, 22, 12, 1.3, "#fbf7ee") },
  "loaf-slice": {
    r: 32,
    upright: true,
    draw: (rnd) => path("M-30,24 L-30,-14 C-30,-26 30,-26 30,-14 L30,24Z", "#8a5a2a") + path("M-26,21 L-26,-12 C-26,-21 26,-21 26,-12 L26,21Z", "#d9a46a") + dots(rnd, 10, 16, 1.3, "#7a4a22") + dots(rnd, 5, 14, 1.6, "#ead9b0"),
  },
  bark: {
    r: 22,
    draw: (rnd) => path("M-22,-8 L-6,-18 L18,-12 L22,8 L4,18 L-18,12Z", "#fbf9f4", st("#ebe4d4", 1.4)) + circle(-6, -4, 4, "#e3343f") + circle(8, 4, 3.5, "#3f4a8a") + circle(4, -8, 3, "#e3343f") + dots(rnd, 3, 12, 1.4, "#4a2a1c"),
  },
  "scoop-banana": scoop("#f6e7a8", "#e3cf7f"),
  "scoop-choc": scoop("#7a4a2c", "#5e3720"),
  "scoop-berry": scoop("#f0a0b4", "#d97d96"),
  oat: { r: 4, draw: () => ellipse(0, 0, 4, 2.6, "#ead9b0", st("#d4bf8c", 0.6)) },
  granola: { r: 8, draw: (rnd) => path(blob(rnd, 8, 0.45, 6), "#c08a4a", st("#9a6a32", 1)) + dots(rnd, 2, 4, 1.4, "#ead9b0") },

  // fruit & nuts
  "lemon-slice": citrus(14, "#f2c81f", "#fbe98a"),
  "lemon-wedge": { r: 14, draw: () => path("M-14,0 A14,14 0 0 1 14,0Z", "#f2c81f") + path("M-11.5,0 A11.5,11.5 0 0 1 11.5,0Z", "#fbe98a") },
  "orange-slice": citrus(16, "#f08a1c", "#f9b04a"),
  "banana-slice": { r: 9, draw: () => circle(0, 0, 9, "#f8eebc", st("#ede0a0", 1.2)) + radial(3, 0, 3, "#d8c690", 1.2) },
  strawberry: {
    r: 12,
    upright: true,
    draw: (rnd) => path("M0,12 C-12,4 -12,-8 -4,-9 C-2,-10 2,-10 4,-9 C12,-8 12,4 0,12Z", "#e3343f") + dots(rnd, 6, 6, 0.9, "#f7d36a") + path("M-6,-9 L-2,-12 L0,-9 L2,-12 L6,-9 L0,-7Z", "#4f9a32"),
  },
  "strawberry-half": { r: 11, upright: true, draw: () => path("M0,11 C-11,4 -11,-8 0,-8 C11,-8 11,4 0,11Z", "#e3343f") + path("M0,7 C-6,3 -7,-4 0,-4 C7,-4 6,3 0,7Z", "#f6a3a8") },
  blueberry: { r: 5, draw: () => circle(0, 0, 5, "#3f4a8a") + circle(0, -1, 1.5, "#7a86c0") },
  raspberry: { r: 6, draw: () => circle(0, 0, 6, "#d6334f") + circle(-2, -2, 1.6, "#e95a72") + circle(2, 1, 1.6, "#e95a72") },
  "apple-slice": { r: 14, draw: () => path("M-14,4 Q0,-12 14,4 Q0,-3 -14,4Z", "#fbf0cf", st("#d83a34", 2)) },
  "apple-cube": { r: 6, draw: () => rect(-6, -6, 12, 12, 2, "#fbf0cf", st("#e8d9a8", 0.8)) + rect(-6, -6, 12, 3, 1, "#d83a34") },
  "apple-baked": {
    r: 36,
    draw: (rnd) => circle(0, 0, 34, "#b8402c", st("#8a2a1c", 2)) + ellipse(-14, -14, 10, 5, "rgba(255,255,255,0.25)") + circle(0, 0, 14, "#8a5a2a") + dots(rnd, 6, 9, 2.4, "#c99a62") + circle(0, 0, 14, "none", st("#f1b52c", 2.5)),
  },
  raisin: { r: 3.5, draw: (rnd) => path(blob(rnd, 3.5, 0.5, 5), "#5a2f2a") },
  walnut: { r: 9, draw: () => path("M-9,0 C-9,-8 9,-8 9,0 C9,8 -9,8 -9,0Z", "#9b6a3c") + line("M0,-6 L0,6 M-6,-3 Q-3,0 -6,3 M6,-3 Q3,0 6,3", "#6e4826", 1.3) },
  almond: { r: 6, draw: () => path("M-7,0 C-4,-5 4,-5 7,0 C4,4 -4,4 -7,0Z", "#c9935a") + line("M-4,-1 L3,-1", "#e0b07a", 1) },
  "pumpkin-seed": { r: 4, draw: () => path("M-4,0 C-2,-3 3,-2 4,0 C3,2 -2,3 -4,0Z", "#6b8f3a") },
  "pear-slice": { r: 14, draw: () => path("M-14,4 Q0,-12 14,4 Q0,-3 -14,4Z", "#f6f2d0", st("#b8c048", 2)) },
  "watermelon-wedge": { r: 22, upright: true, draw: (rnd) => path("M-22,-8 L22,-8 L0,20Z", "#f2647a") + rect(-24, -13, 48, 6, 3, "#4f9a32") + rect(-23, -9, 46, 2.5, 1, "#c9e6a0") + dots(rnd, 5, 6, 1.3, "#2f2a2a") },

  // whole produce (props beside a glass or plate)
  "apple-whole": { r: 18, upright: true, draw: () => path("M0,-11 C10,-18 20,-8 18,4 C16,16 6,19 0,16 C-6,19 -16,16 -18,4 C-20,-8 -10,-18 0,-11Z", "#d83a34") + line("M0,-11 L2,-19", "#6e4826", 2) + path(leafPath(5, 3), "#4f9a32", ' transform="translate(7,-17) rotate(-20)"') + ellipse(-8, -6, 4, 2.5, HI) },
  "pear-whole": { r: 20, upright: true, draw: () => path("M0,-18 C6,-18 7,-8 10,-2 C16,6 14,20 0,20 C-14,20 -16,6 -10,-2 C-7,-8 -6,-18 0,-18Z", "#c9d44a") + line("M0,-18 L1,-24", "#6e4826", 2) + ellipse(-5, 2, 3.5, 6, HI) },
  "carrot-whole": { r: 24, draw: () => path("M-24,-4 L18,-1 C22,0 22,2 18,3 L-24,6 C-27,5 -27,-3 -24,-4Z", "#f08a24") + line("M-14,-2 L-12,4 M-2,-1 L0,3 M8,0 L9,2", "#d9701a", 1.2) + line("M-26,1 L-34,-6 M-26,1 L-35,2 M-26,1 L-33,9", "#4f9a32", 2.4) },
  "orange-half": citrus(18, "#f08a1c", "#f9b04a"),
  "lemon-half": citrus(15, "#f2c81f", "#fbe98a"),
  "beet-whole": { r: 18, upright: true, draw: () => circle(0, 3, 15, "#8e1c42") + ellipse(-5, -2, 4, 3, "rgba(255,255,255,0.2)") + line("M0,18 L1,24", "#8e1c42", 2) + line("M-2,-11 L-8,-24 M0,-11 L0,-26 M2,-11 L8,-23", "#4f8a2b", 2.2) },
  ginger: { r: 14, draw: () => path("M-14,2 C-14,-6 -6,-6 -4,-3 C-2,-10 6,-10 6,-4 C12,-6 16,0 12,5 C8,9 -10,9 -14,2Z", "#d9b37a", st("#b8925a", 1.2)) },
  celery: { r: 22, draw: () => rect(-22, -4, 40, 8, 4, "#9cc66a", st("#7aa84a", 1)) + line("M-18,-1 L14,-1 M-18,2 L14,2", "#c4e09a", 0.8) + path(leafPath(6, 4), "#5a9e3a", ' transform="translate(22,-4) rotate(-30)"') },
  "cucumber-whole": { r: 24, draw: () => rect(-24, -6, 48, 12, 6, "#3f7d2b") + line("M-18,-2 L18,-2", "#6aa848", 1.2) },
  bunch: { r: 16, draw: () => line("M-14,8 L6,-6 M-12,8 L10,-2 M-14,6 L2,-10", "#4f8a2b", 1.6) + circle(6, -6, 4, "#5a9e3a") + circle(10, -2, 4, "#4b8b32") + circle(2, -10, 4, "#5a9e3a") },
  "bread-slice": {
    r: 26,
    draw: () => path("M-22,22 L-22,-6 C-30,-8 -30,-24 -12,-24 C-4,-28 4,-28 12,-24 C30,-24 30,-8 22,-6 L22,22Z", "#e8c08a", st("#a8692f", 3.5)),
  },

  // toppings
  butter: { r: 8, draw: () => rect(-8, -6, 16, 12, 3, "#f8e08a", st("#e8c860", 1)) + rect(-5, -4, 6, 2.5, 1, "rgba(255,255,255,0.5)") },
  "cheese-snow": { r: 30, draw: (rnd) => path(blob(rnd, 30, 0.3, 11), "#fbfaf5", st("#ebe6da", 1.5)) + dots(rnd, 18, 24, 1.2, "#e2dccd") },
  cinnamon: { r: 2, draw: () => circle(0, 0, 1.3, "#8a4a24") },
  chia: { r: 1.5, draw: () => circle(0, 0, 1.3, "#3a3a3a") },
  coconut: { r: 3, draw: () => line("M-2.5,0 Q0,-2 2.5,0", "#ffffff", 1.8) },
  "choc-chip": { r: 4, draw: () => path("M0,-4 C3,0 4,3 0,4 C-4,3 -3,0 0,-4Z", "#3b2218") },
  "choc-chunk": { r: 7, draw: () => rect(-6, -6, 12, 12, 2, "#4a2a1c") + rect(-4, -4, 5, 2.5, 1, "rgba(255,255,255,0.15)") },
  honey: { r: 40, draw: () => line("M-40,-6 C-28,-18 -18,10 -6,-2 C6,-14 16,12 28,0 C34,-6 38,-4 40,-2", "#f1b52c", 3.5, op(0.9)) },
  "yogurt-dollop": { r: 18, draw: (rnd) => path(blob(rnd, 18, 0.12, 8), "#fbf9f4", st("#e8e2d4", 1.2)) + line("M0,0 C4,-2 5,4 0,5 C-7,6 -8,-4 -2,-8 C7,-12 13,-1 10,7", "#e5ded0", 1.4) },
  "oil-drizzle": { r: 30, draw: () => line("M-28,4 C-18,-10 -6,10 4,-2 C12,-12 22,6 28,-4", "#c9b03a", 2.6, op(0.75)) },
  swirl: { r: 30, draw: () => line("M0,0 C8,-3 9,9 0,11 C-14,13 -16,-6 -5,-15 C12,-25 28,-2 21,15", "rgba(70,40,15,0.16)", 3) },
  paprika: { r: 2, draw: () => circle(0, 0, 1.5, "#c9381f") },
  "chili-flakes": { r: 2, draw: () => rect(-1.4, -1, 2.8, 2, 0.5, "#c22a18") },
  browned: { r: 14, draw: (rnd) => path(blob(rnd, 13, 0.4, 7), "rgba(140,70,20,0.35)") },
  "cheese-melt": { r: 22, draw: (rnd) => path(blob(rnd, 21, 0.35, 9), "#f6dc8a", op(0.9)) },

  // drink garnish (side views)
  straw: { r: 0, draw: () => "" },
  ice: { r: 9, draw: () => rect(-8, -8, 16, 16, 4, "rgba(255,255,255,0.45)", st("rgba(255,255,255,0.7)", 1)) },
  "lemon-rim": { r: 0, draw: () => "" },
  "orange-rim": { r: 0, draw: () => "" },
};

export const ITEM_KINDS = Object.keys(ITEMS);

export function parseItem(entry: string): { kind: string; count: number } {
  const [kind, count] = entry.split("*");
  return { kind, count: count ? Number(count) : 1 };
}

/** Problems with a spec (unknown kinds) — for build-time validation. */
export function artProblems(spec: ArtSpec): string[] {
  const problems: string[] = [];
  for (const entry of [...(spec.items ?? []), ...(spec.side ?? [])]) {
    const { kind, count } = parseItem(entry);
    if (!ITEMS[kind]) problems.push(`unknown art item "${kind}"`);
    if (!Number.isInteger(count) || count < 1 || count > 80) problems.push(`bad count in "${entry}"`);
  }
  return problems;
}

// ── layout ──────────────────────────────────────────────────────────────────

function rng(seed: string): Rnd {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Area = { kind: "circle"; cx: number; cy: number; r: number } | { kind: "rect"; x: number; y: number; w: number; h: number };

function samplePoint(area: Area, rnd: Rnd, margin: number): [number, number] {
  if (area.kind === "circle") {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * Math.max(0, area.r - margin);
    return [area.cx + Math.cos(a) * d, area.cy + Math.sin(a) * d];
  }
  return [area.x + margin + rnd() * Math.max(0, area.w - 2 * margin), area.y + margin + rnd() * Math.max(0, area.h - 2 * margin)];
}

function areaCenter(area: Area): [number, number] {
  return area.kind === "circle" ? [area.cx, area.cy] : [area.x + area.w / 2, area.y + area.h / 2];
}

interface Placed {
  x: number;
  y: number;
  r: number;
}

/** Scatter items inside an area: big pieces avoid each other, small bits fill in. */
function layout(entries: string[], area: Area, rnd: Rnd, scale = 1): string {
  const placed: Placed[] = [];
  let out = "";
  for (const entry of entries) {
    const { kind, count } = parseItem(entry);
    const shape = ITEMS[kind];
    if (!shape || shape.r === 0) continue;
    const r = shape.r * scale;
    for (let i = 0; i < count; i++) {
      const big = r >= 10;
      let best: [number, number] = areaCenter(area);
      let bestScore = -Infinity;
      const tries = big ? 80 : 14;
      for (let t = 0; t < tries; t++) {
        // A single large piece sits near the middle.
        const p: [number, number] =
          count === 1 && r >= 28 && entries.length <= 4 && t === 0 ? jitter(areaCenter(area), rnd, 18) : samplePoint(area, rnd, r * 0.75);
        let score = Infinity;
        for (const q of placed) {
          if (!big && q.r < 10) continue;
          score = Math.min(score, Math.hypot(p[0] - q.x, p[1] - q.y) - (r + q.r) * (big && q.r >= 10 ? 0.85 : 0.6));
        }
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
        if (score >= 0) break;
      }
      placed.push({ x: best[0], y: best[1], r });
      const rot = shape.upright ? (rnd() - 0.5) * 16 : rnd() * 360;
      const zoom = scale === 1 ? "" : ` scale(${f2(scale)})`;
      out += g(shape.draw(rnd), `translate(${f2(best[0])} ${f2(best[1])}) rotate(${f2(rot)})${zoom}`);
    }
  }
  return out;
}

const jitter = (p: [number, number], rnd: Rnd, d: number): [number, number] => [p[0] + (rnd() - 0.5) * d, p[1] + (rnd() - 0.5) * d];

/** Props placed in fixed slots around the vessel. */
function props(entries: string[], slots: [number, number][], rnd: Rnd, scale = 1.2): string {
  let out = "";
  let slot = 0;
  for (const entry of entries) {
    const { kind, count } = parseItem(entry);
    const shape = ITEMS[kind];
    if (!shape) continue;
    for (let i = 0; i < count && slot < slots.length; i++, slot++) {
      const [x, y] = slots[slot];
      const rot = shape.upright ? (rnd() - 0.5) * 20 : rnd() * 360;
      out += g(ellipse(3, 5, shape.r * 0.9, shape.r * 0.7, SHADE) + shape.draw(rnd), `translate(${x} ${y}) rotate(${f2(rot)}) scale(${scale})`);
    }
  }
  return out;
}

// ── vessels ─────────────────────────────────────────────────────────────────

const fillColor = (spec: ArtSpec, fallback: string) => (spec.fill ? FILLS[spec.fill] : fallback);

function topDown(spec: ArtSpec, rnd: Rnd): string {
  const items = spec.items ?? [];
  const side = spec.side ?? [];
  const roundSlots: [number, number][] = [
    [355, 248],
    [48, 58],
    [352, 52],
    [46, 246],
  ];
  let base = "";
  let area: Area;
  let slots = roundSlots;

  switch (spec.vessel) {
    case "plate": {
      base = ellipse(206, 160, 130, 128, SHADE) + circle(200, 150, 128, "#fbf8f2", st("#e7dccb", 2)) + circle(200, 150, 100, "#f5efe4") + circle(200, 150, 100, "none", st("#ece2d0", 1.5));
      if (spec.fill) base += path(blob(rnd, 84, 0.12, 9), FILLS[spec.fill], ' transform="translate(200 150)"');
      area = { kind: "circle", cx: 200, cy: 150, r: 94 };
      break;
    }
    case "bowl": {
      base = ellipse(207, 161, 124, 122, SHADE) + circle(200, 150, 122, "#fdfaf4", st("#e4d8c4", 2.5)) + circle(200, 150, 100, fillColor(spec, FILLS.broth)) + circle(200, 150, 99, "none", st("rgba(70,40,15,0.12)", 6));
      area = { kind: "circle", cx: 200, cy: 150, r: 90 };
      break;
    }
    case "clay": {
      base =
        ellipse(207, 161, 136, 122, SHADE) +
        ellipse(66, 150, 18, 13, "#9a4622") +
        ellipse(334, 150, 18, 13, "#9a4622") +
        circle(200, 150, 120, "#ad5530", st("#8c3f1e", 3)) +
        circle(200, 150, 102, fillColor(spec, FILLS.beans)) +
        circle(200, 150, 101, "none", st("rgba(60,25,10,0.22)", 5)) +
        ellipse(140, 72, 26, 7, "rgba(255,255,255,0.18)", ' transform="rotate(-30 140 72)"');
      area = { kind: "circle", cx: 200, cy: 150, r: 92 };
      break;
    }
    case "pan": {
      base =
        ellipse(190, 162, 120, 118, SHADE) +
        rect(282, 138, 112, 22, 11, "#2f2f33") +
        circle(380, 149, 5, "rgba(255,255,255,0.15)") +
        circle(180, 150, 116, "#3b3b40") +
        circle(180, 150, 102, fillColor(spec, "#2b2b2f")) +
        circle(180, 150, 101, "none", st("rgba(0,0,0,0.25)", 4));
      area = { kind: "circle", cx: 180, cy: 150, r: 92 };
      slots = [
        [44, 248],
        [44, 56],
      ];
      break;
    }
    case "dish": {
      base =
        rect(52, 50, 310, 222, 28, SHADE) +
        rect(30, 128, 30, 44, 12, "#efe7da") +
        rect(340, 128, 30, 44, 12, "#efe7da") +
        rect(45, 40, 310, 220, 28, "#f7f3ec", st("#e3d7c3", 2)) +
        rect(63, 58, 274, 184, 16, fillColor(spec, FILLS.gratin)) +
        rect(63, 58, 274, 184, 16, "none", st("rgba(70,40,15,0.15)", 5));
      area = { kind: "rect", x: 70, y: 64, w: 260, h: 172 };
      slots = [];
      break;
    }
    case "tray": {
      base =
        rect(46, 54, 320, 212, 12, SHADE) +
        rect(38, 44, 324, 212, 12, "#9aa1ab") +
        rect(46, 52, 308, 196, 8, "#b7bdc6") +
        path("M58,62 L346,58 L342,240 L60,244Z", fillColor(spec, FILLS.parchment));
      area = { kind: "rect", x: 66, y: 68, w: 268, h: 166 };
      slots = [];
      break;
    }
    case "board": {
      base =
        rect(58, 64, 300, 196, 24, SHADE) +
        rect(330, 128, 54, 44, 16, "#b98a5a") +
        circle(366, 150, 7, "rgba(0,0,0,0.0)", st("#9a6e42", 3)) +
        rect(40, 52, 310, 196, 24, "#c99a68") +
        line("M60,90 C140,80 220,100 330,88 M58,150 C150,140 240,162 334,150 M62,210 C150,204 230,220 330,206", "#b8875a", 2);
      area = { kind: "rect", x: 62, y: 70, w: 266, h: 160 };
      slots = [];
      break;
    }
    default:
      throw new Error(`not a top-down vessel: ${spec.vessel}`);
  }

  return base + layout(items, area, rnd, spec.scale) + props(side, slots, rnd);
}

function sideView(spec: ArtSpec, rnd: Rnd): string {
  const items = spec.items ?? [];
  const side = spec.side ?? [];
  const layers = (spec.layers ?? (spec.fill ? [spec.fill] : ["orange-juice"])).map((name) => FILLS[name]);
  const kinds = new Set(items.map((entry) => parseItem(entry).kind));

  // Body outline per vessel: top/bottom y and half-widths.
  const v =
    spec.vessel === "glass"
      ? { top: 34, bottom: 272, wTop: 62, wBottom: 50, liquid: 78, radius: 10 }
      : spec.vessel === "cup"
        ? { top: 92, bottom: 268, wTop: 66, wBottom: 54, liquid: 116, radius: 14 }
        : { top: 70, bottom: 270, wTop: 68, wBottom: 68, liquid: items.length ? 98 : 84, radius: 22 };
  const cx = 200;
  const xAt = (y: number) => v.wTop + ((v.wBottom - v.wTop) * (y - v.top)) / (v.bottom - v.top);

  let s = ellipse(cx + 8, v.bottom + 6, v.wBottom + 30, 10, SHADE);
  s += props(
    side,
    [
      [84, 232],
      [318, 234],
      [80, 160],
      [322, 164],
    ],
    rnd,
    1.7,
  );

  if (kinds.has("straw")) s += line(`M${cx + 10},${v.bottom - 30} L${cx + 46},${v.top - 26}`, "#e85d75", 9) + line(`M${cx + 10},${v.bottom - 30} L${cx + 46},${v.top - 26}`, "#ffffff", 3, op(0.6));

  // Liquid layers from the bottom up.
  const total = v.bottom - v.liquid;
  const step = total / layers.length;
  const clipId = `c${Math.floor(rnd() * 1e9)}`;
  const body = `M${cx - v.wTop},${v.top} L${cx + v.wTop},${v.top} L${cx + v.wBottom},${v.bottom - v.radius} Q${cx + v.wBottom},${v.bottom} ${cx + v.wBottom - v.radius},${v.bottom} L${cx - v.wBottom + v.radius},${v.bottom} Q${cx - v.wBottom},${v.bottom} ${cx - v.wBottom},${v.bottom - v.radius}Z`;
  s += `<clipPath id="${clipId}"><path d="${body}"/></clipPath>`;
  let liquid = "";
  layers.forEach((color, i) => {
    const y0 = v.bottom - step * (i + 1);
    liquid += rect(cx - v.wTop - 2, y0, v.wTop * 2 + 4, step + 1, 0, color);
  });
  liquid += ellipse(cx, v.liquid, xAt(v.liquid), 7, layers[layers.length - 1]) + ellipse(cx, v.liquid, xAt(v.liquid) - 4, 5, "rgba(255,255,255,0.18)");
  if (kinds.has("ice")) {
    for (let i = 0; i < 3; i++) liquid += g(ITEMS.ice.draw(rnd), `translate(${f2(cx - 30 + i * 28 + rnd() * 8)} ${f2(v.liquid + 22 + rnd() * 26)}) rotate(${f2(rnd() * 40 - 20)})`);
  }
  s += `<g clip-path="url(#${clipId})">${liquid}</g>`;

  // Glass / jar body.
  const glassFill = spec.vessel === "jar" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.22)";
  s += path(body, glassFill, st("rgba(60,40,20,0.28)", 2.5));
  s += line(`M${cx - v.wTop + 12},${v.top + 18} L${cx - v.wBottom + 12},${v.bottom - 22}`, "rgba(255,255,255,0.55)", 6);
  if (spec.vessel === "jar") {
    if (items.length === 0) {
      s += rect(cx - v.wTop - 6, v.top - 22, (v.wTop + 6) * 2, 26, 6, "#c9c3b6", st("#a8a090", 1.5)) + line(`M${cx - v.wTop},${v.top - 14} L${cx + v.wTop},${v.top - 14}`, "#b3ac9c", 1.5);
      s += rect(cx - 44, 150, 88, 54, 6, "#fbf6ea", st("#e2d7bf", 1.5)) + line(`M${cx - 28},170 L${cx + 28},170 M${cx - 20},184 L${cx + 20},184`, "#c9b892", 3);
    } else {
      s += ellipse(cx, v.top, v.wTop, 8, "none", st("rgba(60,40,20,0.28)", 2.5));
    }
  } else {
    s += ellipse(cx, v.top, v.wTop, 7, "rgba(255,255,255,0.25)", st("rgba(60,40,20,0.28)", 2.5));
  }

  // Garnish on top of the liquid.
  const topArea: Area = { kind: "rect", x: cx - xAt(v.liquid) + 14, y: v.liquid - 10, w: (xAt(v.liquid) - 14) * 2, h: 16 };
  s += layout(
    items.filter((entry) => !["straw", "ice", "lemon-rim", "orange-rim"].includes(parseItem(entry).kind)),
    topArea,
    rnd,
    spec.scale,
  );
  if (kinds.has("lemon-rim")) s += g(ITEMS["lemon-slice"].draw(rnd), `translate(${cx + v.wTop - 4} ${v.top + 4}) scale(1.35)`);
  if (kinds.has("orange-rim")) s += g(ITEMS["orange-slice"].draw(rnd), `translate(${cx + v.wTop - 4} ${v.top + 4}) scale(1.2)`);
  return s;
}

/** Full SVG for a dish. `seed` (the recipe id) keeps the layout stable between builds. */
export function renderDishArt(spec: ArtSpec, seed: string): string {
  const rnd = rng(seed);
  const inner = ["glass", "jar", "cup"].includes(spec.vessel) ? sideView(spec, rnd) : topDown(spec, rnd);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img">${inner}</svg>`;
}

/** One item enlarged on a neutral square — for the preview sheet. */
export function renderItem(kind: string): string {
  const shape = ITEMS[kind];
  if (!shape) throw new Error(`unknown art item "${kind}"`);
  const scale = Math.min(3.2, 40 / Math.max(shape.r, 4));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">${g(shape.draw(rng(kind)), `scale(${f2(scale)})`)}</svg>`;
}
