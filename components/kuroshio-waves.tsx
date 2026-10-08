"use client";

import { useEffect, useRef } from "react";

type Swell = {
  baseline: number;
  amp: number;
  waves: number;
  speed: number;
  phase: number;
  steep: number;
  alpha: number;
  depth: number;
};

const SWELLS: Swell[] = [
  { baseline: 0.58, amp: 0.07, waves: 0.8, speed: 0.16, phase: 0.4, steep: 0.06, alpha: 0.55, depth: 0.12 },
  { baseline: 0.74, amp: 0.085, waves: 1.05, speed: -0.12, phase: 1.7, steep: 0.08, alpha: 0.8, depth: 0.28 },
  { baseline: 0.9, amp: 0.05, waves: 1.35, speed: 0.2, phase: 2.6, steep: 0.05, alpha: 1, depth: 0.46 },
];

function surface(
  x: number,
  seconds: number,
  swell: Swell,
  width: number,
  height: number,
  scroll: number,
  ratio: number,
) {
  const k = (Math.PI * 2 * swell.waves) / width;
  const phase = x * k + seconds * swell.speed + swell.phase - scroll * 0.0014 * swell.depth;
  const amp = swell.amp * height;
  const primary = Math.sin(phase);
  const breath = Math.sin(phase * 0.37 + seconds * 0.15) * 0.18;
  const y = swell.baseline * height + (primary + breath) * amp + scroll * ratio * swell.depth;
  const lean = Math.cos(phase) * amp * swell.steep;
  return { x: x + lean, y, lift: primary };
}

function traceSwell(
  context: CanvasRenderingContext2D,
  seconds: number,
  swell: Swell,
  width: number,
  height: number,
  ratio: number,
  scroll: number,
) {
  const step = 4 * ratio;
  context.beginPath();
  for (let x = -60; x <= width + 60; x += step) {
    const point = surface(x, seconds, swell, width, height, scroll, ratio);
    if (x === -60) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.lineTo(width + 60, height + 40);
  context.lineTo(-60, height + 40);
  context.closePath();

  const crestTop = height * (swell.baseline - swell.amp * 1.35);
  const body = context.createLinearGradient(0, crestTop, 0, crestTop + height * 0.5);
  body.addColorStop(0, `rgba(186, 214, 196, ${0.28 * swell.alpha})`);
  body.addColorStop(0.1, `rgba(46, 120, 104, ${0.45 * swell.alpha})`);
  body.addColorStop(0.34, `rgba(10, 42, 36, ${0.82 * swell.alpha})`);
  body.addColorStop(1, `rgba(5, 8, 7, ${swell.alpha})`);
  context.fillStyle = body;
  context.fill();

  context.save();
  context.clip();
  context.beginPath();
  for (let x = -60; x <= width + 60; x += step) {
    const point = surface(x, seconds, swell, width, height, scroll, ratio);
    if (x === -60) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.strokeStyle = `rgba(150, 196, 176, ${0.22 * swell.alpha})`;
  context.lineWidth = 48 * ratio;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.restore();

  context.save();
  context.shadowColor = "rgba(210, 230, 216, 0.35)";
  context.shadowBlur = 28 * ratio;
  context.beginPath();
  for (let x = -60; x <= width + 60; x += step) {
    const point = surface(x, seconds, swell, width, height, scroll, ratio);
    if (x === -60) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.strokeStyle = `rgba(226, 238, 230, ${0.28 * swell.alpha})`;
  context.lineWidth = 1.4 * ratio;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.restore();

  for (let x = step * 2; x < width; x += step * 2) {
    const point = surface(x, seconds, swell, width, height, scroll, ratio);
    if (point.lift < 0.35) continue;
    const glow = Math.max(0, point.lift - 0.35) * 0.18 * swell.alpha;
    const foam = context.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      54 * ratio,
    );
    foam.addColorStop(0, `rgba(220, 236, 226, ${glow})`);
    foam.addColorStop(1, "rgba(220, 236, 226, 0)");
    context.fillStyle = foam;
    context.beginPath();
    context.ellipse(point.x, point.y, 62 * ratio, 14 * ratio, -0.08, 0, Math.PI * 2);
    context.fill();
  }
}

export function KuroshioWaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let running = true;
    let scrollY = window.scrollY;
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const draw = (time: number) => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,0.03)";
      context.lineWidth = 1;
      const grid = 56 * ratio;
      for (let x = 0; x <= width; x += grid) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += grid) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const seconds = reduced ? 2 : time / 1000;
      const scroll = reduced ? 0 : scrollY;
      for (const swell of SWELLS) {
        traceSwell(context, seconds, swell, width, height, ratio, scroll);
      }

      const depth = context.createLinearGradient(0, height * 0.42, 0, height);
      depth.addColorStop(0, "rgba(5, 5, 5, 0)");
      depth.addColorStop(0.42, "rgba(8, 36, 28, 0.28)");
      depth.addColorStop(0.72, "rgba(4, 14, 12, 0.72)");
      depth.addColorStop(1, "#050505");
      context.fillStyle = depth;
      context.fillRect(0, 0, width, height);

      const scrim = context.createLinearGradient(0, 0, width * 0.48, 0);
      scrim.addColorStop(0, "rgba(5, 5, 5, 0.62)");
      scrim.addColorStop(0.7, "rgba(5, 5, 5, 0.16)");
      scrim.addColorStop(1, "rgba(5, 5, 5, 0)");
      context.fillStyle = scrim;
      context.fillRect(0, 0, width, height);

      if (!reduced) frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <canvas ref={canvasRef} className="wave-canvas" aria-hidden="true" />;
}
