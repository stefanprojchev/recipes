/**
 * Idle kitchen screen. After IDLE_MS without a touch the #idle-screen
 * overlay shows a big clock and the menu — today's in the morning and
 * daytime, tomorrow's in the evening, only a dim clock at night. A tap
 * anywhere returns to the page underneath.
 *
 * - Never starts while cook mode is open (the chef is reading steps).
 * - Running timers stay visible: the timer tray sits above the overlay.
 * - The content drifts a few pixels each minute against screen burn-in.
 * - Around 03:00 it reloads once, picking up a newly deployed weekly plan.
 *
 * Preview it without waiting: open any page with `?idle`.
 *
 * Idle state lives at module level (the overlay is transition:persist-ed);
 * DOM listeners are bound per page through onPageReady's signal.
 */
import { onPageReady } from "@/scripts/lifecycle";

const IDLE_MS = 3 * 60_000;
const DATA_MAX_AGE_MS = 30 * 60_000;
/** Minutes after midnight. */
const MORNING = 6 * 60 + 30;
const MIDDAY = 12 * 60;
const EVENING = 17 * 60;
const NIGHT = 22 * 60;
const RELOAD_HOUR = 3;
const RELOAD_FLAG = "tavce:idle-reloaded";

interface IdleDay {
  title: string;
  href: string;
  meals: Array<{ meal: string; label: string; items: string[] }>;
  prep: string[];
  work: Array<{ key: string; title: string }>;
}

