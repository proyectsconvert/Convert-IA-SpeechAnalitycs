import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { getMergedAnalysisRecord } from "@/lib/analizador-total/unifiedCobranzaFields";

export type MacroprocesoType =
  | "ventas"
  | "servicio_cliente"
  | "cobranza"
  | "soporte_tecnico"
  | "retencion"
  | "agendamiento"
  | "prospeccion"
  | "encuestas"
  | "postventa"
  | "pqrs_backoffice";

export interface ResultCategoryConfig {
  name: string;
  color: string;
  isPositive?: boolean;
  isNegative?: boolean;
  isNeutral?: boolean;
  keywords?: string[];
}

export interface MacroprocesoKpiDef {
  id: string;
  title: string;
  subtitle?: string;
  iconName: "phone" | "message" | "trending-up" | "sparkles" | "clock" | "award" | "target" | "users" | "bar-chart" | "shield-check" | "calendar" | "check-circle";
  getValue: (stats: any, scopedRows: AnalizadorUnifiedRow[], prevStats?: any) => string;
  getTrend?: (stats: any, scopedRows: AnalizadorUnifiedRow[], prevStats?: any) => { value: string; positive: boolean } | undefined;
}

export interface MacroprocesoQualityBlock {
  title: string;
  description: string;
  weight: number;
  items: {
    attribute: string;
    description: string;
    max_score: number;
    affectation?: "none" | "mp" | "riesgo" | "critico";
  }[];
}

export interface MacroprocesoConfig {
  id: MacroprocesoType;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  resultChartTitle: string;
  resultBreakdownTitle: string;
  resultColumnLabel: string;
  secondaryResultColumnLabel: string;
  categories: ResultCategoryConfig[];
  kpis: MacroprocesoKpiDef[];
  reporteIa: {
    roleDescription: string;
    focusAreas: string[];
    contextPlaceholder: string;
  };
  qualityMatrixDefault: MacroprocesoQualityBlock[];
}

