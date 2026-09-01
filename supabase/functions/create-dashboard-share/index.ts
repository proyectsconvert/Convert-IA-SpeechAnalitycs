import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      account_id,
      expires_at,
      password,
      label,
      config = {},
    } = body || {};

    if (!account_id || !expires_at) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Usamos el cliente del usuario para llamar a la RPC, así respetamos sus permisos
    // La RPC create_shared_dashboard se encarga de validar el acceso, generar el token y hashear el password
    const { data: newId, error: rpcErr } = await userClient.rpc("create_shared_dashboard", {
      p_account_id: account_id,
      p_label: label || null,
      p_password: (password && password.length > 0) ? password : null,
      p_expires_at: expires_at,
      p_config: config
    });

    if (rpcErr) throw rpcErr;

    // Recuperamos el token generado por la base de datos (usando admin para leerlo)
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: shareData, error: fetchErr } = await adminClient
      .from("shared_dashboards")
      .select("id, token, expires_at")
      .eq("id", newId)
      .single();

    if (fetchErr) throw fetchErr;

    return new Response(JSON.stringify({ success: true, share: shareData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-dashboard-share error:", e);
    return new Response(JSON.stringify({ error: "internal_error", detail: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
