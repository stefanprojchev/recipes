/**
 * Contact form state machine + explicit Turnstile rendering.
 *
 * Turnstile is rendered explicitly (api.js is loaded with
 * `?render=explicit` in ContactForm.astro) — implicit rendering
 * (`class="cf-turnstile"`) stacks a duplicate widget on every
 * ClientRouter navigation. The widget id is kept per-init so the token
 * can be reset after every submit attempt (tokens are single-use).
 *
 * States: idle → sending (submit disabled) → completed | failed.
 * Completed clears the form; failed preserves values for retry. Both
 * end states offer a "Send another message" reset button.
 */
import { onPageReady } from "./lifecycle";

interface TurnstileApi {
  render(
    container: HTMLElement,
    params: { sitekey: string; action?: string },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onloadTurnstileCallback?: () => void;
  }
}

let turnstileReady: Promise<TurnstileApi> | undefined;

/** Resolves once api.js has loaded; safe to call before or after load. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileReady ??= new Promise((resolve) => {
    window.onloadTurnstileCallback = () => {
      if (!window.turnstile) {
        throw new Error("Turnstile onload fired but window.turnstile is missing");
      }
      resolve(window.turnstile);
    };
  });
  return turnstileReady;
}

type State = "idle" | "sending" | "completed" | "failed";

function required<T>(value: T | null | undefined, name: string): T {
  if (value == null) throw new Error(`Contact form: missing ${name}`);
  return value;
}

onPageReady(async (signal) => {
  const wrapperEl = document.getElementById("contact-form-wrapper");
  if (!wrapperEl) return; // current page has no contact form
  const wrapper = wrapperEl; // non-null alias — narrowing doesn't reach closures

  const form = required(
    wrapper.querySelector<HTMLFormElement>("form"),
    "form",
  );
  const container = required(
    wrapper.querySelector<HTMLElement>("[data-turnstile-container]"),
    "[data-turnstile-container]",
  );
  const result = required(
    wrapper.querySelector<HTMLElement>("[data-contact-result]"),
    "[data-contact-result]",
  );
  const resultMessage = required(
    wrapper.querySelector<HTMLElement>("[data-contact-result-message]"),
    "[data-contact-result-message]",
  );
  const sendAnother = required(
    wrapper.querySelector<HTMLButtonElement>("[data-contact-send-another]"),
    "[data-contact-send-another]",
  );
  const sitekey = required(wrapper.dataset.sitekey, "data-sitekey");
  const msgSuccess = required(wrapper.dataset.msgSuccess, "data-msg-success");
  const msgError = required(wrapper.dataset.msgError, "data-msg-error");
  const msgNetworkError = required(
    wrapper.dataset.msgNetworkError,
    "data-msg-network-error",
  );

  const submitBtn = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  const idleLabel = form.querySelector<HTMLElement>('[data-label="idle"]');
  const sendingLabel = form.querySelector<HTMLElement>(
    '[data-label="sending"]',
  );

  const turnstile = await loadTurnstile();
  if (signal.aborted) return;

  const widgetId = turnstile.render(container, {
    sitekey,
    action: "contact",
  });
  signal.addEventListener("abort", () => {
    try {
      turnstile.remove(widgetId);
    } catch {
      // Widget DOM was already swapped out by the navigation.
    }
  });

  function setState(state: State, message = ""): void {
    wrapper.dataset.state = state;

    const showForm = state === "idle" || state === "sending";
    form.classList.toggle("hidden", !showForm);
    result.classList.toggle("hidden", showForm);
    result.classList.toggle("flex", !showForm);

    if (submitBtn) submitBtn.disabled = state === "sending";
    idleLabel?.classList.toggle("hidden", state === "sending");
    sendingLabel?.classList.toggle("hidden", state !== "sending");

    resultMessage.textContent = message;
    resultMessage.classList.remove("text-success", "text-error");
    if (state === "completed") resultMessage.classList.add("text-success");
    if (state === "failed") resultMessage.classList.add("text-error");
  }

  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      const body = new FormData(form);
      setState("sending");

      try {
        const res = await fetch("/api/contact", { method: "POST", body });

        if (res.ok) {
          form.reset();
          setState("completed", msgSuccess);
        } else {
          setState("failed", msgError);
        }
      } catch {
        setState("failed", msgNetworkError);
      } finally {
        // Tokens are single-use — always request a fresh one.
        turnstile.reset(widgetId);
      }
    },
    { signal },
  );

  // Completed: form was cleared for a fresh message.
  // Failed: field values are preserved so the visitor can retry.
  sendAnother.addEventListener("click", () => setState("idle"), { signal });
});
