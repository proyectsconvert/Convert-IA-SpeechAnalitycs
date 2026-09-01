import pptxgen from "pptxgenjs";
import type {
  EditablePresentation,
  SlideElement,
  TextElement,
  ShapeElement,
  ImageElement,
} from "./presentationModel";
import { SLIDE_W, SLIDE_H } from "./presentationModel";

/**
 * Export an editable presentation (canvas-based, 1920x1080 px) to PPTX.
 * We use LAYOUT_WIDE (13.333 x 7.5 in) and convert px → in with the same factor
 * for both axes to preserve aspect ratio (since canvas is 16:9 too).
 */
export async function exportEditablePresentationPptx(
  pres: EditablePresentation,
  fileName: string,
): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = pres.title || "Presentación";

  const PAGE_W_IN = 13.333;
  const PAGE_H_IN = 7.5;
  const PX_TO_IN_X = PAGE_W_IN / SLIDE_W;
  const PX_TO_IN_Y = PAGE_H_IN / SLIDE_H;

  for (const slide of pres.slides) {
    const s = pptx.addSlide();
    s.background = { color: hexNoHash(slide.background) };
    if (slide.notes) s.addNotes(slide.notes);

    for (const el of slide.elements) {
      addElementToSlide(pptx, s, el, PX_TO_IN_X, PX_TO_IN_Y);
    }
  }

  await pptx.writeFile({ fileName });
}

function addElementToSlide(
  pptx: pptxgen,
  s: pptxgen.Slide,
  el: SlideElement,
  fx: number,
  fy: number,
) {
  const x = el.x * fx;
  const y = el.y * fy;
  const w = el.w * fx;
  const h = el.h * fy;

  if (el.type === "text") {
    addTextEl(s, el, x, y, w, h, fy);
  } else if (el.type === "shape") {
    addShapeEl(pptx, s, el, x, y, w, h);
  } else if (el.type === "image") {
    addImageEl(s, el, x, y, w, h);
  }
}

function addTextEl(
  s: pptxgen.Slide,
  el: TextElement,
  x: number, y: number, w: number, h: number,
  fy: number,
) {
  // Convert px font size → pt (assume 96dpi → 1px = 0.75pt; refine slightly)
  const fontSizePt = Math.max(6, Math.round(el.fontSize * fy * 72 / (7.5 / SLIDE_H * SLIDE_H)));
  // Simpler & more accurate: 1 inch ≈ 72 pt; height in inches → fontSize in pt proportional
  // Use direct ratio: pt = fontSize_px * (72 / 96)
  const ptSize = Math.max(6, Math.round(el.fontSize * 0.75 * (fy * SLIDE_H / 7.5)));
  // The simplest reliable mapping: scale fontSize to slide units.
  // Canvas is 1920px → 13.333in @ 144 dpi. So pt = fontSize_px * 72/144 = fontSize_px * 0.5
  const finalPt = Math.max(6, Math.round(el.fontSize * 0.5));

  s.addText(el.text || "", {
    x, y, w, h,
    fontSize: finalPt,
    bold: el.fontWeight >= 700,
    italic: el.fontStyle === "italic",
    color: hexNoHash(el.color),
    align: el.align,
    valign: (el.valign === "middle" ? "middle" : el.valign === "bottom" ? "bottom" : "top") as
      "top" | "middle" | "bottom",
    fill: el.bgColor ? { color: hexNoHash(el.bgColor) } : undefined,
    margin: 4,
    wrap: true,
  });
  // Note: ptSize/fontSizePt vars unused on purpose (kept for clarity of derivation)
  void ptSize; void fontSizePt;
}

function addShapeEl(
  pptx: pptxgen,
  s: pptxgen.Slide,
  el: ShapeElement,
  x: number, y: number, w: number, h: number,
) {
  const fill = { color: hexNoHash(el.fill) };
  const line = el.stroke && el.strokeWidth
    ? { color: hexNoHash(el.stroke), width: Math.max(0.5, el.strokeWidth * 0.4) }
    : { color: hexNoHash(el.fill) };

  if (el.shape === "ellipse") {
    s.addShape(pptx.ShapeType.ellipse, { x, y, w, h, fill, line });
  } else if (el.shape === "roundRect") {
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h, fill, line,
      rectRadius: Math.min(0.5, (el.radius ?? 8) * 0.01),
    });
  } else if (el.shape === "line") {
    s.addShape(pptx.ShapeType.line, { x, y, w, h, line: { color: hexNoHash(el.fill), width: 1 } });
  } else {
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill, line });
  }
}

function addImageEl(
  s: pptxgen.Slide,
  el: ImageElement,
  x: number, y: number, w: number, h: number,
) {
  s.addImage({
    data: el.src,
    x, y, w, h,
    sizing: el.fit === "cover" ? { type: "cover", w, h } : { type: "contain", w, h },
  });
}

function hexNoHash(hex: string): string {
  if (!hex) return "FFFFFF";
  return hex.replace("#", "").substring(0, 6).toUpperCase();
}
