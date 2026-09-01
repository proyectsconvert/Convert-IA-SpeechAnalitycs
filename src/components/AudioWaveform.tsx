import { useEffect, useRef } from "react";

interface Props {
  isPlaying: boolean;
  progress: number; // 0-1
  barCount?: number;
}

export function AudioWaveform({ isPlaying, progress, barCount = 48 }: Props) {
  const barsRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!barsRef.current.length) {
      barsRef.current = Array.from({ length: barCount }, () => 0.15 + Math.random() * 0.85);
    }
  }, [barCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const barW = Math.max(1, (w - (barCount - 1) * gap) / barCount);
      const mid = h / 2;

      for (let i = 0; i < barCount; i++) {
        const x = i * (barW + gap);
        const pct = i / barCount;
        let amplitude = barsRef.current[i] || 0.3;

        if (isPlaying) {
          const wave = Math.sin(Date.now() / 200 + i * 0.4) * 0.15;
          const pulse = Math.sin(Date.now() / 600 + i * 0.2) * 0.1;
          amplitude = Math.min(1, Math.max(0.08, amplitude + wave + pulse));
        }

        const barH = amplitude * (h * 0.8);
        const played = pct <= progress;

        const gradient = ctx.createLinearGradient(x, mid - barH / 2, x, mid + barH / 2);
        if (played) {
          gradient.addColorStop(0, "hsl(217, 91%, 60%)");
          gradient.addColorStop(1, "hsl(217, 91%, 45%)");
        } else {
          gradient.addColorStop(0, "hsl(215, 20%, 65%)");
          gradient.addColorStop(1, "hsl(215, 15%, 50%)");
        }

        ctx.fillStyle = gradient;
        const radius = Math.min(barW / 2, 2);
        roundRect(ctx, x, mid - barH / 2, barW, barH, radius);
      }

      if (isPlaying) {
        animRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, progress, barCount]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}