export const MACROPROCESOS_CONFIG: Record<MacroprocesoType, MacroprocesoConfig> = {
  ventas: {
    id: "ventas",
    label: "Ventas",
    shortLabel: "Ventas",
    emoji: "🛒",
    description: "Venta nueva, cross-selling, upselling y cierre comercial",
    resultChartTitle: "Resultados Comerciales (total periodo)",
    resultBreakdownTitle: "Resultados comerciales — desglose por canal",
    resultColumnLabel: "Resultado Comercial",
    secondaryResultColumnLabel: "Detalle Venta",
    categories: [
      {
        name: "Venta realizada",
        color: "#10b981",
        isPositive: true,
        keywords: [
          "\\bventa realizada\\b",
          "\\bventa cerrada\\b",
          "\\bventa exitosa\\b",
          "\\bcontrataci[oó]n exitosa\\b",
          "\\bcontrato generado\\b",
          "\\bcontrato cerrado\\b",
          "\\bse gener[oó] el contrato\\b",
          "\\bse realiz[oó] el contrato\\b",
          "\\bse concret[oó] la venta\\b",
          "\\bcompra confirmada\\b",
          "\\bpago exitoso\\b",
          "\\bpago realizado\\b",
          "\\bcierre de venta\\b",
          "\\bventa confirmada\\b",
          "\\bcliente contrat[oó]\\b",
          "\\bcliente compr[oó]\\b",
          "\\bcliente adquiri[oó]\\b",
        ],
      },
      {
        name: "Interesado / Cotización",
        color: "#3b82f6",
        isPositive: true,
        keywords: [
          "\\binteresad[oa]\\b",
          "\\bcotizaci[oó]n\\b",
          "\\bsolicita informaci[oó]n\\b",
          "\\bsolo quiere informaci[oó]n\\b",
          "\\bquiere informaci[oó]n\\b",
          "\\bpidi[oó] informaci[oó]n\\b",
          "\\binformaci[oó]n\\b",
          "\\bcobertura\\b",
          "\\bpaquete\\b",
          "\\bvelocidad\\b",
          "\\bprecios\\b",
          "\\bcostos\\b",
          "\\bevaluando\\b",
          "\\bdesea generar el contrato\\b",
          "\\bpreguntas_y_aclaraciones\\b",
        ],
      },
      {
        name: "Seguimiento comercial",
        color: "#0ea5e9",
        isNeutral: true,
        keywords: [
          "\\bseguimiento\\b",
          "\\bllamar luego\\b",
          "\\bvolver a contactar\\b",
          "\\blo pensar[aá]\\b",
          "\\bconsulta familiar\\b",
          "\\breagendar\\b",
          "\\besperar[aá]\\b",
          "\\bpendiente confirmaci[oó]n\\b",
        ],
      },
      {
        name: "Cross-selling / Upselling",
        color: "#8b5cf6",
        isPositive: true,
        keywords: [
          "\\bcross-selling\\b",
          "\\bupselling\\b",
          "\\bmejora de plan\\b",
          "\\bupgrade\\b",
          "\\bproducto adicional\\b",
          "\\bservicio adicional\\b",
        ],
      },
      {
        name: "Objeción de precio / producto",
        color: "#f59e0b",
        isNeutral: true,
        keywords: [
          "\\bmuy caro\\b",
          "\\bprecio alto\\b",
          "\\baumento de precio\\b",
          "\\bobjeci[oó]n\\b",
          "\\bno se ajusta\\b",
          "\\bcompetencia\\b",
          "\\bfalta presupuesto\\b",
        ],
      },
      {
        name: "No interesado / Rechazo",
        color: "#ef4444",
        isNegative: true,
        keywords: [
          "\\bno le interesa\\b",
          "\\bno interesado\\b",
          "\\brechazo\\b",
          "\\bno desea\\b",
          "\\bno insistir\\b",
          "\\bno califica\\b",
          "\\bsin cobertura\\b",
          "\\bno tienen el comprobante\\b",
          "\\bsin comprobante\\b",
          "\\bno tiene comprobante\\b",
        ],
      },
      {
        name: "No contactado / Buzón",
        color: "#64748b",
        isNegative: true,
        keywords: [
          "\\bbuz[oó]n\\b",
          "\\bno contesta\\b",
          "\\bcuelga\\b",
          "\\bequivocado\\b",
          "\\bmudo\\b",
          "\\bno atiende\\b",
        ],
      },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "conversion",
        title: "Conversión / Interés",
        iconName: "trending-up",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "ventas");
            return res === "Venta realizada" || res === "Interesado / Cotización" || res === "Cross-selling / Upselling";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor comercial senior y experto en conversión, embudos de ventas y optimización de contact center.",
      focusAreas: [
        "Tasa de conversión y efectividad por canal (Voz vs WhatsApp)",
        "Manejo de objeciones de precio y producto por parte de los asesores",
        "Rendimiento de ofertas de cross-selling y upselling",
        "Puntos de fricción que causan rechazo o abandono",
        "Plan de acción para elevar el ticket promedio y el cierre comercial",
      ],
      contextPlaceholder: "Ej: Foco en campaña de cierre de mes, evaluar efectividad en promociones 2x1 y objeciones de costo...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Saludo profesional, personalización, tono cordial, escucha activa y empatía comercial.",
        weight: 20,
        items: [
          { attribute: "Saludo y presentación", description: "Se presenta con nombre y empresa cordialmente en los primeros segundos.", max_score: 10, affectation: "none" },
          { attribute: "Escucha activa y cortesía", description: "Mantiene tono respetuoso, no interrumpe y demuestra empatía con el cliente.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Sondeo efectivo de requerimientos, perfilamiento del cliente y detección de oportunidades.",
        weight: 25,
        items: [
          { attribute: "Sondeo y preguntas clave", description: "Realiza preguntas abiertas para entender qué busca y necesita el cliente.", max_score: 15, affectation: "mp" },
          { attribute: "Perfilamiento del cliente", description: "Identifica capacidad de compra y producto adecuado.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Presentación de beneficios del producto, manejo de objeciones y propuesta de valor.",
        weight: 25,
        items: [
          { attribute: "Argumentación de beneficios", description: "Explica ventajas competitivas y valor del producto con claridad.", max_score: 15, affectation: "mp" },
          { attribute: "Manejo efectivo de objeciones", description: "Responde dudas de precio, cobertura o dudas sin titubeos.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Validación de políticas, precios oficiales, términos comerciales y tipificación.",
        weight: 15,
        items: [
          { attribute: "Información verídica y transparente", description: "Brinda costos y condiciones exactas sin información engañosa.", max_score: 10, affectation: "critico" },
          { attribute: "Tipificación correcta", description: "Registra el resultado exacto de la gestión en el sistema.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Intento directo de cierre, acuerdos de compra o siguiente paso y despedida cordial.",
        weight: 15,
        items: [
          { attribute: "Intento de cierre / Siguiente paso", description: "Solicita la compra o fija fecha y hora exacta de seguimiento.", max_score: 10, affectation: "mp" },
          { attribute: "Despedida cordial y agradecimiento", description: "Agradece el tiempo del cliente y proporciona canales de contacto.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  servicio_cliente: {
    id: "servicio_cliente",
    label: "Servicio al Cliente",
    shortLabel: "Servicio",
    emoji: "🎧",
    description: "Atención de consultas, solicitudes, información y trámites generales",
    resultChartTitle: "Resolución de Solicitudes (total periodo)",
    resultBreakdownTitle: "Resolución de solicitudes — desglose por canal",
    resultColumnLabel: "Estado Solicitud",
    secondaryResultColumnLabel: "Tipo Consulta",
    categories: [
      { name: "Consulta resuelta", color: "#10b981", isPositive: true, keywords: ["resuelta", "atendido", "resuelto", "solucionado", "aclarado", "consulta atendida", "conformidad"] },
      { name: "Solicitud en trámite", color: "#3b82f6", isNeutral: true, keywords: ["en tr[aá]mite", "en proceso", "radicado", "generaci[oó]n de caso", "folio generado", "en gesti[oó]n"] },
      { name: "Información brindada", color: "#0ea5e9", isPositive: true, keywords: ["informaci[oó]n", "orientaci[oó]n", "gu[ií]a", "explicaci[oó]n", "detalle brindado"] },
      { name: "Reclamo / Inconformidad", color: "#f59e0b", isNeutral: true, keywords: ["reclamo", "queja", "inconforme", "molesto", "desacuerdo", "insatisfacci[oó]n"] },
      { name: "Seguimiento pendiente", color: "#8b5cf6", isNeutral: true, keywords: ["seguimiento", "pendiente", "llamar nuevamente", "espera confirmaci[oó]n", "en espera"] },
      { name: "Escalamiento / Nivel 2", color: "#d946ef", isNeutral: true, keywords: ["escalado", "nivel 2", "supervisor", "transferido", "área encargada", "backoffice"] },
      { name: "No resuelto", color: "#ef4444", isNegative: true, keywords: ["no resuelto", "no solucionado", "sin respuesta", "corta llamada", "insatisfecho sin soluci[oó]n"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "equivocado", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "resolution",
        title: "Resolución %",
        iconName: "check-circle",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "servicio_cliente");
            return res === "Consulta resuelta" || res === "Información brindada";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior de Customer Experience (CX) y operaciones de Contact Center de Servicio al Cliente.",
      focusAreas: [
        "Tasa de resolución en primer contacto (FCR) y tiempos de atención",
        "Principales motivos de consulta y cuellos de botella informativos",
        "Índice de satisfacción, tono emocional y empatía de los asesores",
        "Eficiencia entre canales (WhatsApp vs Llamadas)",
        "Recomendaciones para autoservicio y reducción de transferencias",
      ],
      contextPlaceholder: "Ej: Evaluar tiempos de respuesta en consultas de facturación y solicitudes en trámite...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Saludo, presentación, tono empático y escucha activa sin interrupciones.",
        weight: 20,
        items: [
          { attribute: "Saludo y presentación", description: "Saluda con amabilidad, dice su nombre y valida el nombre del usuario.", max_score: 10, affectation: "none" },
          { attribute: "Empatía y cordialidad", description: "Muestra actitud servicial y comprensión ante la situación del cliente.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Comprensión precisa del motivo de consulta o requerimiento del cliente.",
        weight: 20,
        items: [
          { attribute: "Sondeo de la solicitud", description: "Realiza preguntas oportunas para delimitar exactamente la necesidad.", max_score: 10, affectation: "mp" },
          { attribute: "Validación y paráfrasis", description: "Confirma con el usuario que entendió correctamente el motivo de contacto.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Entrega de información completa, veraz, clara y solución oportuna.",
        weight: 30,
        items: [
          { attribute: "Solución clara y efectiva", description: "Resuelve la duda o ejecuta el trámite con precisión y rapidez.", max_score: 20, affectation: "mp" },
          { attribute: "Explicación paso a paso", description: "Explica procedimientos y tiempos de respuesta de forma entendible.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Seguridad de la información, validación de identidad y registro en sistemas.",
        weight: 15,
        items: [
          { attribute: "Validación de identidad", description: "Aplica filtros de seguridad para validar al titular de la cuenta.", max_score: 10, affectation: "critico" },
          { attribute: "Tipificación y notas", description: "Registra en CRM el resumen exacto del caso y folio correspondiente.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Confirmación de satisfacción, ofrecimiento de ayuda adicional y despedida.",
        weight: 15,
        items: [
          { attribute: "¿Algo más en que pueda ayudarle?", description: "Pregunta si quedan dudas pendientes antes de finalizar.", max_score: 10, affectation: "none" },
          { attribute: "Despedida institucional", description: "Se despide de manera cortés mencionando los canales de autoservicio.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  cobranza: {
    id: "cobranza",
    label: "Cobranza",
    shortLabel: "Cobranza",
    emoji: "💰",
    description: "Mora, acuerdos de pago, promesas y normalización de cartera",
    resultChartTitle: "Promesas de Pago y Acuerdos (total periodo)",
    resultBreakdownTitle: "Promesa de pago — desglose por canal",
    resultColumnLabel: "Promesa / Resultado",
    secondaryResultColumnLabel: "Estado Pago",
    categories: [
      { name: "Promesa de pago (Sí)", color: "#10b981", isPositive: true, keywords: ["promesa de pago", "compromiso de pago", "pagar[eé]", "pagar[aá]", "fecha de pago", "si paga", "promesa (si)"] },
      { name: "Pago realizado", color: "#3b82f6", isPositive: true, keywords: ["ya pag[oó]", "ya realic[eé] el pago", "pago aplicado", "comprobante enviado", "cuenta al d[ií]a", "cliente al d[ií]a"] },
      { name: "Acuerdo / Negociación", color: "#0ea5e9", isPositive: true, keywords: ["acuerdo", "convenio", "negociaci[oó]n", "descuento", "reestructuraci[oó]n", "plan de pagos"] },
      { name: "Pago parcial / Condicionado", color: "#0d9488", isNeutral: true, keywords: ["pago parcial", "abono", "condicionado", "pago una parte"] },
      { name: "Agenda / Reagendamiento", color: "#8b5cf6", isNeutral: true, keywords: ["agenda", "reagendamiento", "pr[oó]rroga", "llamar en otra fecha"] },
      { name: "Falta de liquidez / Desempleo", color: "#f59e0b", isNeutral: true, keywords: ["sin dinero", "falta de liquidez", "desempleo", "no tiene plata", "problemas econ[oó]micos"] },
      { name: "Negativa de pago (No)", color: "#ef4444", isNegative: true, keywords: ["negativa", "no va a pagar", "no quiere pagar", "rechazo de pago", "se niega"] },
      { name: "Desconoce deuda / Fraude", color: "#991b1b", isNegative: true, keywords: ["desconoce", "fraude", "no es mi deuda", "suplantaci[oó]n", "no reconoce"] },
      { name: "No es cliente / Equivocado", color: "#f97316", isNegative: true, keywords: ["no es cliente", "equivocado", "n[uú]mero errado", "no vive aqu[ií]"] },
      { name: "Buzón / Cuelga / No contesta", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "cuelga", "no contesta", "mudo", "no atiende"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "promises",
        title: "% Efectividad Promesas",
        iconName: "trending-up",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "cobranza");
            return res === "Promesa de pago (Sí)" || res === "Pago realizado" || res === "Acuerdo / Negociación";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior especialista en gestión de cobranza, recuperación de cartera vencida y negociación de pagos.",
      focusAreas: [
        "Tasa de promesas de pago conseguidas y cumplimiento proyectado",
        "Distribución de motivos de no pago (liquidez, quejas, desconocimiento)",
        "Efectividad de acuerdos en llamadas vs canales digitales (WhatsApp)",
        "Comportamiento de asesores en técnicas de negociación y objeciones",
        "Plan de acción para maximizar la recuperación de saldos pendientes",
      ],
      contextPlaceholder: "Ej: Cartera mora 30 a 60 días, foco en negociación de pagos parciales y verificación de fecha límite...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Presentación, tono firme y profesional, respeto y manejo de la compostura.",
        weight: 20,
        items: [
          { attribute: "Presentación institucional", description: "Identifica empresa, nombre del asesor y valida con quién habla.", max_score: 10, affectation: "none" },
          { attribute: "Tono respetuoso y profesional", description: "No usa sarcasmo ni agresividad, mantiene calma ante objeciones.", max_score: 10, affectation: "critico" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Sondeo de la causa de mora, fecha de vencimiento y saldo pendiente.",
        weight: 20,
        items: [
          { attribute: "Sondeo de motivo de no pago", description: "Pregunta la causa del atraso para buscar la solución adecuada.", max_score: 10, affectation: "mp" },
          { attribute: "Información clara de deuda", description: "Informa saldo vencido, cargos y fecha de corte con precisión.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Negociación, alternativas de pago y aseguramiento del compromiso.",
        weight: 30,
        items: [
          { attribute: "Pactación de compromiso firme", description: "Concreta fecha exacta, monto y canal de pago pactado.", max_score: 20, affectation: "mp" },
          { attribute: "Presentación de alternativas", description: "Ofrece opciones de liquidación, convenios o prórrogas viables.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Canales autorizados de pago, confirmación de soporte y políticas regulatorias.",
        weight: 15,
        items: [
          { attribute: "Canales oficiales de pago", description: "Instruye el pago por medios seguros y autorizados sin cuentas dudosas.", max_score: 10, affectation: "critico" },
          { attribute: "Tipificación fidedigna", description: "Tipifica el resultado exacto de la gestión en el sistema.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Resumen del compromiso acordado, envío de referencia y despedida formal.",
        weight: 15,
        items: [
          { attribute: "Confirmación final del acuerdo", description: "Reitera fecha límite y consecuencias de incumplimiento amablemente.", max_score: 10, affectation: "mp" },
          { attribute: "Despedida cordial", description: "Finaliza agradeciendo la atención prestada.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  soporte_tecnico: {
    id: "soporte_tecnico",
    label: "Soporte Técnico",
    shortLabel: "Soporte",
    emoji: "🔧",
    description: "Diagnóstico de fallas, configuración de equipos y asistencia técnica",
    resultChartTitle: "Resolución de Incidencias Técnicas (total periodo)",
    resultBreakdownTitle: "Estado de incidencias técnicas — por canal",
    resultColumnLabel: "Estado Incidencia",
    secondaryResultColumnLabel: "Tipo de Falla",
    categories: [
      { name: "Resuelto en primer contacto", color: "#10b981", isPositive: true, keywords: ["resuelto", "solucionado", "falla corregida", "servicio restablecido", "funcionando", "qued[oó] operativo"] },
      { name: "Falla técnica confirmada", color: "#f59e0b", isNeutral: true, keywords: ["falla confirmada", "daño t[eé]cnico", "problema en l[ií]nea", "intermitencia", "sin se[nñ]al"] },
      { name: "Configuración / Guía", color: "#0ea5e9", isPositive: true, keywords: ["configuraci[oó]n", "paso a paso", "reinicio", "par[aá]metros", "ajuste de equipo"] },
      { name: "Escalamiento a ingeniería", color: "#8b5cf6", isNeutral: true, keywords: ["escalado a ingenier[ií]a", "nivel 2 t[eé]cnico", "cuadrilla", "plataforma central"] },
      { name: "Visita técnica agendada", color: "#3b82f6", isNeutral: true, keywords: ["visita t[eé]cnica", "t[eé]cnico en domicilio", "cita t[eé]cnica", "agendamiento t[eé]cnico"] },
      { name: "Pendiente validación cliente", color: "#d946ef", isNeutral: true, keywords: ["pendiente cliente", "en pruebas", "validar en horas", "cliente probar[aá]"] },
      { name: "No solucionado", color: "#ef4444", isNegative: true, keywords: ["no solucionado", "continua falla", "sin soluci[oó]n", "inconforme con soporte"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "fcr",
        title: "FCR / Solución %",
        iconName: "check-circle",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "soporte_tecnico");
            return res === "Resuelto en primer contacto" || res === "Configuración / Guía";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior especialista en HelpDesk, soporte técnico IT y optimización de FCR (First Contact Resolution).",
      focusAreas: [
        "Resolución en primer contacto vs escalamientos técnicos",
        "Tipología de fallas más recurrentes (conectividad, configuración, hardware)",
        "Claridad metodológica y rigor técnico de los asesores al guiar al usuario",
        "Efectividad de soporte guiado vía chat de WhatsApp vs llamada",
        "Planes de mejora para reducir visitas técnicas innecesarias",
      ],
      contextPlaceholder: "Ej: Diagnóstico de fallas recurrentes de conectividad y efectividad de pruebas remotas...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Trato empático con el usuario afectado, paciencia técnica y lenguaje claro.",
        weight: 20,
        items: [
          { attribute: "Apertura empática", description: "Saluda cordialmente y valida la molestia que causa la falla con empatía.", max_score: 10, affectation: "none" },
          { attribute: "Lenguaje comprensible", description: "Explica conceptos técnicos con analogías y lenguaje sin tecnicismos confusos.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Diagnóstico metódico de la falla, síntomas y pruebas iniciales.",
        weight: 25,
        items: [
          { attribute: "Sondeo de síntomas de la falla", description: "Pregunta cuándo inició la falla, luces del equipo y dispositivos afectados.", max_score: 15, affectation: "mp" },
          { attribute: "Verificación de historial técnico", description: "Revisa reportes anteriores para no repetir pasos innecesarios.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Guía paso a paso de pruebas, comandos de configuración y restablecimiento.",
        weight: 25,
        items: [
          { attribute: "Guía de pruebas efectiva", description: "Acompaña al usuario en el paso a paso asegurando su comprensión.", max_score: 15, affectation: "mp" },
          { attribute: "Comprobación de operatividad", description: "Valida que el servicio realmente haya quedado funcional antes de cerrar.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Registro de pruebas, escalamiento formal y tiempos de respuesta.",
        weight: 15,
        items: [
          { attribute: "Registro de bitácora técnica", description: "Documenta en sistema las pruebas realizadas y parámetros obtenidos.", max_score: 10, affectation: "none" },
          { attribute: "Escalamiento correcto con folio", description: "Si requiere nivel 2 o visita, genera ticket con folio y fecha promesa.", max_score: 5, affectation: "critico" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Recomendaciones preventivas, número de reporte y despedida cordial.",
        weight: 15,
        items: [
          { attribute: "Consejos de prevención", description: "Brinda tips para evitar que la incidencia vuelva a ocurrir.", max_score: 10, affectation: "none" },
          { attribute: "Despedida y entrega de ticket", description: "Proporciona el número de ticket y se despide cordialmente.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  retencion: {
    id: "retencion",
    label: "Retención",
    shortLabel: "Retención",
    emoji: "🛡️",
    description: "Prevención de cancelaciones, manejo de objeciones y fidelización",
    resultChartTitle: "Resultados de Retención (total periodo)",
    resultBreakdownTitle: "Resultado de retención — desglose por canal",
    resultColumnLabel: "Resultado Retención",
    secondaryResultColumnLabel: "Motivo Cancelación",
    categories: [
      { name: "Retenido con éxito", color: "#10b981", isPositive: true, keywords: ["retenido", "continua con servicio", "acepta quedarse", "desiste de cancelaci[oó]n", "fidelizado"] },
      { name: "Oferta / Descuento aceptado", color: "#3b82f6", isPositive: true, keywords: ["oferta aceptada", "acepta descuento", "promoci[oó]n aceptada", "cambio de plan aceptado"] },
      { name: "En proceso de retención", color: "#0ea5e9", isNeutral: true, keywords: ["lo pensar[aá]", "evaluando oferta", "en proceso", "segunda llamada"] },
      { name: "Oferta rechazada", color: "#f59e0b", isNeutral: true, keywords: ["oferta rechazada", "no acepta descuento", "insiste en cancelar", "no convence"] },
      { name: "Cancelación confirmada", color: "#ef4444", isNegative: true, keywords: ["cancelaci[oó]n confirmada", "cancelado", "baja tramitada", "retiro del servicio"] },
      { name: "Motivo económico", color: "#f97316", isNeutral: true, keywords: ["motivo econ[oó]mico", "falta dinero", "muy costoso", "recorte de gastos"] },
      { name: "Motivo mal servicio", color: "#be123c", isNegative: true, keywords: ["mal servicio", "inconforme con atenci[oó]n", "muchas fallas", "pésimo servicio"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "retentionRate",
        title: "% Tasa de Retención",
        iconName: "shield-check",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "retencion");
            return res === "Retenido con éxito" || res === "Oferta / Descuento aceptado";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior en retención de clientes, prevención de Churn y fidelización en contact centers.",
      focusAreas: [
        "Tasa de éxito de retención y efectividad de ofertas comerciales",
        "Principales causales de cancelación (precio, fallas técnicas, competencia)",
        "Habilidad de los asesores en contra-argumentación y escucha activa",
        "Diferencial de retención en llamadas vs WhatsApp",
        "Estrategias proactivas de fidelización para cuentas en riesgo",
      ],
      contextPlaceholder: "Ej: Evaluar motivos de cancelación por precio vs calidad y efectividad de descuentos del 20%...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Manejo de la objeción inicial, empatía ante la inconformidad y tono profesional.",
        weight: 20,
        items: [
          { attribute: "Recepción cordial y empática", description: "Acoge la solicitud con respeto y muestra disposición genuina para ayudar.", max_score: 10, affectation: "none" },
          { attribute: "Manejo de la frustración del cliente", description: "No entra en conflicto ni se pone a la defensiva ante quejas.", max_score: 10, affectation: "critico" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Sondeo profundo del motivo real de la cancelación o intención de retiro.",
        weight: 25,
        items: [
          { attribute: "Identificación de la causa raíz", description: "Indaga a fondo si la cancelación es por precio, fallas o competencia.", max_score: 15, affectation: "mp" },
          { attribute: "Revisión del valor del cliente", description: "Verifica antigüedad, consumo y beneficios acumulados del usuario.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Presentación de ofertas de valor, planes de alivio y beneficios de permanencia.",
        weight: 25,
        items: [
          { attribute: "Oferta de retención personalizada", description: "Presenta la propuesta que mejor resuelve la causa raíz del cliente.", max_score: 15, affectation: "mp" },
          { attribute: "Manejo de contra-objeciones", description: "Realiza al menos 2 intentos de retención con argumentos convincentes.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Políticas de cancelación, aplicación de beneficios y términos contractuales.",
        weight: 15,
        items: [
          { attribute: "Claridad en condiciones acordadas", description: "Informa fechas de vigencia y compromisos de la oferta aceptada.", max_score: 10, affectation: "none" },
          { attribute: "Procesamiento y tipificación", description: "Si no retiene, tramita baja formal sin trabas ilegales y con folio.", max_score: 5, affectation: "critico" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Resumen de lo acordado, agradecimiento por la confianza y despedida.",
        weight: 15,
        items: [
          { attribute: "Confirmación del estatus de la cuenta", description: "Valida que el cliente tenga claro el estado final de su servicio.", max_score: 10, affectation: "mp" },
          { attribute: "Despedida institucional", description: "Finaliza agradeciendo el tiempo y preferencia.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  agendamiento: {
    id: "agendamiento",
    label: "Agendamiento",
    shortLabel: "Agendamiento",
    emoji: "📅",
    description: "Citas, visitas, reservas y confirmación de turnos",
    resultChartTitle: "Estado de Citas y Reservas (total periodo)",
    resultBreakdownTitle: "Estado de citas — desglose por canal",
    resultColumnLabel: "Estado de Cita",
    secondaryResultColumnLabel: "Tipo de Reserva",
    categories: [
      { name: "Cita creada / confirmada", color: "#10b981", isPositive: true, keywords: ["cita confirmada", "agendado", "cita creada", "reserva confirmada", "turno asignado"] },
      { name: "Cita reagendada", color: "#3b82f6", isNeutral: true, keywords: ["reagendado", "cambio de fecha", "nueva cita", "reprogramado"] },
      { name: "Pendiente confirmación", color: "#0ea5e9", isNeutral: true, keywords: ["pendiente confirmaci[oó]n", "por confirmar", "en espera de horario"] },
      { name: "Cita cancelada", color: "#ef4444", isNegative: true, keywords: ["cita cancelada", "cancela cita", "anula reserva", "ya no necesita"] },
      { name: "No asiste / Ausente", color: "#f59e0b", isNegative: true, keywords: ["no asiste", "ausente", "no se present[oó]", "incomparecencia"] },
      { name: "Fuera de cobertura / No aplica", color: "#8b5cf6", isNegative: true, keywords: ["fuera de cobertura", "no aplica horario", "sin disponibilidad"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "bookingRate",
        title: "% Agendamiento Efectivo",
        iconName: "calendar",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "agendamiento");
            return res === "Cita creada / confirmada" || res === "Cita reagendada";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor especialista en gestión de agendas, contactación y optimización de turnos y citas médicas/comerciales.",
      focusAreas: [
        "Efectividad de agendamiento y tasa de confirmación por canal",
        "Principales motivos de cancelación o reprogramación",
        "Disponibilidad horaria y ajuste a las preferencias del usuario",
        "Claridad en los requisitos y documentos necesarios para la cita",
        "Recomendaciones para reducir el absentismo (no asistencia)",
      ],
      contextPlaceholder: "Ej: Evaluar efectividad de confirmación de citas vía WhatsApp vs llamadas y motivos de no asistencia...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Saludo cordial, identificación rápida del paciente/cliente y trato respetuoso.",
        weight: 20,
        items: [
          { attribute: "Saludo e identificación", description: "Se presenta amablemente e identifica al titular de la cita.", max_score: 10, affectation: "none" },
          { attribute: "Tono cordial y profesional", description: "Muestra dinamismo y calidez durante la interacción.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Sondeo del tipo de cita, profesional o servicio requerido y ubicación.",
        weight: 25,
        items: [
          { attribute: "Identificación del servicio", description: "Verifica especialidad, profesional, sede o servicio requerido.", max_score: 15, affectation: "mp" },
          { attribute: "Preferencia horaria", description: "Consulta disponibilidad y preferencias de horario del usuario.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Asignación de turno, verificación de agenda y confirmación de datos.",
        weight: 25,
        items: [
          { attribute: "Asignación óptima de horario", description: "Brinda la alternativa más oportuna y conveniente para el cliente.", max_score: 15, affectation: "mp" },
          { attribute: "Explicación de requisitos", description: "Informa puntualidad, documentos y preparación previa requerida.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Registro en sistema de agenda, datos de contacto y recordatorios.",
        weight: 15,
        items: [
          { attribute: "Registro exacto en agenda", description: "Guarda la cita con fecha, hora, sede y teléfono correctos.", max_score: 10, affectation: "critico" },
          { attribute: "Activación de recordatorio", description: "Confirma el envío de confirmación por SMS o WhatsApp.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Lectura de confirmación final de la cita y despedida cordial.",
        weight: 15,
        items: [
          { attribute: "Resumen final de la cita", description: "Reitera día, hora, sede y nombre del profesional asignado.", max_score: 10, affectation: "mp" },
          { attribute: "Despedida y agradecimiento", description: "Agradece la comunicación y desea un buen día.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  prospeccion: {
    id: "prospeccion",
    label: "Prospección",
    shortLabel: "Prospección",
    emoji: "📣",
    description: "Calificación de leads, generación de oportunidades y prospección",
    resultChartTitle: "Calificación de Leads (total periodo)",
    resultBreakdownTitle: "Calificación de leads — desglose por canal",
    resultColumnLabel: "Calificación Lead",
    secondaryResultColumnLabel: "Nivel de Interés",
    categories: [
      { name: "Lead calificado", color: "#10b981", isPositive: true, keywords: ["calificado", "cumple perfil", "lead calificado", "pasa a ventas", "oportunidad lista"] },
      { name: "Interesado / Oportunidad", color: "#3b82f6", isPositive: true, keywords: ["interesado", "oportunidad", "buen inter[eé]s", "solicita demo", "quiere reuni[oó]n"] },
      { name: "Seguimiento agendado", color: "#0ea5e9", isNeutral: true, keywords: ["seguimiento", "llamar despu[eé]s", "contacto futuro", "evaluar[aá] informaci[oó]n"] },
      { name: "Dudas / Objeciones", color: "#f59e0b", isNeutral: true, keywords: ["dudas", "objeciones", "indeciso", "falta informaci[oó]n"] },
      { name: "No interesado / Descartado", color: "#ef4444", isNegative: true, keywords: ["no interesado", "descartado", "no le sirve", "rechaza propuesta"] },
      { name: "No cumple perfil", color: "#8b5cf6", isNegative: true, keywords: ["no cumple perfil", "fuera de target", "sin presupuesto", "sin autoridad de compra"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "qualificationRate",
        title: "% Leads Calificados",
        iconName: "target",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "prospeccion");
            return res === "Lead calificado" || res === "Interesado / Oportunidad";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior en prospección B2B/B2C, calificación de leads (BANT/MEDDIC) y desarrollo de oportunidades comerciales.",
      focusAreas: [
        "Tasa de calificación de leads y calidad de la base de datos",
        "Efectividad en el pitch inicial y captura de atención",
        "Detección de necesidades, presupuesto y tomador de decisiones",
        "Comparativo de contactación WhatsApp vs llamadas en frío",
        "Estrategias para aumentar el paso de leads calificados al equipo de cierre",
      ],
      contextPlaceholder: "Ej: Evaluar calidad de leads de campaña digital y efectividad del script de calificación BANT...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Enganche inicial en los primeros segundos, tono dinámico y profesional.",
        weight: 20,
        items: [
          { attribute: "Enganche y presentación inicial", description: "Capta el interés en los primeros 10 segundos con un mensaje de valor.", max_score: 10, affectation: "mp" },
          { attribute: "Tono seguro y profesional", description: "Transmite confianza, entusiasmo y credibilidad.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Sondeo de perfil de cliente, dolor principal y aplicabilidad del producto.",
        weight: 25,
        items: [
          { attribute: "Preguntas de calificación", description: "Verifica si el prospecto cumple criterios de target y presupuesto.", max_score: 15, affectation: "mp" },
          { attribute: "Identificación del tomador de decisión", description: "Indaga si conversa con la persona con capacidad de decidir o comprar.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Presentación breve de la propuesta de valor adaptada al dolor del lead.",
        weight: 25,
        items: [
          { attribute: "Propuesta de valor concreta", description: "Conecta la solución con el dolor identificado sin saturar de detalles.", max_score: 15, affectation: "mp" },
          { attribute: "Manejo de objeción rápida", description: "Maneja objeciones típicas ('no tengo tiempo', 'mándame un correo').", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Tipificación fidedigna del estado del lead y actualización en CRM.",
        weight: 15,
        items: [
          { attribute: "Actualización de datos de contacto", description: "Valida correo, teléfono y cargo exactos del contacto.", max_score: 10, affectation: "none" },
          { attribute: "Tipificación correcta del lead", description: "Clasifica con precisión el estatus del prospecto en el sistema.", max_score: 5, affectation: "critico" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Agendamiento de demo/reunión con ejecutivo de ventas y despedida cordial.",
        weight: 15,
        items: [
          { attribute: "Pacto de siguiente paso (Demo/Cita)", description: "Agenda fecha y hora precisa para la reunión comercial o seguimiento.", max_score: 10, affectation: "mp" },
          { attribute: "Despedida cordial", description: "Agradece el tiempo del prospecto amablemente.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  encuestas: {
    id: "encuestas",
    label: "Encuestas",
    shortLabel: "Encuestas",
    emoji: "📊",
    description: "Medición de NPS, satisfacción del cliente (CSAT) y estudios de opinión",
    resultChartTitle: "Satisfacción y NPS (total periodo)",
    resultBreakdownTitle: "NPS y Satisfacción — desglose por canal",
    resultColumnLabel: "Calificación NPS/CSAT",
    secondaryResultColumnLabel: "Comentario Cliente",
    categories: [
      { name: "Promotor (NPS 9-10)", color: "#10b981", isPositive: true, keywords: ["promotor", "nps 10", "nps 9", "excelente servicio", "recomienda", "muy satisfecho"] },
      { name: "Pasivo (NPS 7-8)", color: "#3b82f6", isNeutral: true, keywords: ["pasivo", "nps 8", "nps 7", "bueno", "aceptable", "satisfecho"] },
      { name: "Detractor (NPS 1-6)", color: "#ef4444", isNegative: true, keywords: ["detractor", "nps 1", "nps 2", "nps 3", "nps 4", "nps 5", "nps 6", "mala experiencia", "no recomienda"] },
      { name: "CSAT Alto (4-5)", color: "#0ea5e9", isPositive: true, keywords: ["csat 5", "csat 4", "totalmente satisfecho", "muy bien"] },
      { name: "CSAT Bajo (1-2)", color: "#f59e0b", isNegative: true, keywords: ["csat 1", "csat 2", "insatisfecho", "muy insatisfecho"] },
      { name: "Reclamo durante encuesta", color: "#8b5cf6", isNegative: true, keywords: ["reclamo", "aprovecha para quejarse", "solicita llamada de supervisor"] },
      { name: "No responde encuesta", color: "#64748b", isNegative: true, keywords: ["no responde", "rechaza encuesta", "corta", "sin tiempo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "npsScore",
        title: "% Promotores / CSAT+",
        iconName: "award",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "encuestas");
            return res === "Promotor (NPS 9-10)" || res === "CSAT Alto (4-5)";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior en métricas de experiencia de cliente, NPS, CSAT, CES y análisis de sentimiento de retroalimentación.",
      focusAreas: [
        "Cálculo del Net Promoter Score (NPS) y ratio de promotores vs detractores",
        "Principales motivos expresados por clientes detractores",
        "Tasa de completitud de encuestas en llamadas vs WhatsApp",
        "Oportunidades de cierre de ciclo (Close the loop) con clientes insatisfechos",
        "Recomendaciones estructurales para elevar la lealtad de clientes",
      ],
      contextPlaceholder: "Ej: Análisis de feedback abierto de detractores y factores que impulsan la recomendación...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Tono neutral, respetuoso y sin sesgo en la aplicación de la encuesta.",
        weight: 20,
        items: [
          { attribute: "Presentación del objetivo", description: "Explica brevemente la importancia de la encuesta y duración estimada.", max_score: 10, affectation: "none" },
          { attribute: "Tono neutral sin inducir respuestas", description: "No sugiere calificaciones ni condiciona la opinión del cliente.", max_score: 10, affectation: "critico" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Validación de servicio o producto a evaluar e interacción reciente.",
        weight: 20,
        items: [
          { attribute: "Contextualización del servicio", description: "Valida que el usuario recuerde la atención o producto que va a evaluar.", max_score: 10, affectation: "none" },
          { attribute: "Disposición del encuestado", description: "Valida amablemente si el usuario cuenta con 1-2 minutos para responder.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Aplicación metódica de preguntas cuantitativas y preguntas abiertas de feedback.",
        weight: 30,
        items: [
          { attribute: "Lectura fiel de preguntas", description: "Formula las preguntas con la escala y texto exactos autorizados.", max_score: 15, affectation: "mp" },
          { attribute: "Captura de retroalimentación cualitativa", description: "Indaga el porqué de la calificación sin discutir con el usuario.", max_score: 15, affectation: "none" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Registro de notas exactas, protección de datos y tipificación.",
        weight: 15,
        items: [
          { attribute: "Registro exacto de puntuaciones", description: "Guarda las calificaciones numéricas y comentarios literales en sistema.", max_score: 10, affectation: "critico" },
          { attribute: "Alerta de caso crítico", description: "Si hay detractor severo, marca caso para gestión de Close the Loop.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Agradecimiento sincero por el tiempo y despedida institucional.",
        weight: 15,
        items: [
          { attribute: "Agradecimiento por feedback", description: "Agradece las sugerencias indicando que ayudan a mejorar el servicio.", max_score: 10, affectation: "none" },
          { attribute: "Despedida cordial", description: "Finaliza de manera amable y formal.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  postventa: {
    id: "postventa",
    label: "Postventa",
    shortLabel: "Postventa",
    emoji: "📦",
    description: "Seguimiento de pedidos, entregas, garantías y devoluciones",
    resultChartTitle: "Gestión de Casos Postventa (total periodo)",
    resultBreakdownTitle: "Casos postventa — desglose por canal",
    resultColumnLabel: "Estado Postventa",
    secondaryResultColumnLabel: "Tipo de Caso",
    categories: [
      { name: "Seguimiento exitoso / Entregado", color: "#10b981", isPositive: true, keywords: ["entregado", "recibi[oó] conforme", "seguimiento exitoso", "pedido completado", "satisfecho con entrega"] },
      { name: "Garantía aprobada", color: "#3b82f6", isPositive: true, keywords: ["garant[ií]a aprobada", "aplica garant[ií]a", "cambio autorizado", "reparaci[oó]n aprobada"] },
      { name: "En trámite / Entrega pendiente", color: "#0ea5e9", isNeutral: true, keywords: ["en tr[aá]nsito", "en ruta", "pendiente entrega", "en despacho", "en preparaci[oó]n"] },
      { name: "Devolución / Cambio solicitado", color: "#f59e0b", isNeutral: true, keywords: ["devoluci[oó]n", "cambio de producto", "solicita reembolso", "producto errado"] },
      { name: "Reclamo producto / avería", color: "#ef4444", isNegative: true, keywords: ["producto averiado", "da[nñ]ado", "incompleto", "reclamo de producto", "falla de f[aá]brica"] },
      { name: "Pendiente información cliente", color: "#8b5cf6", isNeutral: true, keywords: ["pendiente fotos", "espera comprobante", "falta direcci[oó]n", "documentos pendientes"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "satisfactionRate",
        title: "% Entregas / Resueltos",
        iconName: "check-circle",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "postventa");
            return res === "Seguimiento exitoso / Entregado" || res === "Garantía aprobada";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior en operaciones postventa, logística de entregas, políticas de garantías y satisfacción del cliente final.",
      focusAreas: [
        "Cumplimiento en tiempos de entrega y trazabilidad logística",
        "Incidencias más comunes en garantías y devoluciones de productos",
        "Resolución de quejas por entregas fallidas o productos averiados",
        "Eficiencia del seguimiento proactivo vía WhatsApp",
        "Planes de acción para optimizar la experiencia de entrega y unboxing",
      ],
      contextPlaceholder: "Ej: Tiempos de respuesta en gestión de garantías y trazabilidad de despachos con retraso...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Recepción cordial, empatía ante retrasos o reclamos y lenguaje profesional.",
        weight: 20,
        items: [
          { attribute: "Saludo y validación de orden", description: "Se presenta y solicita número de pedido o guía con amabilidad.", max_score: 10, affectation: "none" },
          { attribute: "Empatía ante incidentes", description: "Reconoce afectaciones si el pedido tuvo demora o daño con tacto.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Localización del estado del pedido, guía de transporte o motivo del reclamo.",
        weight: 20,
        items: [
          { attribute: "Rastreo preciso del estado", description: "Consulta en plataforma logística el estatus real de entrega o garantía.", max_score: 10, affectation: "mp" },
          { attribute: "Sondeo de conformidad", description: "Pregunta detalles del estado en que llegó el producto o la falla.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Información certera de entrega, trámite de garantía o gestión de devolución.",
        weight: 30,
        items: [
          { attribute: "Solución ágil y compromisos", description: "Brinda fecha estimada de entrega o inicia trámite de cambio inmediato.", max_score: 20, affectation: "mp" },
          { attribute: "Instrucciones de garantía/devolución", description: "Explica cómo embalar o enviar el producto paso a paso.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Políticas de garantía, tiempos de ley y registro en CRM / ERP.",
        weight: 15,
        items: [
          { attribute: "Validación de políticas de garantía", description: "Aplica correctamente condiciones y plazos de garantía sin omitir datos.", max_score: 10, affectation: "critico" },
          { attribute: "Generación de ticket postventa", description: "Deja registrado el caso con número de seguimiento para el cliente.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Resumen de compromisos, canales de seguimiento y despedida cordial.",
        weight: 15,
        items: [
          { attribute: "Resumen de plazos de entrega", description: "Confirma cuándo recibirá el producto o la respuesta técnica.", max_score: 10, affectation: "none" },
          { attribute: "Despedida institucional", description: "Agradece la compra y finaliza cordialmente.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },

  pqrs_backoffice: {
    id: "pqrs_backoffice",
    label: "PQRS / Backoffice",
    shortLabel: "PQRS",
    emoji: "📑",
    description: "Peticiones, quejas, reclamos, recursos y trámites documentales",
    resultChartTitle: "Resolución de PQRS y Casos (total periodo)",
    resultBreakdownTitle: "Estado de PQRS — desglose por canal",
    resultColumnLabel: "Estado PQRS",
    secondaryResultColumnLabel: "Tipo de Radicado",
    categories: [
      { name: "Petición / Consulta atendida", color: "#10b981", isPositive: true, keywords: ["atendida", "resuelta", "peticion atendida", "informaci[oó]n entregada"] },
      { name: "Queja / Reclamo resuelto", color: "#3b82f6", isPositive: true, keywords: ["reclamo resuelto", "queja solucionada", "a favor del cliente", "soluci[oó]n brindada"] },
      { name: "Solicitud tramitada / Radicada", color: "#0ea5e9", isNeutral: true, keywords: ["radicado", "tr[aá]mite iniciado", "caso abierto", "n[uú]mero de radicado"] },
      { name: "Escalamiento a área resolutora", color: "#8b5cf6", isNeutral: true, keywords: ["escalado a jur[ií]dica", "escalado a operaciones", "área resolutora", "en comit[eé]"] },
      { name: "Pendiente documentación", color: "#f59e0b", isNeutral: true, keywords: ["pendiente documentos", "falta evidencia", "espera soporte", "requiere c[eé]dula"] },
      { name: "Reclamo rechazado / improcedente", color: "#ef4444", isNegative: true, keywords: ["improcedente", "rechazado", "no procede", "sin lugar a reclamo"] },
      { name: "No contactado / Buzón", color: "#64748b", isNegative: true, keywords: ["buz[oó]n", "no contesta", "cuelga", "mudo"] },
      { name: "Otros", color: "#94a3b8", isNeutral: true, keywords: [] },
    ],
    kpis: [
      {
        id: "calls",
        title: "Llamadas",
        iconName: "phone",
        getValue: (s) => (s.callCount || 0).toLocaleString(),
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        iconName: "message",
        getValue: (s) => (s.whatsappCount || 0).toLocaleString(),
      },
      {
        id: "closureRate",
        title: "% Cierre Oportuno",
        iconName: "check-circle",
        getValue: (_, rows) => {
          if (!rows.length) return "0%";
          const count = rows.filter((r) => {
            const res = classifyOperationResult(r as any, "pqrs_backoffice");
            return res === "Petición / Consulta atendida" || res === "Queja / Reclamo resuelto";
          }).length;
          return `${Math.round((count / rows.length) * 100)}%`;
        },
      },
      {
        id: "score",
        title: "Score Calidad",
        iconName: "sparkles",
        getValue: (s) => `${s.avgScore || 0}%`,
      },
      {
        id: "duration",
        title: "Min. Totales",
        iconName: "clock",
        getValue: (s) => (s.totalDurationMinutes || 0).toLocaleString(),
      },
    ],
    reporteIa: {
      roleDescription: "consultor senior en gestión de PQRS, cumplimiento normativo y resolución de disputas de clientes.",
      focusAreas: [
        "Cumplimiento de tiempos legales de respuesta (SLA de PQRS)",
        "Principales motivos de quejas y reclamos reiterativos",
        "Calidad en la redacción y claridad de las respuestas formales",
        "Porcentaje de resoluciones favorables vs improcedentes",
        "Planes de mitigación preventiva de inconformidades raíz",
      ],
      contextPlaceholder: "Ej: Evaluación de tiempos de cierre de reclamos y causas recurrentes de inconformidad...",
    },
    qualityMatrixDefault: [
      {
        title: "1. Atención y comunicación",
        description: "Recepción formal, escucha atenta del reclamo y trato respetuoso.",
        weight: 20,
        items: [
          { attribute: "Recepción y validación de datos", description: "Saluda con solemnidad y valida los datos completos del peticionario.", max_score: 10, affectation: "none" },
          { attribute: "Escucha activa y contención", description: "Permite al usuario expresar su queja sin interrumpir ni desacreditar.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "2. Identificación de la necesidad",
        description: "Tipificación exacta entre Petición, Queja, Reclamo o Sugerencia.",
        weight: 20,
        items: [
          { attribute: "Clasificación precisa de la PQRS", description: "Distingue correctamente si es petición, queja, reclamo o recurso.", max_score: 10, affectation: "mp" },
          { attribute: "Identificación de pretensiones", description: "Tiene clara la pretensión o solicitud concreta que exige el cliente.", max_score: 10, affectation: "none" },
        ],
      },
      {
        title: "3. Gestión / solución",
        description: "Análisis del caso, recolección de pruebas y respuesta de fondo.",
        weight: 30,
        items: [
          { attribute: "Respuesta clara y motivada", description: "Brinda respuesta fundamentada en hechos y normativas vigentes.", max_score: 20, affectation: "mp" },
          { attribute: "Información de términos legales", description: "Informa los días hábiles exactos en que recibirá la respuesta formal.", max_score: 10, affectation: "riesgo" },
        ],
      },
      {
        title: "4. Cumplimiento del proceso",
        description: "Generación obligatoria de número de radicado y trazabilidad de ley.",
        weight: 15,
        items: [
          { attribute: "Generación de número de radicado", description: "Asigna y entrega el número de radicado oficial de la PQRS.", max_score: 10, affectation: "critico" },
          { attribute: "Carga de soportes en expediente", description: "Adjunta audios, documentos o pruebas presentadas al sistema.", max_score: 5, affectation: "none" },
        ],
      },
      {
        title: "5. Cierre de la interacción",
        description: "Confirmación de radicado recibido por el usuario y despedida formal.",
        weight: 15,
        items: [
          { attribute: "Reiteración de canales de consulta", description: "Explica cómo y dónde consultar el avance de su radicado.", max_score: 10, affectation: "none" },
          { attribute: "Despedida institucional", description: "Finaliza la atención de manera protocolaria y respetuosa.", max_score: 5, affectation: "none" },
        ],
      },
    ],
  },
};

export const MACROPROCESO_LIST: { id: MacroprocesoType; label: string; emoji: string; description: string }[] = [
  { id: "ventas", label: "Ventas", emoji: "🛒", description: "Venta nueva, cross-selling, upselling" },
  { id: "servicio_cliente", label: "Servicio al cliente", emoji: "🎧", description: "Consultas, solicitudes, atención" },
  { id: "cobranza", label: "Cobranza", emoji: "💰", description: "Mora, acuerdos de pago, promesas" },
  { id: "soporte_tecnico", label: "Soporte técnico", emoji: "🔧", description: "Fallas, configuración, diagnóstico" },
  { id: "retencion", label: "Retención", emoji: "🛡️", description: "Cancelaciones, fidelización" },
  { id: "agendamiento", label: "Agendamiento", emoji: "📅", description: "Citas, visitas, reservas" },
  { id: "prospeccion", label: "Prospección", emoji: "📣", description: "Leads y calificación comercial" },
  { id: "encuestas", label: "Encuestas", emoji: "📊", description: "NPS, satisfacción, CSAT" },
  { id: "postventa", label: "Postventa", emoji: "📦", description: "Pedidos, garantías, seguimiento" },
  { id: "pqrs_backoffice", label: "PQRS / Backoffice", emoji: "📑", description: "Reclamos, casos, documentos" },
];

export function getMacroprocesoConfig(type?: string | null): MacroprocesoConfig {
  const normKey = (type || "").toLowerCase().trim() as MacroprocesoType;
  if (normKey in MACROPROCESOS_CONFIG) {
    return MACROPROCESOS_CONFIG[normKey];
  }
  // Mapeos secundarios comunes
  if (normKey.includes("venta") || normKey.includes("comercial")) return MACROPROCESOS_CONFIG.ventas;
  if (normKey.includes("servicio") || normKey.includes("atencion") || normKey.includes("atención")) return MACROPROCESOS_CONFIG.servicio_cliente;
  if (normKey.includes("cobranza") || normKey.includes("mora") || normKey.includes("pago")) return MACROPROCESOS_CONFIG.cobranza;
  if (normKey.includes("soporte") || normKey.includes("tecnico") || normKey.includes("técnico")) return MACROPROCESOS_CONFIG.soporte_tecnico;
  if (normKey.includes("retencion") || normKey.includes("retención") || normKey.includes("cancelaci")) return MACROPROCESOS_CONFIG.retencion;
  if (normKey.includes("agend") || normKey.includes("cita") || normKey.includes("reserva")) return MACROPROCESOS_CONFIG.agendamiento;
  if (normKey.includes("prospec") || normKey.includes("lead")) return MACROPROCESOS_CONFIG.prospeccion;
  if (normKey.includes("encuesta") || normKey.includes("nps") || normKey.includes("csat")) return MACROPROCESOS_CONFIG.encuestas;
  if (normKey.includes("postventa") || normKey.includes("garantia") || normKey.includes("garantía")) return MACROPROCESOS_CONFIG.postventa;
  if (normKey.includes("pqrs") || normKey.includes("pqr") || normKey.includes("reclamo") || normKey.includes("backoffice")) return MACROPROCESOS_CONFIG.pqrs_backoffice;

  return MACROPROCESOS_CONFIG.ventas;
}

/**
 * Clasifica dinámicamente el resultado de una fila según el macroproceso.
 */
export function classifyOperationResult(row: AnalizadorUnifiedRow & Record<string, unknown>, macroproceso?: string | null): string {
  const config = getMacroprocesoConfig(macroproceso);
  const cats = config.categories;

  // 1. Si existe un valor explícito en la fila ya seteado
  const explicitResult = row.resultado_operacion || row.resultado || row.intencion || row.promesa_de_pago;
  if (explicitResult && typeof explicitResult === "string") {
    const found = cats.find((c) => c.name.toLowerCase() === explicitResult.toLowerCase().trim());
    if (found) return found.name;
  }

  // 2. Extraer todo el texto relevante de la interacción
  const merged = getMergedAnalysisRecord(row);
  const textBlob = [
    String(row.summary || ""),
    String(row.promesa_de_pago || ""),
    String(row.motivo_principal || ""),
    String(row.estado_pago_detalle || ""),
    String(merged.conclusion || merged.Conclusiones || ""),
    String(merged.resultado || merged.Resultado || ""),
    String(merged.intencion || merged.Intencion || ""),
    String(merged.motivo || merged.Motivo || ""),
    String(merged.promesa_de_pago || ""),
  ].join(" ").toLowerCase();

  // 3. Evaluar reglas de palabras clave de cada categoría
  for (const cat of cats) {
    if (!cat.keywords || cat.keywords.length === 0) continue;
    for (const kw of cat.keywords) {
      if (new RegExp(kw, "i").test(textBlob)) {
        return cat.name;
      }
    }
  }

  // 4. Fallback a última categoría ("Otros" o similar)
  const lastCat = cats.find((c) => c.name.toLowerCase().includes("otro")) ?? cats[cats.length - 1];
  return lastCat?.name ?? "Otros";
}

export interface QualityBlockQuestion {
  id: string;
  text: string;
  weight: number;
  description?: string;
  affectation?: "none" | "mp" | "riesgo" | "critico";
  required?: boolean;
}

export interface QualityBlockConfig {
  id: string;
  title: string;
  description: string;
  kind?: "regular" | "critical";
  weightPct: number;
  questions: QualityBlockQuestion[];
}

export const DEFAULT_QUALITY_BLOCKS: QualityBlockConfig[] = [
  {
    id: "presentacion_comunicacion",
    title: "1. PRESENTACIÓN Y COMUNICACIÓN",
    description: "Saludo cordial, identificación institucional, personalización, modulación y tono profesional.",
    kind: "regular",
    weightPct: 20,
    questions: [
      {
        id: "q1_1",
        text: "Saludo y Presentación Institucional",
        description: "Saluda cordialmente en los primeros segundos, se identifica con su nombre y empresa, y personaliza el trato con el usuario.",
        weight: 10,
        affectation: "none",
        required: true,
      },
      {
        id: "q1_2",
        text: "Tono, Modulación y Cortesía",
        description: "Mantiene un tono empático, amable, profesional, seguro y respetuoso durante toda la interacción.",
        weight: 10,
        affectation: "none",
        required: true,
      },
    ],
  },
  {
    id: "respeto_escucha_activa",
    title: "2. RESPETO Y ESCUCHA ACTIVA",
    description: "Escucha activa sin interrupciones, empatía con el interlocutor y calidez en el trato.",
    kind: "regular",
    weightPct: 20,
    questions: [
      {
        id: "q2_1",
        text: "Escucha Activa y No Interrupción",
        description: "Permite que el cliente exprese su situación o consulta sin interrumpirlo, demostrando atención activa.",
        weight: 10,
        affectation: "riesgo",
        required: true,
      },
      {
        id: "q2_2",
        text: "Empatía y Calidez en la Atención",
        description: "Muestra genuino interés por la necesidad del cliente, valida sus emociones o dudas con actitud servicial y comprensiva.",
        weight: 10,
        affectation: "riesgo",
        required: true,
      },
    ],
  },
  {
    id: "manejo_llamada_gestion",
    title: "3. MANEJO DE LA LLAMADA Y GESTIÓN",
    description: "Sondeo de necesidades, claridad en la información, agilidad y gestión adecuada de tiempos de espera.",
    kind: "regular",
    weightPct: 25,
    questions: [
      {
        id: "q3_1",
        text: "Sondeo Efectivo y Detección de Necesidad",
        description: "Realiza preguntas clave y oportunas para comprender a fondo la consulta, solicitud o problemática del cliente.",
        weight: 10,
        affectation: "mp",
        required: true,
      },
      {
        id: "q3_2",
        text: "Claridad en la Información y Control de Tiempos",
        description: "Brinda información clara, precisa y transparente, evitando silencios prolongados y optimizando los tiempos de llamada.",
        weight: 10,
        affectation: "mp",
        required: true,
      },
      {
        id: "q3_3",
        text: "Manejo de Tiempos de Espera (Hold)",
        description: "Solicita permiso antes de poner en espera con expectativa de tiempo clara y agradece la espera al retomar.",
        weight: 5,
        affectation: "none",
        required: true,
      },
    ],
  },
  {
    id: "manejo_objeciones_resolucion",
    title: "4. MANEJO DE OBJECIONES Y RESOLUCIÓN",
    description: "Seguridad y argumentos sólidos ante objeciones, alternativas viables y resolución orientada a la satisfacción.",
    kind: "regular",
    weightPct: 20,
    questions: [
      {
        id: "q4_1",
        text: "Manejo Efectivo de Objeciones y Dificultades",
        description: "Aborda dudas, objeciones o inquietudes con seguridad, alternativas viables y sin confrontar al cliente.",
        weight: 10,
        affectation: "riesgo",
        required: true,
      },
      {
        id: "q4_2",
        text: "Resolución y Propuesta de Solución",
        description: "Aclara dudas y resuelve la consulta o trámite en primer contacto de manera completa y oportuna.",
        weight: 10,
        affectation: "mp",
        required: true,
      },
    ],
  },
  {
    id: "cumplimiento_cierre",
    title: "5. CUMPLIMIENTO Y CIERRE",
    description: "Apego a políticas, privacidad, tipificación correcta en sistemas, verificación de satisfacción y despedida formal.",
    kind: "regular",
    weightPct: 15,
    questions: [
      {
        id: "q5_1",
        text: "Apego a Políticas, Privacidad y Seguridad",
        description: "Cumple con las políticas normativas de la empresa, aviso de privacidad o confidencialidad y validación de seguridad.",
        weight: 5,
        affectation: "none",
        required: true,
      },
      {
        id: "q5_2",
        text: "Tipificación y Registro Correcto",
        description: "Registra y clasifica la interacción de forma correcta y oportuna en los sistemas y CRM correspondientes.",
        weight: 5,
        affectation: "none",
        required: true,
      },
      {
        id: "q5_3",
        text: "Cierre, Verificación y Despedida",
        description: "Confirma acuerdos, valida si quedan dudas pendientes ('¿Hay algo más en lo que pueda ayudarle?') y se despide cordialmente.",
        weight: 5,
        affectation: "none",
        required: true,
      },
    ],
  },
  {
    id: "criticos_customer_experience",
    title: "Customer Experience (Críticos)",
    description: "Errores críticos de trato y conducta que impactan severamente la experiencia de usuario.",
    kind: "critical",
    weightPct: 0,
    questions: [
      {
        id: "qc_1",
        text: "Insultos o Lenguaje Inapropiado",
        description: "El agente usa lenguaje soez, discriminatorio u ofensivo de forma directa o indirecta hacia el cliente.",
        weight: 0,
        affectation: "critico",
        required: true,
      },
      {
        id: "qc_2",
        text: "Rudeza, Sarcasmo o Burla",
        description: "El agente toma actitud negativa: sarcasmo, tono hostil, gritos, burla, interrupciones constantes o discusión.",
        weight: 0,
        affectation: "critico",
        required: true,
      },
      {
        id: "qc_3",
        text: "Abandono de Interacción / Colgar",
        description: "El agente finaliza la interacción de forma abrupta (cuelga), no brinda solución o deja al cliente en espera prolongada (>3 min).",
        weight: 0,
        affectation: "critico",
        required: true,
      },
    ],
  },
  {
    id: "criticos_cumplimiento",
    title: "Cumplimiento e Integridad (Críticos)",
    description: "Errores críticos normativos, de veracidad o seguridad de la información.",
    kind: "critical",
    weightPct: 0,
    questions: [
      {
        id: "qc_4",
        text: "Información Falsa o Engañosa",
        description: "El agente brinda deliberadamente información engañosa, falsa o compromisos no autorizados.",
        weight: 0,
        affectation: "critico",
        required: true,
      },
      {
        id: "qc_5",
        text: "Omisión Aviso de Privacidad / Vulneración",
        description: "El agente no menciona el aviso de privacidad cuando es obligatorio o compromete datos confidenciales y seguridad del usuario.",
        weight: 0,
        affectation: "critico",
        required: true,
      },
    ],
  },
];
