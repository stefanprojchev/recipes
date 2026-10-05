/**
 * Worker entry — serves static assets and handles API routes.
 *
 * Static assets are served directly by Cloudflare without invoking this
 * Worker; only requests that don't match an asset (e.g. /api/*) reach it.
 *
 * The contact handler validates the Turnstile token, then sends the
 * submission via the Email Service `send_email` binding.
 */

interface EmailSender {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

/** The slice of the R2 binding API used by serveMedia. */
interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}
interface R2Object {
  size: number;
  httpEtag: string;
  range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
}
interface R2ObjectBody extends R2Object {
  body: ReadableStream;
}
interface R2Bucket {
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectBody | R2Object | null>;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Private R2 bucket with recipe photos/videos (scripts/media.mjs uploads). */
  MEDIA: R2Bucket;
  EMAIL: EmailSender;
  TURNSTILE_SECRET: string;
  /** Comma-separated hostnames allowed to produce tokens (localhost via .dev.vars). */
  TURNSTILE_HOSTNAMES: string;
  CONTACT_EMAIL: string;
  EMAIL_FROM: string;
}

interface TurnstileResponse {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes": string[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    if (url.pathname.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
      return serveMedia(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

/** Sanitize message body — preserves newlines for textarea content. */
function sanitize(input: string): string {
  return input.replace(/[<>]/g, "").trim().slice(0, 1000);
}

/** Sanitize header-style fields (name, email) — strips CRLF to prevent injection. */
function sanitizeHeader(input: string): string {
  return input.replace(/[<>\r\n]/g, "").trim().slice(0, 200);
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const name = sanitizeHeader(formData.get("name")?.toString() ?? "");
    const email = sanitizeHeader(formData.get("email")?.toString() ?? "");
    const message = sanitize(formData.get("message")?.toString() ?? "");
    const turnstileToken = formData.get("cf-turnstile-response")?.toString() ?? "";

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "All fields are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const turnstile = await verifyTurnstile(turnstileToken, env);
    if (!turnstile.ok) {
      console.warn("Turnstile rejected:", turnstile.reason);
      return new Response(JSON.stringify({ error: "Captcha verification failed." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await env.EMAIL.send({
      from: env.EMAIL_FROM,
      to: env.CONTACT_EMAIL,
      subject: `Contact form: ${name}`,
      text: `From: ${name} (${email})\n\n${message}`,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Contact form error:", err);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Verifies the token AND that it was minted for this form (`action`) on an
 * allowed hostname — `success` alone accepts tokens solved on any site
 * using a leaked site key, or for a different widget/action.
 */
async function verifyTurnstile(
  token: string,
  env: Env,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }),
  });

  const data: TurnstileResponse = await res.json();
  if (!data.success) {
    return { ok: false, reason: `siteverify failed: ${data["error-codes"].join(", ")}` };
  }
  if (data.action !== "contact") {
    return { ok: false, reason: `unexpected action: ${data.action}` };
  }

  const allowedHostnames = (env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (allowedHostnames.length === 0) {
    return { ok: false, reason: "TURNSTILE_HOSTNAMES is not configured" };
  }
  if (!data.hostname || !allowedHostnames.includes(data.hostname)) {
    return { ok: false, reason: `unexpected hostname: ${data.hostname}` };
  }

  return { ok: true };
}

/**
 * Streams a photo/video from the private R2 bucket. Same origin as the site,
 * so Cloudflare Access protects it. Keys contain a content hash, so responses
 * are immutable. Honors Range (video scrubbing on iPad/Android) and
 * If-None-Match.
 */
async function serveMedia(request: Request, env: Env, url: URL): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice("/media/".length));
  } catch {
    return new Response("Bad media path", { status: 400 });
  }
  if (!key || key.includes("..") || !/^(images|videos)\//.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const object = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    // Private: behind Access, never in shared caches. Immutable: keys carry a content hash.
    headers.set("Cache-Control", "private, max-age=31536000, immutable");

    if (!("body" in object)) return new Response(null, { status: 304, headers });

    const ranged = request.headers.has("Range") && object.range !== undefined;
    if (ranged && object.range) {
      const { offset, length, suffix } = object.range;
      const start = suffix !== undefined ? object.size - suffix : (offset ?? 0);
      const size = suffix ?? length ?? object.size - start;
      headers.set("Content-Range", `bytes ${start}-${start + size - 1}/${object.size}`);
      headers.set("Content-Length", String(size));
    } else {
      headers.set("Content-Length", String(object.size));
    }

    return new Response(request.method === "HEAD" ? null : object.body, { status: ranged ? 206 : 200, headers });
  } catch (err) {
    console.error(`Media error for "${key}":`, err);
    return new Response("Media unavailable", { status: 500 });
  }
}
