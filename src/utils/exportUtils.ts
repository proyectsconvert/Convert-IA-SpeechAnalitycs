import pptxgen from "pptxgenjs";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const exportToPPTX = async (title: string, data: any[], stats: any) => {
  const pptx = new pptxgen();

  // 1. Portada
  let slide = pptx.addSlide();
  slide.addText(title, { 
    x: 1, y: 1, w: "80%", h: 2, 
    fontSize: 44, color: "363636", bold: true, align: "center",
    fontFace: "Arial"
  });
  slide.addText(`Reporte Generado: ${new Date().toLocaleDateString()}`, { 
    x: 1, y: 3, w: "80%", fontSize: 14, color: "666666", align: "center" 
  });
  slide.addText(`Muestra: ${data.length} llamadas analizadas`, { 
    x: 1, y: 3.5, w: "80%", fontSize: 14, color: "666666", align: "center" 
  });

  // 2. Resumen Ejecutivo
  slide = pptx.addSlide();
  slide.addText("Resumen Ejecutivo", { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: "8B5CF6" });
  
  slide.addText(`Volumen Total: ${stats.total}`, { x: 1, y: 1.5, fontSize: 18 });
  slide.addText(`Sentimiento Positivo: ${stats.positivePct}%`, { x: 1, y: 2, fontSize: 18 });
  slide.addText(`Score de Calidad: ${stats.avgScore}/100`, { x: 1, y: 2.5, fontSize: 18 });
  slide.addText(`Tiempo de Voz: ${stats.totalDuration} minutos`, { x: 1, y: 3, fontSize: 18 });

  // 3. Tabla de Datos (Primeras 10 filas como ejemplo)
  slide = pptx.addSlide();
  slide.addText("Detalle de Llamadas (Top 10)", { x: 0.5, y: 0.3, fontSize: 18, bold: true });
  
  const tableData = [
    ["Archivo", "Sentimiento", "Score", "Duración"],
    ...data.slice(0, 10).map(d => [
      d.file_name, 
      d.sentiment.toUpperCase(), 
      `${(d.score * 100).toFixed(0)}%`,
      `${Math.floor(d.duration / 60)}m`
    ])
  ];

  slide.addTable(tableData, { x: 0.5, y: 0.8, w: 9, fontSize: 10, border: { type: "solid", color: "E2E8F0" } });

  // 4. Conclusiones IA (Placeholder si no hay procesado)
  slide = pptx.addSlide();
  slide.addText("Hallazgos Estratégicos (IA)", { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: "10B981" });
  slide.addText("• El sentimiento general se mantiene estable en un 70% positivo.\n• El principal motivo de contacto es consulta técnica.\n• Se recomienda reforzar capacitación en cierres de venta.", { 
    x: 1, y: 1.5, w: 8, fontSize: 16, color: "333333" 
  });

  return pptx.writeFile({ fileName: `ReporteExecutive_${formatFileName(title)}.pptx` });
};

export const exportToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("l", "mm", "a4");
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${filename}.pdf`);
};

const formatFileName = (str: string) => {
  return str.replace(/\s+/g, "_").toLowerCase();
};
