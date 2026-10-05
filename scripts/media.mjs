#!/usr/bin/env node
/**
 * Add a photo or video to the recipe media library.
 *
 *   node scripts/media.mjs add <file> --id <id> [--alt-mk "…"] [--alt-en "…"]
 *                                 [--poster <image>] [--replace] [--local | --no-upload]
 *   node scripts/media.mjs list
 *
 * Images → WebP at 480/960/1600 px (never upscaled, EXIF rotation applied).
 * Videos → MP4. With ffmpeg installed (`brew install ffmpeg`) any format is
 *   converted to iPad/Android-friendly H.264 ≤1280px with a poster frame;
 *   without it, only .mp4 is accepted and uploaded as-is (poster via --poster).
 *
 * Every generated file goes to the local .media/ mirror (served by `astro dev`)
 * and is uploaded to the R2 bucket from wrangler.toml:
 *   default      remote bucket (production)
 *   --local      wrangler's local R2 (for `pnpm preview:worker`)
 *   --no-upload  mirror only
 * Finally src/content/media.yaml gets the entry recipes reference by id.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import sharp from "sharp";
import YAML from "yaml";

const MEDIA_YAML = "src/content/media.yaml";
const MIRROR = ".media";
const IMAGE_WIDTHS = [480, 960, 1600];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff", ".heic"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, positional: [], flags: {} };
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) args.flags[name] = true;
      else {
        args.flags[name] = next;
        i++;
      }
    } else args.positional.push(token);
  }
  return args;
}

function bucketName() {
  const toml = readFileSync("wrangler.toml", "utf8");
  const match = /\[\[r2_buckets\]\][^[]*?binding\s*=\s*"MEDIA"[^[]*?bucket_name\s*=\s*"([^"]+)"/s.exec(toml);
  if (!match) fail('wrangler.toml has no [[r2_buckets]] entry with binding = "MEDIA"');
  return match[1];
}

function has(cmd) {
  return spawnSync("which", [cmd]).status === 0;
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function writeMirror(key, buffer) {
  const path = join(MIRROR, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  return path;
}

function upload(files, mode) {
  if (mode === "none") return;
  const bucket = bucketName();
  for (const { key, path, type } of files) {
    console.log(`  ↑ ${bucket}/${key}${mode === "local" ? " (local)" : ""}`);
    run("pnpm", ["exec", "wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", type, mode === "local" ? "--local" : "--remote"]);
  }
}

function loadYaml() {
  const doc = YAML.parseDocument(readFileSync(MEDIA_YAML, "utf8"));
  if (doc.errors.length > 0) fail(`${MEDIA_YAML}: ${doc.errors[0].message}`);
  if (YAML.isMap(doc.contents)) doc.contents.flow = false;
  return doc;
}

async function processImage(file, id, hash) {
  const base = sharp(file, { failOn: "error" }).rotate();
  const { width, height } = await base.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const widths = IMAGE_WIDTHS.filter((w) => w <= width);
  if (widths.length === 0) widths.push(width);
  const files = [];
  for (const w of widths) {
    const key = `images/${id}.${hash}-${w}.webp`;
    const buffer = await base.clone().resize({ width: w }).webp({ quality: 80 }).toBuffer();
    files.push({ key, path: writeMirror(key, buffer), type: "image/webp" });
  }
  return { entry: { type: "image", hash, width, height, widths }, files };
}

async function processVideo(file, id, hash, posterFile) {
  const key = `videos/${id}.${hash}.mp4`;
  const out = join(MIRROR, key);
  mkdirSync(dirname(out), { recursive: true });
  const files = [];
  let width;
  let height;
  let posterBuffer;

  if (has("ffmpeg")) {
    console.log("  ffmpeg: converting to H.264 MP4 (≤1280px, faststart)…");
    run("ffmpeg", ["-y", "-i", file, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]);
    const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", out]));
    ({ width, height } = probe.streams[0]);
    if (!posterFile) {
      const frame = join(MIRROR, `videos/${id}.${hash}-frame.png`);
      run("ffmpeg", ["-y", "-ss", "1", "-i", out, "-frames:v", "1", frame]);
      posterBuffer = readFileSync(frame);
    }
  } else {
    if (extname(file).toLowerCase() !== ".mp4") {
      fail("Without ffmpeg only .mp4 videos are accepted. Install it (`brew install ffmpeg`) or export the video as MP4 (H.264).");
    }
    console.log("  ffmpeg not found — uploading the MP4 as-is (make sure it is H.264).");
    copyFileSync(file, out);
  }
  files.push({ key, path: out, type: "video/mp4" });

  if (posterFile) posterBuffer = readFileSync(posterFile);
  if (posterBuffer) {
    const poster = sharp(posterBuffer).rotate().resize({ width: 1280, withoutEnlargement: true });
    const { data, info } = await poster.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    width ??= info.width;
    height ??= info.height;
    const posterKey = `videos/${id}.${hash}-poster.webp`;
    files.push({ key: posterKey, path: writeMirror(posterKey, data), type: "image/webp" });
  }

  const entry = { type: "video", hash, poster: Boolean(posterBuffer) };
  if (width && height) Object.assign(entry, { width, height });
  return { entry, files };
}

async function add({ positional, flags }) {
  const [file] = positional;
  const id = flags.id;
  if (!file || !existsSync(file)) fail("Usage: node scripts/media.mjs add <file> --id <id>");
  if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail("--id must be kebab-case, e.g. zelnik-hero");
  if (flags.poster !== undefined && (typeof flags.poster !== "string" || !existsSync(flags.poster))) fail("--poster must be an existing image file");

  const doc = loadYaml();
  if (doc.has(id) && !flags.replace) fail(`"${id}" already exists in ${MEDIA_YAML} — pass --replace to overwrite it`);

  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  const ext = extname(file).toLowerCase();
  console.log(`• ${file} → ${id}`);

  let result;
  if (IMAGE_EXT.has(ext)) {
    try {
      result = await processImage(file, id, hash);
    } catch (err) {
      fail(`Could not read the image (${err.message}).${ext === ".heic" ? " HEIC isn't supported here — export the photo as JPEG." : ""}`);
    }
  } else if (VIDEO_EXT.has(ext)) {
    result = await processVideo(file, id, hash, flags.poster);
  } else {
    fail(`Unsupported file type "${ext}"`);
  }

  const alt = {};
  if (typeof flags["alt-mk"] === "string") alt.mk = flags["alt-mk"];
  if (typeof flags["alt-en"] === "string") alt.en = flags["alt-en"];
  if (Object.keys(alt).length > 0) {
    if (!alt.mk) fail("--alt-mk is required when giving alt text (Macedonian is the default locale)");
    result.entry.alt = alt;
  }

  const mode = flags["no-upload"] ? "none" : flags.local ? "local" : "remote";
  upload(result.files, mode);

  doc.set(id, result.entry);
  writeFileSync(MEDIA_YAML, doc.toString());
  console.log(`✓ ${id} (${result.entry.type}) added to ${MEDIA_YAML}`);
  console.log(`  Use it in a recipe:  cover: ${id}   ·   gallery: [${id}]   ·   steps[].media: ${id}`);
}

function list() {
  const data = loadYaml().toJSON() ?? {};
  for (const [id, entry] of Object.entries(data)) {
    const size = entry.width ? `${entry.width}×${entry.height}` : "";
    console.log(`${entry.type.padEnd(6)} ${id.padEnd(32)} ${size}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "add") await add(args);
else if (args.command === "list") list();
else fail("Commands: add <file> --id <id> [...], list");
