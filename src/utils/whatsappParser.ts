import * as XLSX from "xlsx";

export interface WhatsappConversation {
  external_id: string;
  campaign: string;
  start_date?: Date;
  end_date?: Date;
  account_name: string;
  initiate_type: string;
  contact_name: string;
  phone_number: string;
  batch_id?: string;
  batch_messages?: string;
  initial_msg_id?: string;
  initial_msg_type?: string;
  initial_msg_text?: string;
  ticket?: string;
  vcc?: string;
  messages: WhatsappMessage[];
}

export interface WhatsappMessage {
  sender_type: string;
  agent_name: string;
  timestamp: Date;
  message_type: string;
  content: string;
  external_message_id: string;
  is_transfer: boolean;
  original_date: string;
}

/** Escapa un campo para una línea CSV (misma línea que usa `parseWhatsappCsv`). */
function escapeCsvField(field: string): string {
  const f = field ?? "";
  if (/[",\n\r]/.test(f)) return `"${f.replace(/"/g, '""')}"`;
  return f;
}

/**
 * Excel / hojas de cálculo al copiar pegan TSV (tabuladores). Unifica a texto CSV
 * para reutilizar `parseWhatsappCsv`. Si ya parece CSV con comas, se devuelve tal cual (sin BOM).
 */
export function normalizeWhatsappImportText(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";

  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const looksTabular = tabCount > 0 && tabCount >= Math.max(1, commaCount);

  if (looksTabular) {
    return lines
      .map((line) => line.split("\t").map((cell) => escapeCsvField(cell.trim())).join(","))
      .join("\n");
  }

  return text;
}

export const parseWhatsappCsv = (csvText: string): WhatsappConversation[] => {
  const lines = csvText.split(/\r?\n/);
  const conversations: WhatsappConversation[] = [];
  let currentConversation: WhatsappConversation | null = null;

  // Simple CSV parser that handles quotes
  const splitLine = (line: string): string[] => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim());
    return result;
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'N/A') return undefined;
    // Format in sample: 2026-03-26 20:26:01
    try {
        return new Date(dateStr.replace(/-/g, '/'));
    } catch (e) {
        return undefined;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = splitLine(line);

    if (fields[0] === 'Header') {
      // It's a header line. Check if it's the actual header title or data.
      if (fields[1] === 'Campaña') continue; // Skip CSV headers

      currentConversation = {
        campaign: fields[1],
        start_date: parseDate(fields[2]),
        end_date: parseDate(fields[3]),
        account_name: fields[4],
        initiate_type: fields[6],
        contact_name: fields[7],
        phone_number: fields[11], // Corrected index for phone
        batch_id: fields[12],
        batch_messages: fields[13],
        initial_msg_id: fields[14],
        initial_msg_type: fields[15],
        initial_msg_text: fields[16],
        ticket: fields[17],
        vcc: fields[18],
        external_id: fields[19],
        messages: []
      };

      // Inject the initial message ("Msj. Inic.") as the first chat message
      const initText = fields[16]?.trim();
      if (initText && initText !== 'N/A') {
        currentConversation.messages.push({
          sender_type: 'Contacto',
          agent_name: '',
          timestamp: parseDate(fields[2]) || new Date(),
          message_type: fields[15] || 'Texto',
          content: initText,
          external_message_id: fields[14] || '',
          is_transfer: false,
          original_date: ''
        });
      }

      conversations.push(currentConversation);
    } else if (fields[1] === 'Thread') {
      if (fields[2] === 'Origen') continue; // Skip CSV headers

      if (currentConversation) {
        currentConversation.messages.push({
          sender_type: fields[2],
          agent_name: fields[3],
          timestamp: parseDate(fields[5]) || new Date(),
          message_type: fields[6],
          content: fields[7],
          external_message_id: fields[10],
          is_transfer: fields[11]?.toLowerCase() === 'si',
          original_date: (!fields[12] || fields[12] === 'N/A') ? '' : fields[12]
        });
      }
    }
  }

  return conversations;
};

/** CSV, TSV pegado desde Excel, u otro texto compatible con el parser de export WA. */
export function parseWhatsappImportText(raw: string): WhatsappConversation[] {
  return parseWhatsappCsv(normalizeWhatsappImportText(raw));
}

/** Primera hoja de un libro Excel (.xlsx / .xls) → mismo flujo que CSV. */
export function parseWhatsappExcelBuffer(buffer: ArrayBuffer): WhatsappConversation[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", blankrows: false });
  return parseWhatsappImportText(csv);
}
