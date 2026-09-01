import React, { createContext, useContext, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface WhatsappUploadContextType {
  isUploading: boolean;
  uploadProgress: number;
  uploadStatus: string;
  startUpload: (data: any[], accountId: string, options: { updateExisting: boolean }) => Promise<void>;
  cancelUpload: () => void;
}

const WhatsappUploadContext = createContext<WhatsappUploadContextType | undefined>(undefined);

/* ──────────────────────────────────────────────────────────────
   Batch-insert helpers
   ────────────────────────────────────────────────────────────── */

/** Paginated fetch of ALL rows matching account_id, returning only `columns`. */
async function fetchAllPaged<T extends Record<string, unknown>>(
  table: string,
  accountId: string,
  columns: string,
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select(columns)
      .eq("account_id", accountId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Insert rows in batches, calling `onBatch` after each chunk. */
async function batchInsert(
  table: string,
  rows: Record<string, unknown>[],
  batchSize: number,
  onBatch?: (inserted: number, total: number) => void,
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await (supabase as any).from(table).insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
    onBatch?.(inserted, rows.length);
  }
}

/** Update rows one-at-a-time (only for conversations that need updating — normally a small subset). */
async function batchUpdate(
  table: string,
  updates: { id: string; data: Record<string, unknown> }[],
  onBatch?: (done: number, total: number) => void,
) {
  // Group updates into chunks of 50 for progress reporting
  const CHUNK = 50;
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    // Execute all updates in this chunk in parallel
    await Promise.all(
      chunk.map(({ id, data }) =>
        (supabase as any).from(table).update(data).eq("id", id),
      ),
    );
    done += chunk.length;
    onBatch?.(done, updates.length);
  }
}

/* ──────────────────────────────────────────────────────────────
   Provider
   ────────────────────────────────────────────────────────────── */

export const WhatsappUploadProvider = ({ children }: { children: ReactNode }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const cancelledRef = useRef(false);
  const { toast } = useToast();

  const startUpload = async (data: any[], accountId: string, options: { updateExisting: boolean }) => {
    setIsUploading(true);
    setUploadProgress(0);
    cancelledRef.current = false;
    const total = data.length;
    const t0 = Date.now();

    try {
      /* ── Phase 1: Prefetch existing data for deduplication ────── */
      setUploadStatus("Consultando datos existentes…");

      const [existingConvs, existingMsgIds] = await Promise.all([
        fetchAllPaged<{ id: string; external_id: string; total_messages: number }>(
          "whatsapp_conversations",
          accountId,
          "id, external_id, total_messages",
        ),
        fetchAllPaged<{ external_message_id: string }>(
          "whatsapp_messages",
          accountId,
          "external_message_id",
        ),
      ]);

      // Build lookup maps
      const convMap = new Map<string, { id: string; total_messages: number }>();
      for (const c of existingConvs) {
        convMap.set(c.external_id, { id: c.id, total_messages: c.total_messages || 0 });
      }
      const existingMsgSet = new Set<string>();
      for (const m of existingMsgIds) {
        if (m.external_message_id) existingMsgSet.add(m.external_message_id);
      }

      if (cancelledRef.current) return;
      setUploadProgress(5);

      /* ── Phase 2: Classify conversations ───────────────────────── */
      setUploadStatus("Clasificando conversaciones…");

      const newConvs: any[] = [];
      const updateConvs: { conv: any; existingId: string }[] = [];
      const skipConvs: any[] = [];

      for (const conv of data) {
        const existing = convMap.get(conv.external_id);
        if (!existing) {
          newConvs.push(conv);
        } else if (options.updateExisting) {
          updateConvs.push({ conv, existingId: existing.id });
        } else {
          skipConvs.push(conv);
        }
      }

      setUploadProgress(10);

      /* ── Phase 3: Batch-insert new conversations ───────────────── */
      if (newConvs.length > 0) {
        setUploadStatus(`Insertando ${newConvs.length} conversaciones nuevas…`);

        const CONV_BATCH = 200;
        for (let i = 0; i < newConvs.length; i += CONV_BATCH) {
          if (cancelledRef.current) return;
          const chunk = newConvs.slice(i, i + CONV_BATCH);
          const rows = chunk.map((conv: any) => ({
            account_id: accountId,
            external_id: conv.external_id,
            campaign: conv.campaign,
            start_date: conv.start_date?.toISOString(),
            end_date: conv.end_date?.toISOString(),
            account_name: conv.account_name,
            initiate_type: conv.initiate_type,
            contact_name: conv.contact_name,
            phone_number: conv.phone_number,
            batch_id: conv.batch_id,
            batch_messages: conv.batch_messages,
            initial_msg_id: conv.initial_msg_id,
            initial_msg_type: conv.initial_msg_type,
            initial_msg_text: conv.initial_msg_text,
            ticket: conv.ticket,
            vcc: conv.vcc,
            total_messages: conv.messages.length,
            first_agent_name: conv.messages.find((m: any) => m.sender_type === "Agente")?.agent_name,
          }));

          const { data: inserted, error } = await supabase
            .from("whatsapp_conversations")
            .insert(rows as any)
            .select("id, external_id");
          if (error) throw error;

          // Map new IDs back for message insertion
          for (const row of inserted || []) {
            convMap.set(row.external_id, { id: row.id, total_messages: 0 });
          }

          const pct = 10 + Math.round(((i + chunk.length) / newConvs.length) * 30);
          setUploadProgress(pct);
          setUploadStatus(`Conversaciones: ${Math.min(i + chunk.length, newConvs.length)} de ${newConvs.length}`);
        }
      }

      /* ── Phase 4: Batch-update existing conversations ──────────── */
      if (updateConvs.length > 0) {
        setUploadStatus(`Actualizando ${updateConvs.length} conversaciones existentes…`);

        const updates = updateConvs.map(({ conv, existingId }) => ({
          id: existingId,
          data: {
            campaign: conv.campaign,
            start_date: conv.start_date?.toISOString(),
            end_date: conv.end_date?.toISOString(),
            account_name: conv.account_name,
            contact_name: conv.contact_name,
            phone_number: conv.phone_number,
            batch_id: conv.batch_id,
            batch_messages: conv.batch_messages,
            ticket: conv.ticket,
            vcc: conv.vcc,
            total_messages: conv.messages.length,
            first_agent_name: conv.messages.find((m: any) => m.sender_type === "Agente")?.agent_name,
          },
        }));

        await batchUpdate("whatsapp_conversations", updates, (done, t) => {
          const pct = 40 + Math.round((done / t) * 10);
          setUploadProgress(pct);
          setUploadStatus(`Actualizando: ${done} de ${t}`);
        });
      }

      setUploadProgress(50);

      /* ── Phase 5: Batch-insert new messages ────────────────────── */
      setUploadStatus("Preparando mensajes…");

      const allNewMsgs: Record<string, unknown>[] = [];
      const allConvs = [...newConvs, ...updateConvs.map((u) => u.conv)];

      for (const conv of allConvs) {
        const convId = convMap.get(conv.external_id)?.id;
        if (!convId) continue;

        for (const msg of conv.messages) {
          // Skip messages already in DB
          if (msg.external_message_id && existingMsgSet.has(msg.external_message_id)) {
            continue;
          }
          // Sanitize timestamp – fallback to now if invalid
          let safeTimestamp: string;
          try {
            const d = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
            safeTimestamp = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          } catch {
            safeTimestamp = new Date().toISOString();
          }

          // Sanitize original_date – reject "N/A" and any non-parseable value
          let safeOriginalDate: string | null = null;
          if (msg.original_date) {
            const raw = String(msg.original_date).trim();
            if (raw !== "" && raw.toUpperCase() !== "N/A") {
              const parsed = new Date(raw);
              safeOriginalDate = isNaN(parsed.getTime()) ? null : raw;
            }
          }

          allNewMsgs.push({
            conversation_id: convId,
            account_id: accountId,
            sender_type: msg.sender_type,
            agent_name: msg.agent_name,
            timestamp: safeTimestamp,
            message_type: msg.message_type,
            content: msg.content,
            external_message_id: msg.external_message_id,
            is_transfer: msg.is_transfer,
            original_date: safeOriginalDate,
          });
        }
      }

      if (cancelledRef.current) return;

      if (allNewMsgs.length > 0) {
        setUploadStatus(`Insertando ${allNewMsgs.length} mensajes…`);

        const MSG_BATCH = 500;
        await batchInsert("whatsapp_messages", allNewMsgs, MSG_BATCH, (inserted, msgTotal) => {
          const pct = 50 + Math.round((inserted / msgTotal) * 45);
          setUploadProgress(pct);
          setUploadStatus(`Mensajes: ${inserted.toLocaleString()} de ${msgTotal.toLocaleString()}`);
        });
      }

      /* ── Phase 6: Increment usage counter ──────────────────────── */
      setUploadProgress(98);
      setUploadStatus("Registrando uso…");

      try {
        await supabase.rpc("increment_usage" as any, {
          p_account_id: accountId,
          p_whatsapp_conversations: newConvs.length,
        } as any);
      } catch (err) {
        console.warn("Could not increment WhatsApp usage:", err);
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setUploadProgress(100);

      toast({
        title: "Carga finalizada",
        description: `${newConvs.length} nuevas, ${updateConvs.length} actualizadas, ${allNewMsgs.length.toLocaleString()} mensajes en ${elapsed}s`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error en la carga",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadStatus("");
      setUploadProgress(0);
    }
  };

  const cancelUpload = () => {
    cancelledRef.current = true;
    setIsUploading(false);
    setUploadStatus("Carga cancelada");
  };

  return (
    <WhatsappUploadContext.Provider value={{ isUploading, uploadProgress, uploadStatus, startUpload, cancelUpload }}>
      {children}
    </WhatsappUploadContext.Provider>
  );
};

export const useWhatsappUpload = () => {
  const context = useContext(WhatsappUploadContext);
  if (context === undefined) {
    throw new Error("useWhatsappUpload must be used within a WhatsappUploadProvider");
  }
  return context;
};
