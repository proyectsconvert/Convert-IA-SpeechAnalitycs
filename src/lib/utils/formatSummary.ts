/**
 * Convierte resúmenes estructurados (JSON, objetos, arrays o cadenas con formato)
 * en texto limpio, profesional y legible para el usuario final.
 */
export function formatCleanSummary(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);

  let obj: any = raw;
  if (typeof raw === "string") {
    let t = raw.trim();
    // Eliminar bloques de código markdown ```json ... ```
    if (t.startsWith("```")) {
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        obj = JSON.parse(t);
      } catch {
        return t;
      }
    } else {
      return t;
    }
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => (typeof item === "string" ? `• ${item}` : formatCleanSummary(item)))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof obj === "object" && obj !== null) {
    const sections: string[] = [];

    // 1. Extraer el bloque principal de resumen si existe
    const mainKeys = [
      "resumen",
      "summary",
      "resumen_ejecutivo",
      "resumen_llamada",
      "resumen_conversacion",
      "executive_summary",
      "descripcion",
    ];
    const foundMainKey = Object.keys(obj).find((k) => mainKeys.includes(k.toLowerCase()));

    if (foundMainKey && obj[foundMainKey]) {
      const val = obj[foundMainKey];
      if (Array.isArray(val)) {
        sections.push(val.map((item) => `• ${String(item)}`).join("\n"));
      } else if (typeof val === "string") {
        sections.push(val.trim());
      } else {
        sections.push(formatCleanSummary(val));
      }
    }

    // 2. Procesar las demás secciones (p.ej. preguntas_y_aclaraciones, acuerdos, etc.)
    for (const [key, val] of Object.entries(obj)) {
      if (foundMainKey && key.toLowerCase() === foundMainKey.toLowerCase()) continue;
      if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) continue;

      const formattedKey = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      if (Array.isArray(val)) {
        const items = val.map((item) => `• ${String(item)}`).join("\n");
        sections.push(`\n${formattedKey}:\n${items}`);
      } else if (typeof val === "object") {
        sections.push(`\n${formattedKey}:\n${formatCleanSummary(val)}`);
      } else {
        sections.push(`\n${formattedKey}: ${String(val)}`);
      }
    }

    return sections.join("\n\n").trim();
  }

  return String(obj);
}
