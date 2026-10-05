/** Print button on the printable weekly menu. */
import { onPageReady } from "@/scripts/lifecycle";

onPageReady((signal) => {
  const button = document.querySelector<HTMLButtonElement>("[data-print]");
  if (!button) return;
  button.addEventListener("click", () => window.print(), { signal });
});
