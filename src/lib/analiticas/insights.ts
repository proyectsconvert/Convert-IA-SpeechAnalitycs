export interface AnaliticasInsightInput {
  totalCalls: number;
  totalWa: number;
  completedCalls: number;
  analyzedWa: number;
  errorCalls: number;
  errorWa: number;
  sentiments: Record<string, number>;
  avgScoreCalls: number | null;
  avgScoreWa: number | null;
  topCallTag?: string;
  topWaTag?: string;
}

export function buildOperationalInsights(i: AnaliticasInsightInput): string[] {
  const out: string[] = [];
  const total = i.totalCalls + i.totalWa;
  if (total === 0) return ["No hay conversaciones en el período y filtros seleccionados."];

  const analyzed = i.completedCalls + i.analyzedWa;
  const rate = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  if (rate < 50 && total >= 5) {
    out.push(`Solo el ${rate}% de las conversaciones están analizadas; conviene revisar cola de procesamiento o errores.`);
  } else if (rate >= 80) {
    out.push(`Buena cobertura: ${rate}% de conversaciones con análisis completado.`);
  }

  const err = i.errorCalls + i.errorWa;
  if (err > 0 && total > 0) {
    const ep = Math.round((err / total) * 100);
    if (ep >= 10) out.push(`El ${ep}% de conversaciones tienen estado de error; priorizar revisión.`);
  }

  const neg = (i.sentiments.negative || 0) + (i.sentiments.Negative || 0);
  const pos = (i.sentiments.positive || 0) + (i.sentiments.Positive || 0);
  const sentTotal = Object.values(i.sentiments).reduce((a, b) => a + b, 0);
  if (sentTotal > 0 && neg / sentTotal > 0.25) {
    out.push("Más de la cuarta parte de los análisis con sentimiento muestran tono negativo; revisar scripts o capacitación.");
  } else if (sentTotal > 0 && pos / sentTotal > 0.5) {
    out.push("La mayoría de interacciones analizadas tienden a sentimiento positivo.");
  }

  if (i.totalCalls > 0 && i.totalWa > 0) {
    const cp = Math.round((i.totalCalls / total) * 100);
    out.push(`Mix de canales: ${cp}% llamadas, ${100 - cp}% WhatsApp.`);
  }

  if (i.avgScoreCalls != null && i.avgScoreWa != null && i.totalCalls > 0 && i.totalWa > 0) {
    const diff = Math.abs(i.avgScoreCalls - i.avgScoreWa);
    if (diff >= 15) {
      out.push(
        i.avgScoreCalls > i.avgScoreWa
          ? "El score medio es notablemente mayor en llamadas que en WhatsApp."
          : "El score medio es notablemente mayor en WhatsApp que en llamadas.",
      );
    }
  }

  if (i.topCallTag) out.push(`Tag más frecuente en llamadas: «${i.topCallTag}».`);
  if (i.topWaTag) out.push(`Tag más frecuente en WhatsApp: «${i.topWaTag}».`);

  if (out.length === 0) out.push("No hay patrones destacados con los datos filtrados actuales.");
  return out.slice(0, 6);
}
