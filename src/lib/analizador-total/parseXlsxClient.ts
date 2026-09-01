import * as XLSX from "xlsx";
import { MASTER_COLUMN_NAMES, validateSchema, type SchemaValidationResult } from "./reporteIaSchema";

export type ParsedXlsx = {
  headers: string[];
  rows: Record<string, string | number>[];
  rowCount: number;
  validation: SchemaValidationResult;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ROWS = 5000;

export function isXlsxFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function parseXlsxFile(file: File): Promise<ParsedXlsx> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`El archivo supera el tamaño máximo (20 MB). Tamaño actual: ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no contiene hojas.");
  const sheet = wb.Sheets[sheetName];

  // Leer como AoA para preservar orden y nombres exactos del header.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (aoa.length === 0) {
    throw new Error("La hoja está vacía.");
  }

  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
  const dataRows = aoa.slice(1) as unknown[][];

  if (dataRows.length > MAX_ROWS) {
    throw new Error(`El archivo tiene ${dataRows.length} filas. El máximo permitido es ${MAX_ROWS}.`);
  }

  const rows: Record<string, string | number>[] = dataRows
    .filter((r) => r && r.some((cell) => cell !== "" && cell != null))
    .map((row) => {
      const obj: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const v = row[i];
        if (v == null || v === "") {
          obj[h] = "";
        } else if (typeof v === "number") {
          obj[h] = v;
        } else {
          obj[h] = String(v);
        }
      });
      return obj;
    });

  return {
    headers,
    rows,
    rowCount: rows.length,
    validation: validateSchema(headers),
  };
}

/** Convierte filas del export maestro (objetos en formato Excel) al payload que espera la edge function. */
export function recordsToAnalyzerRows(records: Record<string, string | number>[]): Record<string, unknown>[] {
  return records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const col of MASTER_COLUMN_NAMES) {
      if (col in r) out[col] = r[col];
    }
    return out;
  });
}
