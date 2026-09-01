import jsPDF from "jspdf";
import type {
  EditablePresentation,
  SlideElement,
  TextElement,
  ShapeElement,
  ImageElement,
} from "./presentationModel";
import { SLIDE_W, SLIDE_H } from "./presentationModel";

/**
 * Export an editable presentation directly to PDF (one slide per A4 landscape page).
 * Renders elements server-style with jsPDF primitives so we don't rely on DOM capture.
 */
export async function exportEditablePresentationPdf(
  pres: EditablePresentation,
  fileName: string,
): Promise<void> {
  // A4 landscape: 297 x 210 mm
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PAGE_W = 297;
  const PAGE_H = 210;

  // 16:9 canvas inside A4 → fit into page maintaining aspect ratio (centered)
  const ratio = SLIDE_W / SLIDE_H; // ~1.777
  let drawW = PAGE_W;
  let drawH = PAGE_W / ratio;
  if (drawH > PAGE_H) {
    drawH = PAGE_H;
    drawW = PAGE_H * ratio;
  }
  const offX = (PAGE_W - drawW) / 2;
  const offY = (PAGE_H - drawH) / 2;
  const PX_TO_MM_X = drawW / SLIDE_W;
  const PX_TO_MM_Y = drawH / SLIDE_H;

  pres.slides.forEach((slide, i) => {
    if (i > 0) pdf.addPage();

    // Background
    const bg = hexToRgb(slide.background);
    pdf.setFillColor(bg.r, bg.g, bg.b);
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F");

    // Slide canvas background fill (in case user uses page margins)
    pdf.rect(offX, offY, drawW, drawH, "F");

    for (const el of slide.elements) {
      drawElement(pdf, el, offX, offY, PX_TO_MM_X, PX_TO_MM_Y);
    }

    // Page number footer
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`${i + 1} / ${pres.slides.length}`, PAGE_W - 12, PAGE_H - 6, { align: "right" });
  });

  pdf.save(fileName);
}

function drawElement(
  pdf: jsPDF,
  el: SlideElement,
  offX: number,
  offY: number,
  fx: number,
  fy: number,
) {
  const x = offX + el.x * fx;
  const y = offY + el.y * fy;
  const w = el.w * fx;
  const h = el.h * fy;

  if (el.type === "shape") drawShape(pdf, el, x, y, w, h);
  else if (el.type === "text") drawText(pdf, el, x, y, w, h, fy);
  else if (el.type === "image") drawImage(pdf, el, x, y, w, h);
}

function drawShape(pdf: jsPDF, el: ShapeElement, x: number, y: number, w: number, h: number) {
  const fill = hexToRgb(el.fill);
  pdf.setFillColor(fill.r, fill.g, fill.b);
  if (el.stroke && (el.strokeWidth ?? 0) > 0) {
    const stroke = hexToRgb(el.stroke);
    pdf.setDrawColor(stroke.r, stroke.g, stroke.b);
    pdf.setLineWidth(Math.max(0.1, (el.strokeWidth ?? 1) * 0.2));
  } else {
    pdf.setDrawColor(fill.r, fill.g, fill.b);
    pdf.setLineWidth(0);
  }
  const style = el.stroke && (el.strokeWidth ?? 0) > 0 ? "FD" : "F";

  if (el.shape === "ellipse") {
    pdf.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, style);
  } else if (el.shape === "roundRect") {
    const r = Math.min((el.radius ?? 8) * 0.2, Math.min(w, h) / 2);
    pdf.roundedRect(x, y, w, h, r, r, style);
  } else if (el.shape === "line") {
    pdf.line(x, y + h / 2, x + w, y + h / 2);
  } else {
    pdf.rect(x, y, w, h, style);
  }
}

function drawText(
  pdf: jsPDF,
  el: TextElement,
  x: number, y: number, w: number, h: number,
  fy: number,
) {
  // px @ 1920 → mm: fontSize in pt = fontSize_px * scale * (72/25.4)
  // We keep a friendly mapping: 1px @ canvas ≈ (drawH/SLIDE_H) mm
  const sizeMm = el.fontSize * fy;
  const sizePt = sizeMm * 2.834; // mm → pt
  pdf.setFontSize(Math.max(5, sizePt * 0.85)); // small visual tuning
  const color = hexToRgb(el.color);
  pdf.setTextColor(color.r, color.g, color.b);
  pdf.setFont("helvetica", el.fontWeight >= 700 ? "bold" : el.fontStyle === "italic" ? "italic" : "normal");

  if (el.bgColor) {
    const bg = hexToRgb(el.bgColor);
    pdf.setFillColor(bg.r, bg.g, bg.b);
    pdf.rect(x, y, w, h, "F");
  }

  const padding = 1; // mm
  const innerW = Math.max(1, w - padding * 2);
  const lines: string[] = pdf.splitTextToSize(el.text || "", innerW) as string[];
  const lineH = Math.max(2, sizePt * 0.4); // approx line height in mm

  // vertical alignment
  const totalH = lines.length * lineH;
  let cursorY: number;
  if (el.valign === "middle") cursorY = y + (h - totalH) / 2 + lineH * 0.8;
  else if (el.valign === "bottom") cursorY = y + h - totalH + lineH * 0.8 - padding;
  else cursorY = y + lineH * 0.9 + padding;

  // horizontal alignment
  let textX = x + padding;
  let opts: { align: "left" | "center" | "right" } = { align: "left" };
  if (el.align === "center") {
    textX = x + w / 2;
    opts = { align: "center" };
  } else if (el.align === "right") {
    textX = x + w - padding;
    opts = { align: "right" };
  }

  for (const line of lines) {
    if (cursorY > y + h - 0.5) break; // clip overflow
    pdf.text(line, textX, cursorY, opts);
    cursorY += lineH;
  }
}

function drawImage(pdf: jsPDF, el: ImageElement, x: number, y: number, w: number, h: number) {
  try {
    // jsPDF auto-detects format from the data URL.
    pdf.addImage(el.src, "PNG", x, y, w, h, undefined, "FAST");
  } catch {
    // fallback: skip silently
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || "#000000").replace("#", "");
  const num = parseInt(h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.substring(0, 6), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
