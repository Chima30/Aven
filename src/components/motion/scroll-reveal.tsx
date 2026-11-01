"use client";

import { useEffect } from "react";

const SELECTOR = "#main > header, #main section, #main [data-reveal]";

/**
 * Scroll-triggered entrance animations for the app and public pages.
 * Purely presentational: content is rendered (and readable) without it,
 * nothing animates when the visitor prefers reduced motion, and elements
 * that are already on screen simply fade in.
 */
export function ScrollReveal({ routeKey, scope = "#main" }: { routeKey?: string; scope?: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const root = document.querySelector(scope);
    if (!root) return;
    document.documentElement.classList.add("motion-ok");

    let batch = 0;
    let batchTimer: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // Stagger items that enter together, capped so nothing waits long.
          el.style.setProperty("--reveal-delay", `${Math.min(batch, 6) * 70}ms`);
          batch += 1;
          el.classList.add("is-visible");
          io.unobserve(el);
        }
        window.clearTimeout(batchTimer);
        batchTimer = window.setTimeout(() => (batch = 0), 120);
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );

    const selector = SELECTOR.replaceAll("#main", scope);
    const scan = () => {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.classList.contains("reveal") || el.closest("[data-no-reveal], dialog")) continue;
        // A block whose items animate individually doesn't animate as a whole.
        if (!el.hasAttribute("data-reveal") && el.querySelector("[data-reveal]")) continue;
        // Animate the outermost block only (no double animation for nested cards).
        if (el.parentElement?.closest(".reveal")) continue;
        el.classList.add("reveal");
        io.observe(el);
      }
    };
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      window.clearTimeout(batchTimer);
    };
  }, [routeKey, scope]);
  return null;
}
