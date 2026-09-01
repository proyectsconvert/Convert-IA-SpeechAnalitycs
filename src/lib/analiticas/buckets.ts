/**
 * Cubetas de duración de llamada (segundos).
 * Inclusivo en límites inferiores, exclusivo en superiores salvo la última (≥ max).
 */
export interface DurationBucket {
  id: string;
  label: string;
  minSec: number;
  maxSec: number | null;
}

export const CALL_DURATION_BUCKETS: DurationBucket[] = [
  { id: "d0", label: "0–1 min", minSec: 0, maxSec: 60 },
  { id: "d1", label: "1–5 min", minSec: 60, maxSec: 300 },
  { id: "d2", label: "5–10 min", minSec: 300, maxSec: 600 },
  { id: "d3", label: "10–20 min", minSec: 600, maxSec: 1200 },
  { id: "d4", label: "Más de 20 min", minSec: 1200, maxSec: null },
];

export function callDurationBucketId(durationSeconds: number | null | undefined): string | null {
  if (durationSeconds == null || Number.isNaN(durationSeconds)) return null;
  const s = Math.max(0, durationSeconds);
  for (const b of CALL_DURATION_BUCKETS) {
    if (b.maxSec == null) return s >= b.minSec ? b.id : null;
    if (s >= b.minSec && s < b.maxSec) return b.id;
  }
  return null;
}

/** Mensajes totales en conversación WhatsApp (inclusivo en ambos extremos salvo >35). */
export interface MessageBucket {
  id: string;
  label: string;
  min: number;
  max: number | null;
}

export const WA_MESSAGE_BUCKETS: MessageBucket[] = [
  { id: "m1", label: "1–10 mensajes", min: 1, max: 10 },
  { id: "m2", label: "11–20 mensajes", min: 11, max: 20 },
  { id: "m3", label: "21–35 mensajes", min: 21, max: 35 },
  { id: "m4", label: "Más de 35 mensajes", min: 36, max: null },
];

export function waMessageBucketId(totalMessages: number | null | undefined): string | null {
  if (totalMessages == null || Number.isNaN(totalMessages)) return null;
  const n = Math.floor(totalMessages);
  if (n < 1) return null;
  for (const b of WA_MESSAGE_BUCKETS) {
    if (b.max == null) return n >= b.min ? b.id : null;
    if (n >= b.min && n <= b.max) return b.id;
  }
  return null;
}
