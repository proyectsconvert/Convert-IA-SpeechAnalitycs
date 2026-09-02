/**
 * Modelo de presentación editable WYSIWYG.
 *
 * Cada slide es un canvas 1920x1080. Los elementos se posicionan
 * en coordenadas absolutas (x, y) dentro de ese canvas y se exportan
 * a PPTX preservando posición y estilos básicos.
 */

import type { TotalAnalyzerV2Response } from "./reporteIaSchema";

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export type ElementBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  fontSize: number; // px @ 1920 canvas
  fontWeight: 400 | 500 | 600 | 700 | 800;
  fontStyle?: "normal" | "italic";
  color: string; // hex
  align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  bgColor?: string; // hex with alpha optional
};

export type ShapeElement = ElementBase & {
  type: "shape";
  shape: "rect" | "roundRect" | "ellipse" | "line";
  fill: string; // hex
  stroke?: string;
  strokeWidth?: number;
  radius?: number; // for roundRect
};

export type ImageElement = ElementBase & {
  type: "image";
  src: string; // data URL or remote URL
  fit?: "contain" | "cover";
};

export type SlideElement = TextElement | ShapeElement | ImageElement;

export type Slide = {
  id: string;
  background: string; // hex
  elements: SlideElement[];
  notes?: string;
};

export type EditablePresentation = {
  schemaVersion: 4;
  title: string;
  slides: Slide[];
  /** Snapshot del response que la generó, para regenerar/exportar contexto. */
  sourceResponse?: TotalAnalyzerV2Response;
};

export function isEditablePresentation(d: unknown): d is EditablePresentation {
  return (
    typeof d === "object" &&
    d !== null &&
    !Array.isArray(d) &&
    (d as EditablePresentation).schemaVersion === 4 &&
    Array.isArray((d as EditablePresentation).slides)
  );
}

// ---------------------------------------------------------------------------
// Helpers de creación
// ---------------------------------------------------------------------------

const uid = () => `el_${Math.random().toString(36).slice(2, 10)}`;

function txt(
  partial: Omit<TextElement, "id" | "type"> & { id?: string },
): TextElement {
  return {
    id: partial.id ?? uid(),
    type: "text",
    rotation: 0,
    ...partial,
  };
}

function shape(
  partial: Omit<ShapeElement, "id" | "type"> & { id?: string },
): ShapeElement {
  return {
    id: partial.id ?? uid(),
    type: "shape",
    rotation: 0,
    ...partial,
  };
}

// Theme tokens (hex, no Tailwind here — exports need raw values)
const C = {
  navy: "#0F172A",
  white: "#FFFFFF",
  blue: "#3B82F6",
  blueLight: "#60A5FA",
  slate700: "#334155",
  slate500: "#64748B",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  red: "#DC2626",
  redLight: "#FEE2E2",
  green: "#10B981",
  greenLight: "#ECFDF5",
  amber: "#D97706",
  indigo: "#6366F1",
};

// ---------------------------------------------------------------------------
// Generación inicial: TotalAnalyzerV2Response → slides editables
// ---------------------------------------------------------------------------

