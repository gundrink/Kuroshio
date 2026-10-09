"use client";

import { useEffect, useRef } from "react";

const bursts = [
  { start: 0.05, end: 0.2, x: 68, y: 36 },
  { start: 0.4, end: 0.56, x: 30, y: 48 },
  { start: 0.74, end: 0.9, x: 64, y: 34 },
];

const rays = [-28, 98, 206];

function span(progress: number, start: number, end: number) {
  if (progress <= start || progress >= end) return null;
  return (progress - start) / (end - start);
}

export function ScrollStrike() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const groups = [...node.querySelectorAll<HTMLElement>(".strike-burst")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.setAttribute("hidden", "");
      return;
    }

    let frame = 0;
    const paint = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      groups.forEach((group, index) => {
        const burst = bursts[index];
        const raw = span(progress, burst.start, burst.end);
        const ring = group.querySelector<HTMLElement>(".strike-ring");
        const stars = [...group.querySelectorAll<HTMLElement>(".strike-star")];
        if (raw == null || !ring) {
          group.style.opacity = "0";
          return;
        }
        const fade = Math.sin(raw * Math.PI);
        group.style.opacity = "1";
        ring.style.opacity = String(0.75 * (1 - raw));
        ring.style.transform = `translate(-50%, -50%) scale(${0.35 + raw * 16})`;
        stars.forEach((star, ray) => {
          const angle = (rays[ray] * Math.PI) / 180;
          const distance = 28 + raw * 210;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          star.style.opacity = String(0.92 * fade);
          star.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${raw * 200}deg) scale(${1.15 - raw * 0.45})`;
        });
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="scroll-strike" ref={root} aria-hidden="true">
      {bursts.map((burst) => (
        <div
          className="strike-burst"
          key={burst.start}
          style={{ left: `${burst.x}%`, top: `${burst.y}vh` }}
        >
          <span className="strike-ring" />
          {rays.map((ray) => (
            <img key={ray} className="strike-star" src="/scroll-shuriken.png" alt="" width={38} height={29} />
          ))}
        </div>
      ))}
    </div>
  );
}
