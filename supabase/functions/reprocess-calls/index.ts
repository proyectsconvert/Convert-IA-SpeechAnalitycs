import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { audio_file_ids, account_id, prompt_id } = await req.json();
    if (!audio_file_ids || !account_id) throw new Error("Missing audio_file_ids or account_id");

    const ids = Array.isArray(audio_file_ids) ? audio_file_ids : [audio_file_ids];
    console.log(`Reprocessing ${ids.length} files for account ${account_id}`);

    const results = { total: ids.length, success: 0, failed: 0, details: [] as any[] };

    // Process in batches of 5 in parallel
    const batchSize = 5;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (audioFileId: string) => {
          try {
            // Reset status
            await supabaseAdmin.from("audio_files").update({
              status: "reprocessing",
            }).eq("id", audioFileId);

            // Delete old analysis and transcription
            await supabaseAdmin.from("analyses").delete().eq("audio_file_id", audioFileId);
            
            const { data: oldTranscriptions } = await supabaseAdmin
              .from("transcriptions").select("id").eq("audio_file_id", audioFileId);
            if (oldTranscriptions) {
              for (const t of oldTranscriptions) {
                await supabaseAdmin.from("transcription_segments").delete().eq("transcription_id", t.id);
              }
              await supabaseAdmin.from("transcriptions").delete().eq("audio_file_id", audioFileId);
            }

            // Call process-call
            const processUrl = `${supabaseUrl}/functions/v1/process-call`;
            const res = await fetch(processUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
                apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
              },
               body: JSON.stringify({ audio_file_id: audioFileId, account_id, prompt_id }),
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Process failed: ${res.status} ${errText}`);
            }

            return { success: true, audioFileId };
          } catch (e: any) {
            console.error(`Failed to reprocess ${audioFileId}:`, e.message);
            await supabaseAdmin.from("audio_files").update({ status: "error" }).eq("id", audioFileId);
            return { success: false, audioFileId, error: e.message };
          }
        })
      );

      batchResults.forEach(r => {
        if (r.status === "fulfilled" && r.value.success) {
          results.success++;
        } else {
          results.failed++;
        }
      });

      // Pause between batches
      if (i + batchSize < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id, account_id,
      module: "audio_processing",
      action: "reprocess_calls",
      detail: `Reprocesadas: ${results.success}/${results.total} exitosas`,
      result: results.failed === 0 ? "success" : "partial",
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("reprocess-calls error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
