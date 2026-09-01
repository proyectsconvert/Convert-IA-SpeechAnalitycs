function normalizeRuleBase(col: string) {
  return col
    .replace(/_EX$/i, "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "");
}

/** Compara valores de celda EXT (o agente) ignorando mayúsculas, acentos y espacios extra. */
export function extValuesEqual(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\u0300-\u036f/g, "")
      .replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

function isNombreCampañaBase(base: string): boolean {
  if (base.includes("asesor") || base.includes("agente")) return false;
  return (
    base === "nombre campaña" ||
    base === "nombre de campaña" ||
    base === "nombre campana" ||
    base === "campaña" ||
    base === "campana" ||
    base === "campaign" ||
    (base.includes("nombre") && base.includes("campa"))
  );
}

function isNombreAsesorBase(base: string): boolean {
  if (base.includes("campa")) return false;
  return (
    base === "nombre asesor" ||
    base === "nombre del asesor" ||
    base === "nombre agente" ||
    base === "asesor" ||
    base === "agente" ||
    (base.includes("nombre") && base.includes("asesor")) ||
    (base.includes("nombre") && base.includes("agente")) ||
    (base.includes("asesor") && !base.includes("mensaje")) ||
    (base.includes("agente") && !base.includes("mensaje"))
  );
}

/** Encuentra columna EXT por tipo (nombres de regla habituales en la cuenta). */
export function resolveExtColumnKey(
  extColumns: string[],
  kind: "nombre_asesor" | "nombre_campaña" | "fecha_ext",
): string | undefined {
  const bases = extColumns.map((c) => ({ col: c, base: normalizeRuleBase(c) }));
  if (kind === "fecha_ext") {
    return bases.find((b) => b.base === "fecha")?.col;
  }
  if (kind === "nombre_asesor") {
    return bases.find((b) => isNombreAsesorBase(b.base))?.col;
  }
  return bases.find((b) => isNombreCampañaBase(b.base))?.col;
}
