import { describe, it, expect } from "vitest";
import { resolveAtribucionResponsabilidad } from "@/lib/analizador-total/resolveAtribucion";
import { MASTER_EXPORT_HEADERS, rowsToMasterExportAoA } from "@/lib/analizador-total/exportRows";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";

describe("resolveAtribucionResponsabilidad", () => {
  it("retorna 'No aplica' para interacciones exitosas sin puntos negativos", () => {
    const row: AnalizadorUnifiedRow = {
      channel: "call",
      id: "call-1",
      file_name: "llamada_exitosa.mp3",
      created_at: new Date(),
      duration: 180,
      status: "completed",
      sentiment: "positive",
      score: 95,
      summary: "El cliente consulta por su saldo y el asesor le brinda la información completa.",
      results: {
        positive: ["Excelente trato", "Validación completa"],
        negative: [],
        cumplimiento_protocolo: true,
      },
    };

    expect(resolveAtribucionResponsabilidad(row)).toBe("No aplica");
  });

  it("retorna 'No aplica' para llamadas a buzón de voz o sin contacto", () => {
    const row: AnalizadorUnifiedRow = {
      channel: "call",
      id: "call-buzon",
      file_name: "buzon.mp3",
      created_at: new Date(),
      duration: 2,
      status: "completed",
      sentiment: "neutral",
      score: 50,
      summary: "Buzón de voz detectado, no contesta",
      results: {},
    };

    expect(resolveAtribucionResponsabilidad(row)).toBe("No aplica");
  });

  it("retorna 'Asesor' cuando hay fallas operativas o de protocolo del asesor", () => {
    const row: AnalizadorUnifiedRow = {
      channel: "call",
      id: "call-asesor-error",
      file_name: "error_asesor.mp3",
      created_at: new Date(),
      duration: 240,
      status: "completed",
      sentiment: "negative",
      score: 45,
      summary: "El asesor interrumpe al cliente y omite el protocolo de presentación y validación.",
      results: {
        negative: [
          "Falta de saludo y presentación según protocolo",
          "El asesor interrumpe al cliente y muestra falta de empatía",
          "Información errónea proporcionada por el ejecutivo",
        ],
        cumplimiento_protocolo: false,
        feedback_agente: "Reforzar capacitación en protocolo de atención y escucha activa.",
      },
    };

    expect(resolveAtribucionResponsabilidad(row)).toBe("Asesor");
  });

  it("retorna 'Cliente' cuando la incidencia o rechazo es atribuible al cliente", () => {
    const row: AnalizadorUnifiedRow = {
      channel: "call",
      id: "call-cliente-error",
      file_name: "cliente_cuelga.mp3",
      created_at: new Date(),
      duration: 40,
      status: "completed",
      sentiment: "negative",
      score: 55,
      summary: "El cliente se mostró agresivo, insultó al agente y cortó la llamada abruptamente.",
      results: {
        negative: [
          "El cliente cuelga la llamada de forma abrupta",
          "Cliente agresivo que se niega a validar sus datos",
        ],
        cumplimiento_protocolo: true,
      },
    };

    expect(resolveAtribucionResponsabilidad(row)).toBe("Cliente");
  });

  it("respeta y normaliza valores explícitos existentes", () => {
    const rowAsesor: AnalizadorUnifiedRow = {
      channel: "whatsapp",
      id: "wa-1",
      file_name: "chat1",
      created_at: new Date(),
      duration: 120,
      status: "completed",
      sentiment: "neutral",
      score: 80,
      atribucion_responsabilidad: "Agente",
    };
    expect(resolveAtribucionResponsabilidad(rowAsesor)).toBe("Asesor");

    const rowCliente: AnalizadorUnifiedRow = {
      channel: "whatsapp",
      id: "wa-2",
      file_name: "chat2",
      created_at: new Date(),
      duration: 120,
      status: "completed",
      sentiment: "neutral",
      score: 80,
      atribucion_responsabilidad: "Usuario",
    };
    expect(resolveAtribucionResponsabilidad(rowCliente)).toBe("Cliente");

    const rowNoAplica: AnalizadorUnifiedRow = {
      channel: "whatsapp",
      id: "wa-3",
      file_name: "chat3",
      created_at: new Date(),
      duration: 120,
      status: "completed",
      sentiment: "neutral",
      score: 80,
      atribucion_responsabilidad: "No aplica",
    };
    expect(resolveAtribucionResponsabilidad(rowNoAplica)).toBe("No aplica");
  });
});

describe("MASTER_EXPORT_HEADERS y exportación", () => {
  it("no incluye 'Promesa de pago' ni 'Estado pago (detalle)'", () => {
    expect(MASTER_EXPORT_HEADERS).not.toContain("Promesa de pago");
    expect(MASTER_EXPORT_HEADERS).not.toContain("Estado pago (detalle)");
  });

  it("contiene exactamente las 24 columnas requeridas en el orden correcto", () => {
    const expectedHeaders = [
      "canal",
      "archivo",
      "fecha",
      "duracion_segundos",
      "duracion_Minutos",
      "duracion_Horas",
      "mensajes",
      "sentimiento",
      "score_0_1",
      "score_pct",
      "conversación",
      "resumen de la llamada y/o de la conversacion",
      "Análisis según Prompt",
      "Puntos Positivos",
      "Puntos Negativos",
      "Oportunidades",
      "Insights",
      "Conclusiones",
      "Recomendaciones",
      "Atribución responsabilidad",
      "Motivo principal",
      "ext_Nombre Asesor",
      "ext_Nombre Campaña",
      "ext_fecha",
    ];

    expect([...MASTER_EXPORT_HEADERS]).toEqual(expectedHeaders);
  });

  it("genera filas para Excel con los encabezados y Atribución responsabilidad correctos", () => {
    const sampleRow: AnalizadorUnifiedRow = {
      channel: "call",
      id: "call-test",
      file_name: "test_call.mp3",
      created_at: new Date("2026-03-01T10:00:00Z"),
      duration: 120,
      status: "completed",
      sentiment: "positive",
      score: 90,
      summary: "Llamada de consulta resuelta satisfactoriamente.",
      results: {
        positive: ["Atención cordial"],
        negative: [],
      },
    };

    const { headers, data } = rowsToMasterExportAoA([sampleRow]);
    expect(headers).toEqual([...MASTER_EXPORT_HEADERS]);
    expect(data.length).toBe(1);

    const atribIndex = headers.indexOf("Atribución responsabilidad");
    expect(atribIndex).toBeGreaterThan(-1);
    expect(data[0][atribIndex]).toBe("No aplica");
  });
});
