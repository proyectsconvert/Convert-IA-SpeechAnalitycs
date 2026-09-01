import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Capture each `[data-pdf-page]` block inside the report root and render
 * one block per A4 landscape PDF page. Each block is scaled to fit the
 * usable area without splitting tarjetas across pages.
 */
export async function exportReporteEjecutivoPdf(
  rootElement: HTMLElement,
  fileName: string,
): Promise<void> {
  const sections = Array.from(
    rootElement.querySelectorAll<HTMLElement>("[data-pdf-page]"),
  );
  const targets = sections.length > 0 ? sections : [rootElement];

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];

    // eslint-disable-next-line no-await-in-loop
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
    });

    const ratio = canvas.width / canvas.height;
    let renderW = usableWidth;
    let renderH = renderW / ratio;
    if (renderH > usableHeight) {
      renderH = usableHeight;
      renderW = renderH * ratio;
    }
    const offsetX = (pageWidth - renderW) / 2;
    const offsetY = (pageHeight - renderH) / 2;

    if (i > 0) pdf.addPage();

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", offsetX, offsetY, renderW, renderH, undefined, "FAST");

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `${i + 1} / ${targets.length}`,
      pageWidth - margin,
      pageHeight - 3,
      { align: "right" },
    );
  }

  pdf.save(fileName);
}