/** Work-order ticks saved by the chef sheet (src/scripts/checklist.ts, key `work:<date>`). */
function ticked(date: string): Set<string> {
  try {
    const raw = localStorage.getItem(`tavce:checklist:work:${date}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch (err) {
    console.warn("Idle screen: could not read work-order ticks:", err);
    return new Set();
  }
}

type Period = "morning" | "day" | "evening" | "night";

let idleTimer: number | undefined;
let tickTimer: number | undefined;
let shown = false;
let lastMinute = -1;
let wakeLock: WakeLockSentinel | null = null;
let data: { src: string; fetchedAt: number; days: Record<string, IdleDay> } | undefined;

function overlay(): HTMLElement | null {
  return document.getElementById("idle-screen");
}

/** Everything behind the overlay except the timer tray (running timers stay usable). */
function background(): HTMLElement[] {
  return [document.querySelector("body > header"), document.querySelector("main"), document.querySelector("body > footer")].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodOf(minutes: number): Period {
  if (minutes >= NIGHT || minutes < MORNING) return "night";
  if (minutes < MIDDAY) return "morning";
  if (minutes < EVENING) return "day";
  return "evening";
}

/** Which meal to emphasise right now. */
function currentMeal(minutes: number): string {
  if (minutes < 10 * 60) return "breakfast";
  if (minutes < 14 * 60) return "lunch";
  return "snack";
}

async function loadData(src: string): Promise<void> {
  if (data && data.src === src && Date.now() - data.fetchedAt < DATA_MAX_AGE_MS) return;
  try {
    const response = await fetch(src, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { days: Record<string, IdleDay> };
    data = { src, fetchedAt: Date.now(), days: json.days };
  } catch (err) {
    // Keep showing the last good data (or just the clock) — never a blank screen.
    console.warn("Idle screen: could not load menu data:", err);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPanel(root: HTMLElement, now: Date) {
  const panel = root.querySelector<HTMLElement>("[data-idle-panel]");
  if (!panel) return;
  const labels = root.dataset;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const period = periodOf(minutes);
  panel.replaceChildren();
  if (period === "night") return;

  const showTomorrow = period === "evening";
  const date = new Date(now);
  if (showTomorrow) date.setDate(date.getDate() + 1);
  const day = data?.days[isoDate(date)];

  const heading = el("p", "text-base font-bold tracking-wide text-primary uppercase", showTomorrow ? labels.labelTomorrow : labels.labelToday);
  panel.append(heading);

  if (!day) {
    panel.append(el("p", "mt-4 text-3xl text-muted-foreground", labels.labelNone ?? ""));
    return;
  }

  if (showTomorrow) panel.append(el("p", "mt-1 font-heading text-3xl font-semibold first-letter:uppercase", day.title));

  // Chef's progress: the first work-order item not ticked off yet.
  if (!showTomorrow && day.work.length > 0) {
    const done = ticked(isoDate(date));
    const next = day.work.find((item) => !done.has(item.key));
    const text = next ? (labels.labelNext ?? "").replace("{title}", next.title) : (labels.labelAllDone ?? "");
    panel.append(el("p", "mt-2 inline-flex rounded-full bg-primary px-5 py-2 text-xl font-semibold text-primary-foreground", text));
  }

  const list = el("ul", "mt-6 flex flex-col gap-5");
  const highlight = showTomorrow ? "" : currentMeal(minutes);
  for (const { meal, label, items } of day.meals) {
    const active = meal === highlight;
    const row = el(
      "li",
      active
        ? "rounded-3xl border-2 border-primary bg-primary/8 px-6 py-4"
        : "rounded-3xl border-2 border-transparent px-6 py-4",
    );
    row.append(el("p", "text-base font-bold tracking-wide text-primary uppercase", label));
    for (const item of items) row.append(el("p", "font-heading text-3xl leading-snug font-semibold", item));
    list.append(row);
  }
  panel.append(list);

  if (!showTomorrow && day.prep.length > 0) {
    const prep = el("div", "mt-6 rounded-3xl border-2 border-warning bg-warning/25 px-6 py-4");
    prep.append(el("p", "text-base font-bold tracking-wide uppercase", labels.labelPrep));
    for (const line of day.prep) prep.append(el("p", "mt-1 text-xl", line));
    panel.append(prep);
  }

  if (period === "morning") {
    const open = el("a", "mt-8 inline-flex h-16 items-center rounded-2xl bg-secondary px-8 text-xl font-semibold text-secondary-foreground", labels.labelOpen);
    open.href = day.href;
    open.dataset.idleLink = "";
    panel.append(open);
  }
}

function tick() {
  const root = overlay();
  if (!root || !shown) return;
  const now = new Date();
  const lang = document.documentElement.lang;
  const minutes = now.getHours() * 60 + now.getMinutes();

  const clock = root.querySelector<HTMLElement>("[data-idle-clock]");
  if (clock) {
    clock.textContent = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  }
  if (minutes === lastMinute) return;
  lastMinute = minutes;

  // Once a minute: date, period, panel, burn-in drift, nightly reload.
  const night = periodOf(minutes) === "night";
  root.toggleAttribute("data-night", night);
  const dateLine = root.querySelector<HTMLElement>("[data-idle-date]");
  if (dateLine) {
    // Prefer the build-time title: some browsers lack Macedonian date names
    // and would fall back to English.
    dateLine.textContent =
      data?.days[isoDate(now)]?.title ??
      new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(now);
  }
  renderPanel(root, now);

  const content = root.querySelector<HTMLElement>("[data-idle-content]");
  if (content && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const drift = () => Math.round((Math.random() - 0.5) * (night ? 120 : 24));
    content.style.transform = `translate(${drift()}px, ${drift()}px)`;
  }

  if (now.getHours() === RELOAD_HOUR) {
    const today = isoDate(now);
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) !== today) {
        sessionStorage.setItem(RELOAD_FLAG, today);
        location.reload();
      }
    } catch (err) {
      console.warn("Idle screen: nightly reload skipped:", err);
    }
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
  } catch (err) {
    // iPad: Auto-Lock → Never keeps it on regardless; this is a bonus.
    console.warn("Idle screen: wake lock unavailable:", err);
  }
}

async function show() {
  const root = overlay();
  if (!root || shown) return;
  if (document.body.dataset.cooking !== undefined) {
    arm(); // cook mode is open — try again later
    return;
  }
  if (root.dataset.src) await loadData(root.dataset.src);
  shown = true;
  lastMinute = -1;
  root.style.display = "";
  for (const el of background()) el.inert = true;
  root.focus({ preventScroll: true });
  tick();
  tickTimer = window.setInterval(tick, 1000);
  void requestWakeLock();
}

function hide() {
  const root = overlay();
  if (root) root.style.display = "none";
  for (const el of background()) el.inert = false;
  shown = false;
  clearInterval(tickTimer);
  tickTimer = undefined;
  wakeLock?.release().catch((err: unknown) => console.warn("Idle screen: wake lock release failed:", err));
  wakeLock = null;
  arm();
}

function arm() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => void show(), IDLE_MS);
}

onPageReady((signal) => {
  const root = overlay();
  if (!root) return;
  // A navigation means someone is using the tablet.
  if (shown) hide();

  const activity = () => {
    if (!shown) arm();
  };
  for (const type of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
    document.addEventListener(type, activity, { signal, passive: true, capture: true });
  }
  // Any key dismisses the screen (keyboard users can't "tap anywhere").
  document.addEventListener(
    "keydown",
    () => {
      if (shown) hide();
    },
    { signal },
  );

  root.addEventListener(
    "click",
    (event) => {
      // The "open cooking sheet" link navigates; any other tap just dismisses.
      const link = event.target instanceof Element ? event.target.closest("[data-idle-link]") : null;
      if (!link) event.preventDefault();
      hide();
    },
    { signal },
  );

  // Preview: open any page with ?idle to show the screen right away.
  if (new URL(location.href).searchParams.has("idle")) void show();
  else arm();
});
