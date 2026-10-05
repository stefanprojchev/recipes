import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, parse } from "node:path";

interface OgImageOptions {
  title: string;
  description?: string;
  siteName?: string;
}

/**
 * Auto-detects the first .ttf or .woff font in public/fonts/.
 * Returns the font data and a cleaned-up font family name derived from the filename.
 */
function loadFont(): { data: ArrayBuffer; name: string } {
  const fontsDir = join(process.cwd(), "public", "fonts");
  const files = readdirSync(fontsDir)
    .filter((f) => /\.(ttf|woff)$/i.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error(
      "No .ttf or .woff font found in public/fonts/. Add a font file for OG image generation.",
    );
  }

  const file = files[0];
  const data = readFileSync(join(fontsDir, file)).buffer as ArrayBuffer;
  const name = parse(file).name.replace(/[-_](Regular|Bold|SemiBold|Medium|Light|Italic|\d+)/gi, "");

  return { data, name };
}

/**
 * Generates a PNG OG image at build time using Satori.
 *
 * Font is auto-detected from public/fonts/ — drop any .ttf or .woff file there
 * and it will be used automatically. The font family name is derived from the filename.
 */
export async function generateOgImage(options: OgImageOptions): Promise<Buffer> {
  // Update siteName per project — Paraglide messages are not available in .ts endpoints.
  const { title, description, siteName = "Project Name" } = options;

  const font = loadFont();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: 48,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      letterSpacing: "-0.02em",
                      maxWidth: "80%",
                    },
                    children: title,
                  },
                },
                description
                  ? {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 24,
                          color: "#a1a1aa",
                          maxWidth: "70%",
                        },
                        children: description,
                      },
                    }
                  : null,
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: 20,
                      color: "#71717a",
                      marginTop: "24px",
                    },
                    children: siteName,
                  },
                },
              ].filter(Boolean),
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: font.name,
          data: font.data,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });

  return Buffer.from(resvg.render().asPng());
}
