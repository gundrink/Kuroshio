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
  { baseline: 0.62, amp: 0.03, waves: 0.45, speed: 0.07, phase: 0.4, steep: 0.02, alpha: 0.5, depth: 0.08 },
  { baseline: 0.76, amp: 0.04, waves: 0.7, speed: -0.05, phase: 1.7, steep: 0.025, alpha: 0.75, depth: 0.16 },
  { baseline: 0.9, amp: 0.028, waves: 0.9, speed: 0.09, phase: 2.6, steep: 0.02, alpha: 1, depth: 0.24 },
];

const STARS = [
  { x: 0.78, y: 0.2, size: 16, drift: 0.012, spin: 0.35 },
  { x: 0.9, y: 0.34, size: 9, drift: -0.008, spin: -0.55 },
  { x: 0.66, y: 0.42, size: 7, drift: 0.006, spin: 0.8 },
  { x: 0.84, y: 0.58, size: 11, drift: 0.01, spin: -0.25 },
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
  body.addColorStop(0, `rgba(120, 24, 36, ${0.22 * swell.alpha})`);
  body.addColorStop(0.1, `rgba(90, 12, 22, ${0.4 * swell.alpha})`);
  body.addColorStop(0.34, `rgba(28, 6, 10, ${0.84 * swell.alpha})`);
  body.addColorStop(1, `rgba(5, 5, 5, ${swell.alpha})`);
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
  context.strokeStyle = `rgba(180, 48, 62, ${0.2 * swell.alpha})`;
  context.lineWidth = 48 * ratio;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.restore();

  context.save();
  context.shadowColor = "rgba(255, 180, 188, 0.28)";
  context.shadowBlur = 28 * ratio;
  context.beginPath();
  for (let x = -60; x <= width + 60; x += step) {
    const point = surface(x, seconds, swell, width, height, scroll, ratio);
    if (x === -60) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.strokeStyle = `rgba(255, 214, 218, ${0.22 * swell.alpha})`;
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
    foam.addColorStop(0, `rgba(200, 16, 46, ${glow})`);
    foam.addColorStop(1, "rgba(200, 16, 46, 0)");
    context.fillStyle = foam;
    context.beginPath();
    context.ellipse(point.x, point.y, 62 * ratio, 14 * ratio, -0.08, 0, Math.PI * 2);
    context.fill();
  }
}

function drawShuriken(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  ratio: number,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const radius = (i % 2 === 0 ? size : size * 0.28) * ratio;
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fillStyle = "rgba(244, 241, 234, 0.86)";
  context.fill();
  context.beginPath();
  context.arc(0, 0, size * 0.16 * ratio, 0, Math.PI * 2);
  context.fillStyle = "#050505";
  context.fill();
  context.restore();
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
      context.strokeStyle = "rgba(200, 16, 46, 0.045)";
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

      const moon = context.createRadialGradient(
        width * 0.82,
        height * 0.16,
        0,
        width * 0.82,
        height * 0.16,
        90 * ratio,
      );
      moon.addColorStop(0, "rgba(200, 16, 46, 0.28)");
      moon.addColorStop(0.45, "rgba(200, 16, 46, 0.08)");
      moon.addColorStop(1, "rgba(200, 16, 46, 0)");
      context.fillStyle = moon;
      context.beginPath();
      context.arc(width * 0.82, height * 0.16, 90 * ratio, 0, Math.PI * 2);
      context.fill();

      for (const star of STARS) {
        const travel = ((star.x + seconds * star.drift) % 1.15) - 0.05;
        drawShuriken(
          context,
          travel * width,
          star.y * height,
          star.size,
          seconds * star.spin,
          ratio,
        );
      }

      const depth = context.createLinearGradient(0, height * 0.42, 0, height);
      depth.addColorStop(0, "rgba(5, 5, 5, 0)");
      depth.addColorStop(0.42, "rgba(48, 8, 14, 0.28)");
      depth.addColorStop(0.72, "rgba(12, 4, 6, 0.72)");
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
