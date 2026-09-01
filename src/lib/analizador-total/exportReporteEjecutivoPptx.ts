import pptxgen from "pptxgenjs";
import type { TotalAnalyzerV2Response } from "@/lib/analizador-total/reporteIaSchema";

/**
 * Export a slide-deck reproduction of the executive report shown on screen.
 * Includes ALL sections: cover, exec summary, key metrics, critical finding,
 * advisor analysis, channel/promesa/asesor charts, sentiment-by-channel matrix,
 * positive points, opportunities, highlighted cases, recommendations, roadmap.
 */
export async function exportReporteEjecutivoPptx(
  response: TotalAnalyzerV2Response,
  fileName: string,
): Promise<void> {
  const { meta, stats, analysis } = response;
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
  pptx.title = "Reporte Ejecutivo IA";

  const PAGE_W = 13.33;

  const sectionTitle = (s: pptxgen.Slide, text: string) => {
    s.addText(text, {
      x: 0.5,
      y: 0.3,
      w: PAGE_W - 1,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: "0F172A",
    });
    s.addShape(pptx.ShapeType.line, {
      x: 0.5,
      y: 0.85,
      w: 1.2,
      h: 0,
      line: { color: "3B82F6", width: 2 },
    });
  };

  // ─── Cover ───────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: "0F172A" };
  cover.addText("Reporte Ejecutivo IA", {
    x: 0.5,
    y: 1.5,
    w: PAGE_W - 1,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
  });
  cover.addText(meta.dateRange ?? "", {
    x: 0.5,
    y: 2.5,
    w: PAGE_W - 1,
    h: 0.5,
    fontSize: 18,
    color: "94A3B8",
  });
  cover.addText(
    `${meta.rowsAnalyzed.toLocaleString("es")} interacciones · ${
      meta.source.mode === "upload" ? meta.source.fileName ?? "Excel subido" : "Datos Maestros"
    }`,
    { x: 0.5, y: 6.4, w: PAGE_W - 1, h: 0.4, fontSize: 12, color: "94A3B8" },
  );
  cover.addText(`Generado ${new Date(meta.generatedAt).toLocaleString("es")}`, {
    x: 0.5,
    y: 6.85,
    w: PAGE_W - 1,
    h: 0.3,
    fontSize: 10,
    color: "64748B",
  });

  // ─── Executive summary ───────────────────────────────────
  if (analysis.executive_summary) {
    const sum = pptx.addSlide();
    sectionTitle(sum, "Resumen ejecutivo");
    sum.addText(analysis.executive_summary.narrative ?? "", {
      x: 0.5,
      y: 1.1,
      w: PAGE_W - 1,
      h: 2.6,
      fontSize: 14,
      color: "334155",
      valign: "top",
    });
    const headline = (analysis.executive_summary.headline_stats ?? []).slice(0, 4);
    const cardW = (PAGE_W - 1 - 0.45) / 4;
    headline.forEach((s, i) => {
      const x = 0.5 + i * (cardW + 0.15);
      sum.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 4.0,
        w: cardW,
        h: 1.7,
        fill: { color: "F1F5F9" },
        line: { color: "E2E8F0", width: 0.75 },
        rectRadius: 0.1,
      });
      sum.addText(s.value, {
        x,
        y: 4.15,
        w: cardW,
        h: 0.85,
        fontSize: 28,
        bold: true,
        color: "0F172A",
        align: "center",
      });
      sum.addText(s.label, {
        x,
        y: 5.0,
        w: cardW,
        h: 0.6,
        fontSize: 11,
        color: "64748B",
        align: "center",
      });
    });
  }

  // ─── Critical finding (own slide for visibility) ─────────
  if (analysis.critical_finding) {
    const cf = pptx.addSlide();
    cf.background = { color: "FFFFFF" };
    cf.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: 7.5,
      fill: { color: "DC2626" },
      line: { color: "DC2626" },
    });
    cf.addText("HALLAZGO CRÍTICO", {
      x: 0.6,
      y: 0.4,
      w: PAGE_W - 1,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: "DC2626",
      charSpacing: 2,
    });
    cf.addText(analysis.critical_finding.title, {
      x: 0.6,
      y: 0.95,
      w: PAGE_W - 1,
      h: 1.0,
      fontSize: 28,
      bold: true,
      color: "0F172A",
    });
    cf.addText(analysis.critical_finding.statistic, {
      x: 0.6,
      y: 2.2,
      w: PAGE_W - 1,
      h: 2.0,
      fontSize: 80,
      bold: true,
      color: "DC2626",
    });
    cf.addText(analysis.critical_finding.detail, {
      x: 0.6,
      y: 4.6,
      w: PAGE_W - 1,
      h: 2.5,
      fontSize: 15,
      color: "334155",
      valign: "top",
    });
  }

  // ─── Key metrics ─────────────────────────────────────────
  if (analysis.key_metrics?.length) {
    const km = pptx.addSlide();
    sectionTitle(km, "Métricas clave");
    const items = analysis.key_metrics.slice(0, 8);
    const cols = items.length <= 4 ? items.length : 4;
    const rows = Math.ceil(items.length / cols);
    const cellW = (PAGE_W - 1 - (cols - 1) * 0.2) / cols;
    const cellH = rows === 1 ? 2.6 : 2.4;
    items.forEach((m, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 0.5 + c * (cellW + 0.2);
      const y = 1.2 + r * (cellH + 0.2);
      km.addShape(pptx.ShapeType.roundRect, {
        x, y, w: cellW, h: cellH,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 0.75 },
        rectRadius: 0.08,
      });
      km.addText(m.value, { x, y: y + 0.15, w: cellW, h: 0.9, fontSize: 30, bold: true, color: "0F172A", align: "center" });
      km.addText(m.label, { x: x + 0.15, y: y + 1.05, w: cellW - 0.3, h: 0.5, fontSize: 12, bold: true, color: "334155", align: "center" });
      if (m.context) {
        km.addText(m.context, { x: x + 0.2, y: y + 1.55, w: cellW - 0.4, h: cellH - 1.6, fontSize: 10, color: "64748B", align: "center", valign: "top" });
      }
    });
  }

  // ─── Volumen por canal (chart) ───────────────────────────
  if (stats.by_canal.length > 0) {
    const ch = pptx.addSlide();
    sectionTitle(ch, "Volumen por canal");
    ch.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Volumen",
          labels: stats.by_canal.map((c) => c.label),
          values: stats.by_canal.map((c) => c.count),
        },
      ],
      {
        x: 0.5, y: 1.1, w: PAGE_W - 1, h: 5.8,
        barDir: "bar",
        showLegend: false,
        chartColors: ["3B82F6"],
        catAxisLabelFontSize: 11,
        valAxisLabelFontSize: 10,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }

  // ─── Promesas de pago ────────────────────────────────────
  if (stats.by_promesa_pago.length > 0) {
    const pp = pptx.addSlide();
    sectionTitle(pp, "Promesas de pago");
    pp.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Promesas de pago",
          labels: stats.by_promesa_pago.map((c) => c.label),
          values: stats.by_promesa_pago.map((c) => c.count),
        },
      ],
      {
        x: 0.5, y: 1.1, w: PAGE_W - 1, h: 5.8,
        barDir: "bar",
        showLegend: false,
        chartColors: ["10B981"],
        catAxisLabelFontSize: 11,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }

  // ─── Top asesores ────────────────────────────────────────
  if (stats.by_asesor.length > 0) {
    const as = pptx.addSlide();
    sectionTitle(as, "Top asesores por carga");
    const top = stats.by_asesor.slice(0, 10);
    as.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Interacciones",
          labels: top.map((c) => c.label),
          values: top.map((c) => c.count),
        },
      ],
      {
        x: 0.5, y: 1.1, w: PAGE_W - 1, h: 5.8,
        barDir: "bar",
        showLegend: false,
        chartColors: ["6366F1"],
        catAxisLabelFontSize: 11,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }

  // ─── Análisis por asesor (concentración + observaciones) ──
  if (analysis.advisor_analysis) {
    const aa = pptx.addSlide();
    sectionTitle(aa, "Análisis por asesor");
    aa.addText(analysis.advisor_analysis.top_load_pct ?? "—", {
      x: 0.5, y: 1.2, w: 4.5, h: 1.3, fontSize: 56, bold: true, color: "0F172A",
    });
    aa.addText("carga concentrada en top asesores", {
      x: 0.5, y: 2.6, w: 4.5, h: 0.5, fontSize: 12, color: "64748B",
    });
    const obs = (analysis.advisor_analysis.observations ?? []).map((o) => ({
      text: `• ${o}`,
      options: { fontSize: 13, color: "334155", paraSpaceAfter: 8, breakLine: true },
    }));
    if (obs.length) {
      aa.addText(obs, { x: 5.5, y: 1.2, w: PAGE_W - 6, h: 5.5, valign: "top" });
    }
  }

  // ─── Sentimiento por canal (table) ───────────────────────
  const canalSet = Object.keys(stats.canal_x_sentimiento ?? {});
  if (canalSet.length) {
    const sc = pptx.addSlide();
    sectionTitle(sc, "Sentimiento por canal");
    const sentSet = Array.from(
      new Set(canalSet.flatMap((k) => Object.keys(stats.canal_x_sentimiento[k] ?? {}))),
    );
    const headerRow = [
      { text: "Canal", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF" } },
      ...sentSet.map((s) => ({
        text: s,
        options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF", align: "right" as const },
      })),
    ];
    const dataRows = canalSet.map((c) => [
      { text: c, options: { bold: true, color: "0F172A" } },
      ...sentSet.map((s) => ({
        text: String(stats.canal_x_sentimiento[c]?.[s] ?? 0),
        options: { align: "right" as const, color: "334155" },
      })),
    ]);
    sc.addTable([headerRow, ...dataRows], {
      x: 0.5, y: 1.1, w: PAGE_W - 1, fontSize: 12, border: { type: "solid", color: "E2E8F0", pt: 0.5 },
    });
  }

  // ─── Fortalezas (positive points) ────────────────────────
  if (analysis.positive_points?.length) {
    const pos = pptx.addSlide();
    sectionTitle(pos, "Fortalezas detectadas");
    const items = analysis.positive_points.slice(0, 6);
    const cols = 2;
    const cellW = (PAGE_W - 1 - 0.3) / cols;
    const cellH = 1.85;
    items.forEach((p, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 0.5 + c * (cellW + 0.3);
      const y = 1.1 + r * (cellH + 0.2);
      pos.addShape(pptx.ShapeType.roundRect, {
        x, y, w: cellW, h: cellH,
        fill: { color: "ECFDF5" },
        line: { color: "10B981", width: 0.75 },
        rectRadius: 0.08,
      });
      pos.addText(`✓ ${p.title}`, { x: x + 0.15, y: y + 0.1, w: cellW - 0.3, h: 0.45, fontSize: 14, bold: true, color: "065F46" });
      pos.addText(p.detail, { x: x + 0.15, y: y + 0.6, w: cellW - 0.3, h: cellH - 0.7, fontSize: 11, color: "334155", valign: "top" });
    });
  }

  // ─── Oportunidades ───────────────────────────────────────
  if (analysis.improvement_opportunities?.length) {
    const op = pptx.addSlide();
    sectionTitle(op, "Oportunidades de mejora");
    const items = analysis.improvement_opportunities.slice(0, 6);
    const cols = 2;
    const cellW = (PAGE_W - 1 - 0.3) / cols;
    const cellH = 2.85;
    const priorityColor: Record<string, string> = { CRÍTICO: "DC2626", ALTO: "D97706", MEDIO: "64748B" };
    items.forEach((o, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 0.5 + c * (cellW + 0.3);
      const y = 1.1 + r * (cellH + 0.15);
      op.addShape(pptx.ShapeType.roundRect, {
        x, y, w: cellW, h: cellH,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 0.75 },
        rectRadius: 0.08,
      });
      op.addText(`${String(i + 1).padStart(2, "0")}`, {
        x: x + 0.15, y: y + 0.1, w: 0.6, h: 0.35, fontSize: 11, bold: true, color: "94A3B8",
      });
      op.addText(o.priority, {
        x: x + cellW - 1.0, y: y + 0.1, w: 0.85, h: 0.35,
        fontSize: 9, bold: true, color: priorityColor[o.priority] ?? "64748B", align: "right",
      });
      op.addText(o.title, {
        x: x + 0.15, y: y + 0.5, w: cellW - 0.3, h: 0.45, fontSize: 13, bold: true, color: "0F172A",
      });
      op.addText(o.detail, {
        x: x + 0.15, y: y + 1.0, w: cellW - 0.3, h: 1.2, fontSize: 10, color: "475569", valign: "top",
      });
      if (o.evidence) {
        op.addText(`"${o.evidence}"`, {
          x: x + 0.3, y: y + 2.2, w: cellW - 0.45, h: 0.55,
          fontSize: 9, italic: true, color: "64748B", valign: "top",
        });
      }
    });
  }

  // ─── Casos destacados ────────────────────────────────────
  if (analysis.highlighted_cases?.length) {
    const cs = pptx.addSlide();
    sectionTitle(cs, "Casos destacados");
    const items = analysis.highlighted_cases.slice(0, 4);
    const cols = 2;
    const cellW = (PAGE_W - 1 - 0.3) / cols;
    const cellH = 2.8;
    items.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.5 + col * (cellW + 0.3);
      const y = 1.1 + row * (cellH + 0.15);
      cs.addShape(pptx.ShapeType.roundRect, {
        x, y, w: cellW, h: cellH,
        fill: { color: "FFFFFF" },
        line: { color: "E2E8F0", width: 0.75 },
        rectRadius: 0.08,
      });
      cs.addText(c.tag, {
        x: x + 0.15, y: y + 0.12, w: cellW - 0.3, h: 0.3,
        fontSize: 9, bold: true, color: "3B82F6", charSpacing: 2,
      });
      cs.addText(c.title, {
        x: x + 0.15, y: y + 0.45, w: cellW - 0.3, h: 0.5, fontSize: 14, bold: true, color: "0F172A",
      });
      cs.addText(c.body, {
        x: x + 0.15, y: y + 1.0, w: cellW - 0.3, h: 1.3, fontSize: 11, color: "334155", valign: "top",
      });
      if (c.lesson) {
        cs.addText(`Lección: ${c.lesson}`, {
          x: x + 0.15, y: y + 2.3, w: cellW - 0.3, h: 0.4, fontSize: 10, italic: true, color: "1E40AF",
        });
      }
    });
  }

  // ─── Recommendations ─────────────────────────────────────
  if (analysis.recommendations?.length) {
    const re = pptx.addSlide();
    sectionTitle(re, "Recomendaciones priorizadas");
    const headerRow = [
      { text: "#", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF" } },
      { text: "Recomendación", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF" } },
      { text: "Detalle", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF" } },
      { text: "Impacto", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF", align: "center" as const } },
      { text: "Esfuerzo", options: { bold: true, fill: { color: "0F172A" }, color: "FFFFFF", align: "center" as const } },
    ];
    const dataRows = analysis.recommendations.map((r, i) => [
      { text: String(i + 1), options: { color: "64748B" } },
      { text: r.title, options: { bold: true, color: "0F172A" } },
      { text: r.detail, options: { color: "334155" } },
      { text: r.impact, options: { align: "center" as const, color: "334155" } },
      { text: r.effort, options: { align: "center" as const, color: "334155" } },
    ]);
    re.addTable([headerRow, ...dataRows], {
      x: 0.5, y: 1.1, w: PAGE_W - 1,
      fontSize: 11,
      colW: [0.5, 2.8, 6.4, 1.3, 1.3],
      border: { type: "solid", color: "E2E8F0", pt: 0.5 },
      rowH: 0.35,
    });
  }

  // ─── Roadmap ─────────────────────────────────────────────
  if (analysis.roadmap_90_days?.length) {
    const rm = pptx.addSlide();
    sectionTitle(rm, "Plan 90 días");
    const phases = analysis.roadmap_90_days.slice(0, 3);
    const cols = phases.length;
    const cellW = (PAGE_W - 1 - (cols - 1) * 0.2) / cols;
    phases.forEach((p, i) => {
      const x = 0.5 + i * (cellW + 0.2);
      rm.addShape(pptx.ShapeType.roundRect, {
        x, y: 1.1, w: cellW, h: 5.8,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 0.75 },
        rectRadius: 0.08,
      });
      rm.addText(p.phase, { x: x + 0.2, y: 1.25, w: cellW - 0.4, h: 0.4, fontSize: 11, bold: true, color: "3B82F6", charSpacing: 2 });
      rm.addText(p.focus, { x: x + 0.2, y: 1.7, w: cellW - 0.4, h: 0.7, fontSize: 16, bold: true, color: "0F172A" });
      const items = (p.items ?? []).map((it) => ({
        text: `→ ${it}`,
        options: { fontSize: 11, color: "334155", paraSpaceAfter: 6, breakLine: true },
      }));
      if (items.length) {
        rm.addText(items, { x: x + 0.2, y: 2.5, w: cellW - 0.4, h: 4.3, valign: "top" });
      }
    });
  }

  await pptx.writeFile({ fileName });
}
