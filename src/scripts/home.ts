/** Home page: "Surprise me" opens a random recipe; "In season" shows the current month. */
import { navigate } from "astro:transitions/client";
import { onPageReady } from "@/scripts/lifecycle";

onPageReady((signal) => {
  // The site is built weekly — pick the month on the tablet, not at build time.
  const seasonal = document.querySelector<HTMLElement>("[data-seasonal]");
  if (seasonal) {
    const month = String(new Date().getMonth() + 1);
    const blocks = [...seasonal.querySelectorAll<HTMLElement>("[data-season-month]")];
    const current = blocks.find((block) => block.dataset.seasonMonth === month);
    for (const block of blocks) block.style.display = block === current ? "" : "none";
    seasonal.style.display = current ? "" : "none";
  }

  const button = document.getElementById("surprise-me");
  if (!button) return;

  button.addEventListener(
    "click",
    () => {
      let urls: unknown;
      try {
        urls = JSON.parse(button.dataset.urls ?? "[]");
      } catch (err) {
        console.error("Surprise me: invalid data-urls", err);
        return;
      }
      if (!Array.isArray(urls) || urls.length === 0) {
        console.error("Surprise me: no recipes to pick from");
        return;
      }
      const url = urls[Math.floor(Math.random() * urls.length)];
      if (typeof url === "string") void navigate(url);
    },
    { signal },
  );
});
