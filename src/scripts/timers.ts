/**
 * Kitchen timers. Any `[data-timer-start]` button (data-minutes, data-label)
 * starts one; running timers show in the persisted #timer-tray and ring
 * (sound + vibration) until dismissed.
 *
 * Unlike page scripts, timer state and the ticking interval are module-level
 * on purpose: timers must survive ClientRouter navigation. Only DOM listeners
 * are bound per page through onPageReady's signal. State is mirrored to
 * localStorage so a reload keeps the timers too.
 */
import { onPageReady } from "@/scripts/lifecycle";

interface Timer {
  id: string;
  label: string;
  /** Epoch ms when a running timer ends; null while paused or done. */
  endsAt: number | null;
  /** Remaining ms while paused. */
  remainingMs: number;
  done: boolean;
}

const STORAGE_KEY = "tavce:timers";
const ALARM_INTERVAL_MS = 1500;

let timers: Timer[] = loadTimers();
let tickHandle: number | undefined;
let alarmHandle: number | undefined;
let audio: AudioContext | undefined;

function loadTimers(): Timer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Timer[]) : [];
  } catch (err) {
    console.warn("Could not restore timers:", err);
    return [];
  }
}

function saveTimers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch (err) {
    console.warn("Could not persist timers:", err);
  }
}

