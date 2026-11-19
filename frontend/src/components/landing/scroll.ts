"use client";

import { useEffect, useRef } from "react";

/** One rAF loop for the whole page: subscribers run only on frames after a scroll or resize. */
type Sub = () => void;
const subs = new Set<Sub>();
let ticking = false;
let bound = false;

function frame() {
  ticking = false;
  subs.forEach((s) => s());
}
function request() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}
function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
}

export function useScrollFrame(cb: Sub) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    bind();
    const s: Sub = () => ref.current();
    subs.add(s);
    request();
    return () => {
      subs.delete(s);
    };
  }, []);
}

/** Progress (0..1) of a tall section whose first child is a sticky 100vh stage. */
export function pinProgress(el: HTMLElement | null): number {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const travel = r.height - window.innerHeight;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, -r.top / travel));
}

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal-on-enter for every [data-in] element, plus parallax for [data-parallax] images. */
export function usePageMotion(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // A fully clipped element (wipe reveals start at clip-path: inset(100%)) never intersects,
    // so wipes are observed through their parent and the class is applied to the element.
    const targetOf = new Map<Element, Element>();
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (targetOf.get(e.target) ?? e.target).classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );
    el.querySelectorAll<HTMLElement>("[data-in]").forEach((n) => {
      const watch = n.dataset.in?.startsWith("wipe") && n.parentElement ? n.parentElement : n;
      targetOf.set(watch, n);
      io.observe(watch);
    });
    return () => io.disconnect();
  }, [root]);

  useScrollFrame(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    const vh = window.innerHeight;
    el.querySelectorAll<HTMLElement>("[data-parallax]").forEach((img) => {
      const r = img.parentElement!.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const rate = Number(img.dataset.parallax) || 0.12;
      const off = (r.top + r.height / 2 - vh / 2) / vh; // -1..1 around centre
      img.style.transform = `translate3d(0, ${(-off * rate * 100).toFixed(2)}%, 0)`;
    });
  });
}

/** Counts a number up once when it enters the viewport. */
export function useCountUp(ref: React.RefObject<HTMLElement | null>, to: number, decimals: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) => v.toFixed(decimals);
    if (reducedMotion()) {
      el.textContent = fmt(to);
      return;
    }
    el.textContent = fmt(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const dur = 1400;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 4);
        el.textContent = fmt(to * eased);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref, to, decimals]);
}
