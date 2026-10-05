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

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
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
