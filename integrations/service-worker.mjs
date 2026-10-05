/**
 * Astro integration: after `astro build`, writes dist/sw.js from
 * integrations/sw-template.js with the list of every built page and asset
 * to precache, and a version hash so each deploy replaces the old cache.
 * Registered in production only by src/scripts/pwa.ts.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Files the tablet needs offline. Images are cached on first view instead. */
const PRECACHE_PATTERN = /\.(html|css|js|json|woff2|webmanifest|svg|png)$/;
/** Never precache: the worker itself, and the starter's OG/legal leftovers. */
const EXCLUDE = [/^sw\.js$/, /^og\//, /^blog\//, /^contact\//, /^privacy\//, /^terms\//, /^404\.html$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export default function serviceWorker() {
  return {
    name: "tavce:service-worker",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const files = walk(outDir)
          .map((path) => relative(outDir, path).split(sep).join("/"))
          .filter((file) => PRECACHE_PATTERN.test(file) && !EXCLUDE.some((re) => re.test(file)))
          .sort();

        const hash = createHash("sha256");
        for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
        const version = hash.digest("hex").slice(0, 12);

        // "recipes/zelnik/index.html" → "/recipes/zelnik/"
        const urls = files.map((file) => "/" + file.replace(/(^|\/)index\.html$/, "$1"));

        const template = readFileSync(new URL("./sw-template.js", import.meta.url), "utf8");
        const VERSION_LINE = 'const VERSION = "__VERSION__";';
        const PRECACHE_LINE = "const PRECACHE = __PRECACHE__;";
        if (!template.includes(VERSION_LINE) || !template.includes(PRECACHE_LINE)) {
          throw new Error("service-worker: sw-template.js is missing the VERSION/PRECACHE placeholder lines");
        }
        const sw = template
          .replace(VERSION_LINE, `const VERSION = ${JSON.stringify(version)};`)
          .replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(urls, null, 2)};`);
        writeFileSync(join(outDir, "sw.js"), sw);
        logger.info(`sw.js written — ${urls.length} files precached, version ${version}`);
      },
    },
  };
}