export function buildPresentationFromResponse(
  response: TotalAnalyzerV2Response,
  title = "Reporte Ejecutivo IA",
): EditablePresentation {
  const slides: Slide[] = [];
  const { meta, stats, analysis } = response;

  // ─── 1. Cover ───────────────────────────────────────────────
  slides.push({
    id: `slide_${slides.length + 1}`,
    background: C.navy,
    elements: [
      shape({
        x: 80, y: 880, w: 240, h: 8,
        shape: "rect", fill: C.blue,
      }),
      txt({
        x: 80, y: 380, w: 1760, h: 140,
        text: "Reporte Ejecutivo IA",
        fontSize: 96, fontWeight: 800, color: C.white, align: "left",
      }),
      txt({
        x: 80, y: 540, w: 1760, h: 60,
        text: meta.dateRange ?? "",
        fontSize: 36, fontWeight: 400, color: "#94A3B8", align: "left",
      }),
      txt({
        x: 80, y: 920, w: 1760, h: 40,
        text: `${meta.rowsAnalyzed.toLocaleString("es")} interacciones · ${
          meta.source.mode === "upload"
            ? meta.source.fileName ?? "Excel subido"
            : "Explorador de Datos"
        }`,
        fontSize: 22, fontWeight: 400, color: "#94A3B8", align: "left",
      }),
      txt({
        x: 80, y: 970, w: 1760, h: 32,
        text: `Generado ${new Date(meta.generatedAt).toLocaleString("es")}`,
        fontSize: 18, fontWeight: 400, color: "#64748B", align: "left",
      }),
    ],
  });

  // ─── 2. Resumen ejecutivo ───────────────────────────────────
  if (analysis.executive_summary) {
    const headline = (analysis.executive_summary.headline_stats ?? []).slice(0, 4);
    const cardW = (1760 - 60) / 4;
    const headlineEls: SlideElement[] = headline.flatMap((s, i) => {
      const x = 80 + i * (cardW + 20);
      const y = 700;
      return [
        shape({ x, y, w: cardW, h: 240, shape: "roundRect", fill: C.slate100, radius: 16, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x, y: y + 30, w: cardW, h: 110, text: s.value, fontSize: 64, fontWeight: 800, color: C.navy, align: "center" }),
        txt({ x: x + 20, y: y + 150, w: cardW - 40, h: 70, text: s.label, fontSize: 20, fontWeight: 500, color: C.slate500, align: "center", valign: "top" }),
      ];
    });
    slides.push({
      id: `slide_${slides.length + 1}`,
      background: C.white,
      elements: [
        ...sectionHeader("Resumen ejecutivo"),
        txt({
          x: 80, y: 220, w: 1760, h: 440,
          text: analysis.executive_summary.narrative ?? "",
          fontSize: 28, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.5,
        }),
        ...headlineEls,
      ],
    });
  }

  // ─── 3. Hallazgo crítico ────────────────────────────────────
  if (analysis.critical_finding) {
    slides.push({
      id: `slide_${slides.length + 1}`,
      background: C.white,
      elements: [
        shape({ x: 0, y: 0, w: 24, h: SLIDE_H, shape: "rect", fill: C.red }),
        txt({ x: 100, y: 80, w: 1760, h: 50, text: "HALLAZGO CRÍTICO", fontSize: 26, fontWeight: 800, color: C.red, align: "left" }),
        txt({ x: 100, y: 150, w: 1760, h: 130, text: analysis.critical_finding.title, fontSize: 56, fontWeight: 800, color: C.navy, align: "left" }),
        txt({ x: 100, y: 320, w: 1760, h: 280, text: analysis.critical_finding.statistic, fontSize: 200, fontWeight: 800, color: C.red, align: "left" }),
        txt({ x: 100, y: 640, w: 1760, h: 380, text: analysis.critical_finding.detail, fontSize: 30, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.4 }),
      ],
    });
  }

  // ─── 4. Métricas clave ──────────────────────────────────────
  if (analysis.key_metrics?.length) {
    const items = analysis.key_metrics.slice(0, 8);
    const cols = items.length <= 4 ? items.length : 4;
    const rows = Math.ceil(items.length / cols);
    const gap = 30;
    const cellW = (1760 - (cols - 1) * gap) / cols;
    const cellH = rows === 1 ? 480 : 380;
    const yStart = 240;
    const elements: SlideElement[] = [...sectionHeader("Métricas clave")];
    items.forEach((m, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 80 + c * (cellW + gap);
      const y = yStart + r * (cellH + gap);
      elements.push(
        shape({ x, y, w: cellW, h: cellH, shape: "roundRect", fill: C.slate50, radius: 16, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x, y: y + 30, w: cellW, h: 130, text: m.value, fontSize: 72, fontWeight: 800, color: C.navy, align: "center" }),
        txt({ x: x + 20, y: y + 175, w: cellW - 40, h: 60, text: m.label, fontSize: 22, fontWeight: 600, color: C.slate700, align: "center" }),
      );
      if (m.context) {
        elements.push(
          txt({ x: x + 30, y: y + 245, w: cellW - 60, h: cellH - 260, text: m.context, fontSize: 18, fontWeight: 400, color: C.slate500, align: "center", valign: "top", lineHeight: 1.4 }),
        );
      }
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements });
  }

  // ─── 5. Volumen por canal ───────────────────────────────────
  if (stats.by_canal.length > 0) {
    slides.push(buildBarChartSlide("Volumen por canal", stats.by_canal, C.blue));
  }

  // ─── 6. Promesas de pago ────────────────────────────────────
  if (stats.by_promesa_pago.length > 0) {
    slides.push(buildBarChartSlide("Promesas de pago", stats.by_promesa_pago, C.green));
  }

  // ─── 7. Top asesores ────────────────────────────────────────
  if (stats.by_asesor.length > 0) {
    slides.push(buildBarChartSlide("Top asesores por carga", stats.by_asesor.slice(0, 10), C.indigo));
  }

  // ─── 8. Análisis por asesor ─────────────────────────────────
  if (analysis.advisor_analysis) {
    const obs = (analysis.advisor_analysis.observations ?? []).slice(0, 6);
    const els: SlideElement[] = [
      ...sectionHeader("Análisis por asesor"),
      txt({ x: 80, y: 280, w: 700, h: 220, text: analysis.advisor_analysis.top_load_pct ?? "—", fontSize: 140, fontWeight: 800, color: C.navy, align: "left" }),
      txt({ x: 80, y: 510, w: 700, h: 80, text: "carga concentrada en top asesores", fontSize: 24, fontWeight: 500, color: C.slate500, align: "left" }),
    ];
    obs.forEach((o, i) => {
      els.push(txt({
        x: 840, y: 240 + i * 110, w: 1000, h: 100,
        text: `• ${o}`, fontSize: 22, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.4,
      }));
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  // ─── 9. Fortalezas ──────────────────────────────────────────
  if (analysis.positive_points?.length) {
    const items = analysis.positive_points.slice(0, 6);
    const cols = 2;
    const gap = 30;
    const cellW = (1760 - gap) / cols;
    const cellH = 300;
    const yStart = 240;
    const els: SlideElement[] = [...sectionHeader("Fortalezas detectadas")];
    items.forEach((p, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 80 + c * (cellW + gap);
      const y = yStart + r * (cellH + gap);
      els.push(
        shape({ x, y, w: cellW, h: cellH, shape: "roundRect", fill: C.greenLight, radius: 16, stroke: C.green, strokeWidth: 2 }),
        txt({ x: x + 30, y: y + 30, w: cellW - 60, h: 70, text: `✓ ${p.title}`, fontSize: 28, fontWeight: 700, color: "#065F46", align: "left" }),
        txt({ x: x + 30, y: y + 110, w: cellW - 60, h: cellH - 140, text: p.detail, fontSize: 20, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.4 }),
      );
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  // ─── 10. Oportunidades ──────────────────────────────────────
  if (analysis.improvement_opportunities?.length) {
    const items = analysis.improvement_opportunities.slice(0, 6);
    const cols = 2;
    const gap = 30;
    const cellW = (1760 - gap) / cols;
    const cellH = 380;
    const yStart = 240;
    const els: SlideElement[] = [...sectionHeader("Oportunidades de mejora")];
    const priorityColor: Record<string, string> = { CRÍTICO: C.red, ALTO: C.amber, MEDIO: C.slate500 };
    items.forEach((o, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 80 + c * (cellW + gap);
      const y = yStart + r * (cellH + gap);
      els.push(
        shape({ x, y, w: cellW, h: cellH, shape: "roundRect", fill: C.slate50, radius: 16, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x: x + 30, y: y + 25, w: 100, h: 40, text: String(i + 1).padStart(2, "0"), fontSize: 22, fontWeight: 700, color: "#94A3B8", align: "left" }),
        txt({ x: x + cellW - 200, y: y + 25, w: 170, h: 40, text: o.priority, fontSize: 18, fontWeight: 700, color: priorityColor[o.priority] ?? C.slate500, align: "right" }),
        txt({ x: x + 30, y: y + 80, w: cellW - 60, h: 70, text: o.title, fontSize: 26, fontWeight: 700, color: C.navy, align: "left" }),
        txt({ x: x + 30, y: y + 160, w: cellW - 60, h: 140, text: o.detail, fontSize: 19, fontWeight: 400, color: "#475569", align: "left", valign: "top", lineHeight: 1.4 }),
      );
      if (o.evidence) {
        els.push(txt({
          x: x + 50, y: y + cellH - 90, w: cellW - 100, h: 70,
          text: `"${o.evidence}"`, fontSize: 16, fontStyle: "italic", fontWeight: 400, color: C.slate500, align: "left", valign: "top",
        }));
      }
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  // ─── 11. Casos destacados ───────────────────────────────────
  if (analysis.highlighted_cases?.length) {
    const items = analysis.highlighted_cases.slice(0, 4);
    const cols = 2;
    const gap = 30;
    const cellW = (1760 - gap) / cols;
    const cellH = 380;
    const yStart = 240;
    const els: SlideElement[] = [...sectionHeader("Casos destacados")];
    items.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 80 + col * (cellW + gap);
      const y = yStart + row * (cellH + gap);
      els.push(
        shape({ x, y, w: cellW, h: cellH, shape: "roundRect", fill: C.white, radius: 16, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x: x + 30, y: y + 25, w: cellW - 60, h: 40, text: c.tag, fontSize: 18, fontWeight: 700, color: C.blue, align: "left" }),
        txt({ x: x + 30, y: y + 75, w: cellW - 60, h: 70, text: c.title, fontSize: 28, fontWeight: 700, color: C.navy, align: "left" }),
        txt({ x: x + 30, y: y + 160, w: cellW - 60, h: 140, text: c.body, fontSize: 20, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.4 }),
      );
      if (c.lesson) {
        els.push(txt({
          x: x + 30, y: y + cellH - 70, w: cellW - 60, h: 60,
          text: `Lección: ${c.lesson}`, fontSize: 18, fontStyle: "italic", fontWeight: 500, color: "#1E40AF", align: "left",
        }));
      }
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  // ─── 12. Recomendaciones ────────────────────────────────────
  if (analysis.recommendations?.length) {
    const items = analysis.recommendations.slice(0, 6);
    const els: SlideElement[] = [...sectionHeader("Recomendaciones priorizadas")];
    const rowH = 110;
    items.forEach((r, i) => {
      const y = 240 + i * (rowH + 10);
      els.push(
        shape({ x: 80, y, w: 1760, h: rowH, shape: "roundRect", fill: C.slate50, radius: 12, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x: 100, y: y + 20, w: 60, h: 70, text: String(i + 1), fontSize: 32, fontWeight: 800, color: C.blue, align: "left" }),
        txt({ x: 180, y: y + 18, w: 1100, h: 40, text: r.title, fontSize: 22, fontWeight: 700, color: C.navy, align: "left" }),
        txt({ x: 180, y: y + 60, w: 1100, h: 45, text: r.detail, fontSize: 16, fontWeight: 400, color: C.slate700, align: "left", valign: "top" }),
        txt({ x: 1300, y: y + 30, w: 200, h: 30, text: `Impacto: ${r.impact}`, fontSize: 16, fontWeight: 600, color: C.slate700, align: "left" }),
        txt({ x: 1300, y: y + 65, w: 200, h: 30, text: `Esfuerzo: ${r.effort}`, fontSize: 16, fontWeight: 600, color: C.slate700, align: "left" }),
      );
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  // ─── 13. Roadmap 90 días ────────────────────────────────────
  if (analysis.roadmap_90_days?.length) {
    const phases = analysis.roadmap_90_days.slice(0, 3);
    const cols = phases.length;
    const gap = 30;
    const cellW = (1760 - (cols - 1) * gap) / cols;
    const els: SlideElement[] = [...sectionHeader("Plan 90 días")];
    phases.forEach((p, i) => {
      const x = 80 + i * (cellW + gap);
      const y = 240;
      const cellH = 740;
      els.push(
        shape({ x, y, w: cellW, h: cellH, shape: "roundRect", fill: C.slate50, radius: 16, stroke: C.slate200, strokeWidth: 1 }),
        txt({ x: x + 30, y: y + 30, w: cellW - 60, h: 40, text: p.phase, fontSize: 20, fontWeight: 700, color: C.blue, align: "left" }),
        txt({ x: x + 30, y: y + 80, w: cellW - 60, h: 80, text: p.focus, fontSize: 28, fontWeight: 700, color: C.navy, align: "left" }),
        txt({
          x: x + 30, y: y + 180, w: cellW - 60, h: cellH - 200,
          text: (p.items ?? []).map((it) => `→ ${it}`).join("\n\n"),
          fontSize: 19, fontWeight: 400, color: C.slate700, align: "left", valign: "top", lineHeight: 1.5,
        }),
      );
    });
    slides.push({ id: `slide_${slides.length + 1}`, background: C.white, elements: els });
  }

  return {
    schemaVersion: 4,
    title,
    slides,
    sourceResponse: response,
  };
}

function sectionHeader(title: string): SlideElement[] {
  return [
    txt({
      x: 80, y: 80, w: 1760, h: 90,
      text: title, fontSize: 56, fontWeight: 800, color: C.navy, align: "left",
    }),
    shape({ x: 80, y: 180, w: 180, h: 6, shape: "rect", fill: C.blue }),
  ];
}

function buildBarChartSlide(
  title: string,
  data: { label: string; count: number }[],
  barColor: string,
): Slide {
  const els: SlideElement[] = [...sectionHeader(title)];
  const top = data.slice(0, 12);
  const max = Math.max(...top.map((d) => d.count), 1);
  const yStart = 250;
  const rowH = (SLIDE_H - yStart - 80) / Math.max(top.length, 1);
  const barH = Math.min(rowH * 0.7, 60);
  const labelW = 360;
  const chartX = 80 + labelW + 30;
  const chartW = SLIDE_W - chartX - 80 - 160; // leave room for value
  top.forEach((d, i) => {
    const y = yStart + i * rowH + (rowH - barH) / 2;
    const w = (d.count / max) * chartW;
    els.push(
      txt({
        x: 80, y: y - 4, w: labelW, h: barH + 8,
        text: d.label, fontSize: 20, fontWeight: 500, color: "#334155",
        align: "right", valign: "middle",
      }),
      shape({ x: chartX, y, w: Math.max(w, 4), h: barH, shape: "roundRect", fill: barColor, radius: 6 }),
      txt({
        x: chartX + Math.max(w, 4) + 16, y: y - 4, w: 160, h: barH + 8,
        text: d.count.toLocaleString("es"),
        fontSize: 22, fontWeight: 700, color: "#0F172A",
        align: "left", valign: "middle",
      }),
    );
  });
  return { id: `slide_${Date.now()}_${Math.random()}`, background: "#FFFFFF", elements: els };
}

// ---------------------------------------------------------------------------
// Helpers de mutación inmutable
// ---------------------------------------------------------------------------

export function updateElement(
  pres: EditablePresentation,
  slideIdx: number,
  elementId: string,
  patch: Partial<SlideElement>,
): EditablePresentation {
  const slides = pres.slides.map((s, i) => {
    if (i !== slideIdx) return s;
    return {
      ...s,
      elements: s.elements.map((el) =>
        el.id === elementId ? ({ ...el, ...patch } as SlideElement) : el,
      ),
    };
  });
  return { ...pres, slides };
}

export function deleteElement(
  pres: EditablePresentation,
  slideIdx: number,
  elementId: string,
): EditablePresentation {
  const slides = pres.slides.map((s, i) =>
    i === slideIdx ? { ...s, elements: s.elements.filter((el) => el.id !== elementId) } : s,
  );
  return { ...pres, slides };
}

export function addElement(
  pres: EditablePresentation,
  slideIdx: number,
  el: SlideElement,
): EditablePresentation {
  const slides = pres.slides.map((s, i) =>
    i === slideIdx ? { ...s, elements: [...s.elements, el] } : s,
  );
  return { ...pres, slides };
}

export function addSlide(pres: EditablePresentation, afterIdx?: number): EditablePresentation {
  const newSlide: Slide = {
    id: `slide_${Date.now()}`,
    background: "#FFFFFF",
    elements: [
      txt({
        x: 80, y: 80, w: 1760, h: 90,
        text: "Nueva diapositiva", fontSize: 56, fontWeight: 800, color: C.navy, align: "left",
      }),
    ],
  };
  const idx = afterIdx ?? pres.slides.length - 1;
  const slides = [...pres.slides];
  slides.splice(idx + 1, 0, newSlide);
  return { ...pres, slides };
}

/** Inserta una slide ya construida (p.ej. desde IA) después de afterIdx. */
export function insertSlide(
  pres: EditablePresentation,
  slide: { background: string; elements: SlideElement[]; notes?: string },
  afterIdx?: number,
): EditablePresentation {
  const newSlide: Slide = {
    id: `slide_${Date.now()}`,
    background: slide.background || "#FFFFFF",
    elements: slide.elements.map((el) => ({ ...el, id: el.id || uid() })),
    notes: slide.notes,
  };
  const idx = afterIdx ?? pres.slides.length - 1;
  const slides = [...pres.slides];
  slides.splice(idx + 1, 0, newSlide);
  return { ...pres, slides };
}

export function deleteSlide(pres: EditablePresentation, idx: number): EditablePresentation {
  if (pres.slides.length <= 1) return pres;
  const slides = pres.slides.filter((_, i) => i !== idx);
  return { ...pres, slides };
}

export function moveSlide(
  pres: EditablePresentation,
  from: number,
  to: number,
): EditablePresentation {
  if (from === to) return pres;
  const slides = [...pres.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  return { ...pres, slides };
}

export function duplicateSlide(pres: EditablePresentation, idx: number): EditablePresentation {
  const original = pres.slides[idx];
  if (!original) return pres;
  const cloned: Slide = {
    ...original,
    id: `slide_${Date.now()}`,
    elements: original.elements.map((el) => ({ ...el, id: uid() })),
  };
  const slides = [...pres.slides];
  slides.splice(idx + 1, 0, cloned);
  return { ...pres, slides };
}

// Factory helpers para añadir elementos desde la toolbar
export function makeNewText(): TextElement {
  return txt({
    x: 760, y: 480, w: 400, h: 100,
    text: "Texto nuevo", fontSize: 32, fontWeight: 500, color: C.navy, align: "left",
  });
}

export function makeNewShape(kind: "rect" | "roundRect" | "ellipse"): ShapeElement {
  return shape({
    x: 760, y: 440, w: 400, h: 200,
    shape: kind, fill: C.blue, radius: kind === "roundRect" ? 16 : 0,
  });
}

export function makeNewImage(src: string): ImageElement {
  return {
    id: uid(),
    type: "image",
    src,
    x: 660, y: 340, w: 600, h: 400, rotation: 0, fit: "contain",
  };
}
