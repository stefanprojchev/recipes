/**
 * Dev-only: `astro dev` has no Worker, so /media/* (normally streamed from
 * R2 by worker/index.ts) is served from the local .media/ mirror that
 * scripts/media.mjs writes. Supports Range so videos can be scrubbed.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(".media");
const TYPES = { ".webp": "image/webp", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png" };

export default function devMedia() {
  return {
    name: "tavce:dev-media",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/media/")) return next();
          const relative = normalize(decodeURIComponent(req.url.slice("/media/".length).split("?")[0]));
          const path = join(ROOT, relative);
          if (!path.startsWith(ROOT) || !existsSync(path)) {
            res.statusCode = 404;
            res.end(`Not in .media/ mirror: ${relative} (upload with scripts/media.mjs)`);
            return;
          }
          const { size } = statSync(path);
          res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
          res.setHeader("Accept-Ranges", "bytes");
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
          if (range) {
            const start = range[1] ? Number(range[1]) : size - Number(range[2]);
            const end = range[1] && range[2] ? Number(range[2]) : size - 1;
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
            res.setHeader("Content-Length", String(end - start + 1));
            createReadStream(path, { start, end }).pipe(res);
          } else {
            res.setHeader("Content-Length", String(size));
            createReadStream(path).pipe(res);
          }
        });
      },
    },
  };
}
