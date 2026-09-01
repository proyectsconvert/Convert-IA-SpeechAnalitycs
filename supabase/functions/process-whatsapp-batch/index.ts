import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./utils/cors.ts";

/**
 * Ancla el bundle de despliegue: Supabase empaqueta desde este entrypoint.
 * Sin importar la cadena `services/whatsappService` → `utils/openai`, esos
 * archivos no se incluyen y el deploy puede fallar o quedar incompleto.
 */
import "./services/whatsappService.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_BLOCKS_PER_INVOCATION = 1;
const FINAL_STATUSES = new Set([
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size),
  );
}

async function processOneConversation(
  convId: string,
  accountId: string,
  promptId: string,
  maxRetries: number,
  batchId?: string,
): Promise<{ success: boolean; conversation_id: string; error?: string }> {
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/process-whatsapp`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
            "x-remote-import-internal": supabaseServiceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversation_id: convId,
            account_id: accountId,
            prompt_id: promptId,
            batch_id: batchId,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        return { success: true, conversation_id: convId };
      }

      const status = response.status;
      const errText = await response.text().catch(() => "unknown");
      lastError = `HTTP ${status}: ${errText.substring(0, 200)}`;

      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 2000); // 0-2s jitter
        const baseWait = status === 429 ? 5000 : 3000;
        const waitMs = Math.min(baseWait * Math.pow(2, attempt), 20_000) +
          jitter;

        console.warn(
          `Conv ${convId} attempt ${
            attempt + 1
          } failed (${status}), retry in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      return { success: false, conversation_id: convId, error: lastError };
    } catch (e: any) {
      lastError = e.message || String(e);

      if (attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 2000);
        const waitMs = Math.min(3000 * Math.pow(2, attempt), 15_000) + jitter;
        console.warn(
          `Conv ${convId} attempt ${
            attempt + 1
          } error: ${lastError}, retry in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }
    }
  }

  return { success: false, conversation_id: convId, error: lastError };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth check ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = token === supabaseServiceKey ||
    req.headers.get("x-remote-import-internal") === supabaseServiceKey;
  if (!isServiceRole) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const {
      conversation_ids,
      account_id,
      prompt_id,
      config = {},
      batch_id,
      offset = 0,
    } = await req.json();

    if (!conversation_ids?.length || !account_id || !prompt_id) {
      return new Response(
        JSON.stringify({
          error: "Missing conversation_ids, account_id, or prompt_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const BLOCK_SIZE = Math.min(
      Math.max(Number(config.blockSize) || 10, 1),
      10,
    );
    const DELAY_MS = Math.max(Number(config.delayBetweenBlocks) || 750, 250);
    const MAX_RETRIES = Math.min(
      Math.max(Number(config.maxRetries) || 1, 0),
      2,
    );
    const safeOffset = Math.max(Number(offset) || 0, 0);

    let batch: any;
    if (batch_id) {
      const { data: existingBatch, error: batchLoadError } = await supabase
        .from("whatsapp_analysis_batches")
        .select("*")
        .eq("id", batch_id)
        .single();

      if (batchLoadError || !existingBatch) {
        throw new Error(
          `Failed to load batch: ${batchLoadError?.message || "unknown"}`,
        );
      }
      batch = existingBatch;
    } else {
      const { data: newBatch, error: batchError } = await supabase
        .from("whatsapp_analysis_batches")
        .insert({
          account_id,
          prompt_id,
          total_conversations: conversation_ids.length,
          status: "processing",
          completed: 0,
          failed: 0,
          processed_conversations: 0,
          failed_conversations: 0,
          block_size: BLOCK_SIZE,
          concurrent_limit: BLOCK_SIZE,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (batchError || !newBatch) {
        throw new Error(
          `Failed to create batch: ${batchError?.message || "unknown"}`,
        );
      }
      batch = newBatch;
    }

    const processBlocks = async () => {
      if (FINAL_STATUSES.has(batch.status)) return;

      const blocks = chunkArray(conversation_ids.slice(safeOffset), BLOCK_SIZE)
        .slice(0, MAX_BLOCKS_PER_INVOCATION);
      let completedDelta = 0;
      let failedDelta = 0;
      let nextOffset = safeOffset;

      for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
        const absoluteBlock = Math.floor(nextOffset / BLOCK_SIZE) + 1;
        const totalBlocks = Math.ceil(conversation_ids.length / BLOCK_SIZE);
        const block = blocks[blockIdx];

        console.log(
          `Batch ${batch.id} | Block ${absoluteBlock}/${totalBlocks} | ${block.length} conversations`,
        );

        const results = await Promise.allSettled(
          (block as string[]).map((convId) =>
            processOneConversation(
              convId,
              account_id,
              prompt_id,
              MAX_RETRIES,
              batch.id,
            )
          ),
        );

        for (const r of results) {
          if (r.status === "fulfilled" && r.value.success) {
            completedDelta++;
          } else {
            failedDelta++;
            const errMsg = r.status === "fulfilled"
              ? r.value.error
              : (r as PromiseRejectedResult).reason?.message;
            const failedId = r.status === "fulfilled"
              ? r.value.conversation_id
              : "unknown";
            console.error(`Conv ${failedId} failed: ${errMsg}`);
          }
        }

        nextOffset += block.length;
        if (blockIdx < blocks.length - 1) await sleep(DELAY_MS);
      }

      const { data: currentBatch } = await supabase
        .from("whatsapp_analysis_batches")
        .select("*")
        .eq("id", batch.id)
        .single();

      const completedCount = Number(currentBatch?.completed || 0) +
        completedDelta;
      const failedCount = Number(currentBatch?.failed || 0) + failedDelta;
      const isFinished = nextOffset >= conversation_ids.length;
      const finalStatus = failedCount === 0
        ? "completed"
        : completedCount === 0
        ? "failed"
        : "completed_with_errors";

      const updatePayload: Record<string, unknown> = {
        completed: completedCount,
        failed: failedCount,
        processed_conversations: completedCount,
        failed_conversations: failedCount,
        status: isFinished ? finalStatus : "processing",
        completed_at: isFinished ? new Date().toISOString() : null,
      };

      const { error: updateErr } = await supabase
        .from("whatsapp_analysis_batches")
        .update(updatePayload)
        .eq("id", batch.id);
      if (updateErr) console.error("Progress update error:", updateErr.message);

      if (!isFinished) {
        console.log(
          `Batch ${batch.id} continuing at offset ${nextOffset}/${conversation_ids.length}`,
        );
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/process-whatsapp-batch`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseAnonKey}`,
                apikey: supabaseAnonKey,
                "x-remote-import-internal": supabaseServiceKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                conversation_ids,
                account_id,
                prompt_id,
                batch_id: batch.id,
                offset: nextOffset,
                config: {
                  blockSize: BLOCK_SIZE,
                  delayBetweenBlocks: DELAY_MS,
                  maxRetries: MAX_RETRIES,
                },
              }),
              signal: controller.signal,
            },
          );
          const responseText = await response.text().catch(() => "");
          if (!response.ok) {
            console.error(
              `Batch ${batch.id} continuation failed: HTTP ${response.status} ${responseText.substring(0, 200)}`,
            );
          }
        } catch (e: any) {
          console.error(
            `Batch ${batch.id} continuation error:`,
            e.message || e,
          );
        } finally {
          clearTimeout(timeout);
        }
      } else {
        console.log(
          `Batch ${batch.id} finished | Status: ${finalStatus} | OK: ${completedCount} | Fail: ${failedCount}`,
        );
      }
    };

    // @ts-ignore: EdgeRuntime available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined") {
      // @ts-ignore
      EdgeRuntime.waitUntil(processBlocks());
    } else {
      processBlocks().catch((err) =>
        console.error("Batch loop fatal error:", err)
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batch.id,
        total: conversation_ids.length,
        block_size: BLOCK_SIZE,
        offset: safeOffset,
        estimated_time_seconds: Math.ceil(
          (conversation_ids.length / BLOCK_SIZE) * 15,
        ),
        message: batch_id
          ? "Batch processing continued"
          : "Batch processing started in background",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error starting batch process:", error.message || error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