function remaining(timer: Timer, now = Date.now()): number {
  return timer.endsAt === null ? timer.remainingMs : Math.max(0, timer.endsAt - now);
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// --- Sound -------------------------------------------------------------------

/** Must run inside a user gesture (the start tap) or browsers keep audio muted. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch (err) {
    console.warn("Timer sound unavailable:", err);
  }
}

function beep() {
  if (!audio) return;
  const start = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    const t = start + i * 0.25;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }
  navigator.vibrate?.([200, 100, 200]);
}

function syncAlarm() {
  const ringing = timers.some((timer) => timer.done);
  if (ringing && alarmHandle === undefined) {
    beep();
    alarmHandle = window.setInterval(beep, ALARM_INTERVAL_MS);
  } else if (!ringing && alarmHandle !== undefined) {
    clearInterval(alarmHandle);
    alarmHandle = undefined;
  }
}

// --- Ticking -----------------------------------------------------------------

function tick() {
  const now = Date.now();
  const finished: string[] = [];
  for (const timer of timers) {
    if (timer.endsAt !== null && timer.endsAt <= now) {
      timer.endsAt = null;
      timer.remainingMs = 0;
      timer.done = true;
      finished.push(timer.label);
    }
  }
  const changed = finished.length > 0;
  if (changed) {
    saveTimers();
    render();
    announce(finished.map((label) => `${label} — ${tray()?.dataset.labelDone ?? ""}`).join(". "));
    syncAlarm();
  } else {
    updateClocks();
  }
  syncTicking();
}

function syncTicking() {
  const running = timers.some((timer) => timer.endsAt !== null);
  if (running && tickHandle === undefined) {
    tickHandle = window.setInterval(tick, 250);
  } else if (!running && tickHandle !== undefined) {
    clearInterval(tickHandle);
    tickHandle = undefined;
  }
}

// --- Actions -----------------------------------------------------------------

export function startTimer(label: string, minutes: number) {
  unlockAudio();
  const existing = timers.find((timer) => timer.label === label && !timer.done);
  if (existing) {
    // Tapping the same step's timer again restarts it rather than stacking a duplicate.
    existing.endsAt = Date.now() + minutes * 60_000;
    existing.remainingMs = 0;
  } else {
    timers.push({
      // Not crypto.randomUUID(): it only exists in secure contexts, and the tablet
      // may load the dev server over plain http on the LAN.
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      label,
      endsAt: Date.now() + minutes * 60_000,
      remainingMs: 0,
      done: false,
    });
  }
  commit();
}

function act(id: string, action: string) {
  const timer = timers.find((t) => t.id === id);
  if (!timer) return;
  const now = Date.now();
  switch (action) {
    case "pause":
      timer.remainingMs = remaining(timer, now);
      timer.endsAt = null;
      break;
    case "resume":
      timer.endsAt = now + timer.remainingMs;
      break;
    case "add-minute":
      if (timer.endsAt !== null) timer.endsAt += 60_000;
      else timer.remainingMs += 60_000;
      break;
    case "cancel":
    case "dismiss":
      timers = timers.filter((t) => t.id !== id);
      break;
    default:
      console.error(`Unknown timer action "${action}"`);
      return;
  }
  commit();
}

function commit() {
  saveTimers();
  render();
  syncTicking();
  syncAlarm();
}

// --- Rendering ---------------------------------------------------------------

function tray(): HTMLElement | null {
  return document.getElementById("timer-tray");
}

function button(label: string, action: string, timer: Timer, primary = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.timerAction = action;
  el.dataset.timerId = timer.id;
  el.textContent = label;
  // Several timers each have "Pause"/"Cancel" — name which one for screen readers.
  el.setAttribute("aria-label", `${label}: ${timer.label}`);
  el.className = primary
    ? "h-12 rounded-full bg-primary-foreground px-5 text-lg font-bold text-primary"
    : "h-12 rounded-full bg-secondary px-4 text-base font-semibold text-secondary-foreground hover:bg-accent";
  return el;
}

/** Finished timers first, then the one ending soonest. */
function sorted(): Timer[] {
  const now = Date.now();
  return [...timers].sort((a, b) => Number(b.done) - Number(a.done) || remaining(a, now) - remaining(b, now));
}

/** Rebuilds the cards — only on structural changes, so taps never land on a replaced node. */
function render() {
  const el = tray();
  if (!el) return;
  const labels = el.dataset;

  // Keep keyboard focus on the same control across the rebuild.
  const active = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active ? `${active.dataset.timerId}|${active.dataset.timerAction}` : null;

  const list = el.querySelector<HTMLElement>("[data-timer-list]") ?? el;
  list.replaceChildren();

  for (const timer of sorted()) {
    const card = document.createElement("div");
    card.dataset.timerCard = timer.id;
    // Done: a steady, high-contrast highlight (no fading pulse — keeps the text readable).
    card.className = timer.done
      ? "pointer-events-auto rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg ring-4 ring-primary/40"
      : "pointer-events-auto rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg";

    const title = document.createElement("p");
    title.className = "truncate text-base font-semibold";
    title.textContent = timer.label;

    const clock = document.createElement("p");
    clock.dataset.timerClock = timer.id;
    clock.setAttribute("role", "timer");
    clock.className = "font-heading text-5xl font-semibold tabular-nums";
    clock.textContent = timer.done ? (labels.labelDone ?? "") : formatClock(remaining(timer));

    const actions = document.createElement("div");
    actions.className = "mt-3 flex flex-wrap gap-2";
    if (timer.done) {
      actions.append(button(labels.labelDismiss ?? "", "dismiss", timer, true));
    } else {
      actions.append(
        timer.endsAt === null
          ? button(labels.labelResume ?? "", "resume", timer)
          : button(labels.labelPause ?? "", "pause", timer),
        button(labels.labelAddMinute ?? "", "add-minute", timer),
        button(labels.labelCancel ?? "", "cancel", timer),
      );
    }

    card.append(title, clock, actions);
    list.append(card);
  }

  if (focusKey) {
    const [id, action] = focusKey.split("|");
    list.querySelector<HTMLElement>(`[data-timer-id="${id}"][data-timer-action="${action}"]`)?.focus();
  }
}

/** One short announcement when timers finish — the clocks themselves are not live regions. */
function announce(message: string) {
  const region = tray()?.querySelector<HTMLElement>("[data-timer-announce]");
  if (region) region.textContent = message;
}

function updateClocks() {
  const el = tray();
  if (!el) return;
  const now = Date.now();
  for (const timer of timers) {
    if (timer.done) continue;
    const clock = el.querySelector<HTMLElement>(`[data-timer-clock="${timer.id}"]`);
    if (clock) clock.textContent = formatClock(remaining(timer, now));
  }
}

// --- Page wiring -------------------------------------------------------------

onPageReady((signal) => {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;

      const start = target?.closest<HTMLElement>("[data-timer-start]");
      if (start) {
        const minutes = Number(start.dataset.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          console.error("Timer button has an invalid data-minutes:", start.dataset.minutes);
          return;
        }
        startTimer(start.dataset.label ?? "", minutes);
        return;
      }

      const action = target?.closest<HTMLElement>("[data-timer-action]");
      if (action?.dataset.timerId && action.dataset.timerAction) {
        act(action.dataset.timerId, action.dataset.timerAction);
      }
    },
    { signal },
  );

  render();
  tick();
});
