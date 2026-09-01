import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Check for valid auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Extract token and verify user session
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Verify user is a superadmin in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_superadmin) {
      console.error("Superadmin verification failed:", profileError?.message);
      return new Response(JSON.stringify({ error: "Forbidden: Superadmin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { account_id } = await req.json();
    if (!account_id) throw new Error("Missing account_id");

    console.log(`Borrando cuenta ${account_id} por petición de ${user.email}`);

    // 4. Manual cascading clean-up
    // Borrar segmentos de transcripción vinculados a audios de esta cuenta
    const { data: audioFiles } = await supabaseAdmin.from("audio_files").select("id").eq("account_id", account_id);
    if (audioFiles && audioFiles.length > 0) {
      const audioIds = audioFiles.map((af: any) => af.id);
      await supabaseAdmin.from("transcription_segments").delete().in("audio_file_id", audioIds);
      await supabaseAdmin.from("call_extractions").delete().in("audio_file_id", audioIds);
      await supabaseAdmin.from("call_chat_messages").delete().in("audio_file_id", audioIds);
      await supabaseAdmin.from("processing_jobs").delete().in("audio_file_id", audioIds);
      await supabaseAdmin.from("analyses").delete().in("audio_file_id", audioIds);
    }

    // Tablas con account_id directo
    const tablesToDelete = [
      "transcriptions", "audio_files", "prompts", "extraction_rules",
      "presentations", "chat_messages", "audit_logs", "billing_records",
      "usage_tracking", "notifications", "user_permission_overrides",
      "user_accounts", "account_limits"
    ];

    for (const table of tablesToDelete) {
      const { error } = await supabaseAdmin.from(table).delete().eq("account_id", account_id);
      if (error) console.error(`Error deleting from ${table}:`, error.message);
    }

    // Finalmente borrar el registro de cuenta y el bucket
    const { error: finalError } = await supabaseAdmin.from("accounts").delete().eq("id", account_id);
    if (finalError) console.error("Error deleting main account record:", finalError.message);

    // Intentar borrar bucket si existe
    try {
      await supabaseAdmin.storage.deleteBucket(`account-${account_id}`);
    } catch (e) {
      console.log("Bucket not found or already deleted");
    }

    return new Response(
      JSON.stringify({ message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("delete-account error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
