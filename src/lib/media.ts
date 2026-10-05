import { getCollection, type CollectionEntry } from "astro:content";

export type Media = CollectionEntry<"media">;
export type ImageMedia = Media & { data: Extract<Media["data"], { type: "image" }> };
export type VideoMedia = Media & { data: Extract<Media["data"], { type: "video" }> };

/**
 * Media lives in the private R2 bucket and is served by the Worker at
 * /media/<key> (behind Cloudflare Access). In `astro dev` the same paths
 * are served from the local .media/ mirror (integrations/dev-media.mjs).
 */
export const MEDIA_BASE = "/media";

export function imageKey(id: string, hash: string, width: number): string {
  return `images/${id}.${hash}-${width}.webp`;
}
export function videoKey(id: string, hash: string): string {
  return `videos/${id}.${hash}.mp4`;
}
export function posterKey(id: string, hash: string): string {
  return `videos/${id}.${hash}-poster.webp`;
}

export function imageSrcset(media: ImageMedia): string {
  return media.data.widths.map((w) => `${MEDIA_BASE}/${imageKey(media.id, media.data.hash, w)} ${w}w`).join(", ");
}

/** The smallest generated width that covers `target` (or the largest available). */
export function imageSrc(media: ImageMedia, target: number): string {
  const widths = [...media.data.widths].sort((a, b) => a - b);
  const width = widths.find((w) => w >= target) ?? widths[widths.length - 1];
  return `${MEDIA_BASE}/${imageKey(media.id, media.data.hash, width)}`;
}

export function videoSrc(media: VideoMedia): string {
  return `${MEDIA_BASE}/${videoKey(media.id, media.data.hash)}`;
}

export function posterSrc(media: VideoMedia): string | undefined {
  return media.data.poster ? `${MEDIA_BASE}/${posterKey(media.id, media.data.hash)}` : undefined;
}

export function isImage(media: Media): media is ImageMedia {
  return media.data.type === "image";
}

export function isVideo(media: Media): media is VideoMedia {
  return media.data.type === "video";
}

let cache: Promise<Map<string, Media>> | undefined;

export function getMediaMap(): Promise<Map<string, Media>> {
  cache ??= getCollection("media").then((entries) => new Map(entries.map((entry) => [entry.id, entry])));
  return cache;
}

/** Resolve a media reference; a missing id is a build error (references are validated lazily by Astro). */
export async function resolveMedia(ref: { id: string }, where: string): Promise<Media> {
  const media = (await getMediaMap()).get(ref.id);
  if (!media) throw new Error(`${where}: unknown media "${ref.id}" — add it with scripts/media.mjs`);
  return media;
}
