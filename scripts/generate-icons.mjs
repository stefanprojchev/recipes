/**
 * Regenerates the PWA / home-screen icons in public/icons/ from the logo
 * mark. Run after changing the logo: `node scripts/generate-icons.mjs`.
 * Keep the mark paths in sync with src/components/LogoMark.astro.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const TERRACOTTA = "#b4532a";
const CREAM = "#fbf6ee";

const mark = (scale, offset) => `
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <g fill="none" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round">
      <path d="M17 14c-2.2-2.6 2.2-4.6 0-8"/><path d="M24 14c-2.2-2.6 2.2-4.6 0-8"/><path d="M31 14c-2.2-2.6 2.2-4.6 0-8"/>
    </g>
    <g fill="${CREAM}">
      <rect x="4" y="18" width="40" height="5" rx="2.5"/>
      <circle cx="4.5" cy="22.5" r="2.8"/><circle cx="43.5" cy="22.5" r="2.8"/>
      <path d="M7.5 25h33c-1.1 8.8-7.7 14.5-16.5 14.5S8.6 33.8 7.5 25Z"/>
    </g>
    <path d="M13.5 30.5c1.75-1.4 3.5-1.4 5.25 0s3.5 1.4 5.25 0 3.5-1.4 5.25 0 3.5 1.4 5.25 0" fill="none" stroke="${TERRACOTTA}" stroke-width="1.8" stroke-linecap="round"/>
  </g>`;

/** Full-bleed square: iOS and Android masks round the corners themselves. */
const fullBleed = (markScale) => {
  const size = 48 * markScale;
  const offset = (48 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${TERRACOTTA}"/>${mark(markScale, offset)}</svg>`;
};

const icons = [
  // "any" icons: mark fills most of the square.
  { file: "icon-192.png", size: 192, svg: fullBleed(0.78) },
  { file: "icon-512.png", size: 512, svg: fullBleed(0.78) },
  // Maskable: keep the mark inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed(0.62) },
  // iOS home screen.
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed(0.72) },
];

mkdirSync("public/icons", { recursive: true });
for (const { file, size, svg } of icons) {
  await sharp(Buffer.from(svg), { density: 72 * (size / 48) }).resize(size, size).png().toFile(`public/icons/${file}`);
  console.log(`public/icons/${file}`);
}
