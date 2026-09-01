import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, password, startDate, endDate } = await req.json().catch(() => ({}));

    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: configResp, error: configErr } = await adminClient.rpc("get_shared_dashboard_config", {
      p_token: token,
      p_password: password || null,
      p_ip: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"),
      p_user_agent: req.headers.get("user-agent")?.slice(0, 200)
    });

    if (configErr || !configResp || configResp.error) {
      const isAuthError = configResp?.error === "password_required" || configResp?.error === "password_incorrect";
      return new Response(JSON.stringify({ error: configResp?.error || "unauthorized" }), {
        status: isAuthError ? 200 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = configResp.account_id;

    // --- Data Queries with Optimization ---
    let audioQuery = adminClient
      .from("audio_files")
      .select("id, file_name, created_at, duration_seconds, metadata, status, analyses(overall_sentiment, sentiment_score, results, tags, summary), transcriptions(full_text)")
      .eq("account_id", accountId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(2000);

    let waConvQuery = adminClient
      .from("whatsapp_conversations")
      .select("id, contact_name, ticket, phone_number, external_id, start_date, created_at, duracion_conversacion, total_messages, first_agent_name, campaign, score_general, initial_msg_text, status")
      .eq("account_id", accountId)
      .eq("status", "analizado")
      .order("created_at", { ascending: false })
      .limit(2000);

    let waResultsQuery = adminClient
      .from("whatsapp_analysis_results")
      .select("id, conversation_id, results, score_general, analyzed_at, created_at, analysis_status")
      .eq("account_id", accountId)
      .eq("analysis_status", "completed")
      .order("created_at", { ascending: false })
      .limit(2000);

    // Apply date filters if provided
    if (startDate) {
      audioQuery = audioQuery.gte("created_at", startDate);
      waConvQuery = waConvQuery.gte("created_at", startDate);
      waResultsQuery = waResultsQuery.gte("created_at", startDate);
    }
    if (endDate) {
      audioQuery = audioQuery.lte("created_at", endDate);
      waConvQuery = waConvQuery.lte("created_at", endDate);
      waResultsQuery = waResultsQuery.lte("created_at", endDate);
    }

    const [
      { data: extractionRules },
      { data: audioFiles },
      { data: waConversations },
      { data: waResults }
    ] = await Promise.all([
      adminClient.from("extraction_rules").select("*").eq("account_id", accountId),
      audioQuery,
      waConvQuery,
      waResultsQuery
    ]);

    return new Response(JSON.stringify({
      success: true,
      config: configResp,
      data: {
        extractionRules: extractionRules || [],
        audioFiles: audioFiles || [],
        waConversations: waConversations || [],
        waResults: waResults || []
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("get-shared-dashboard-data error:", e);
    return new Response(JSON.stringify({ error: "internal_error", detail: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
