import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateToken(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // base64url
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

    // Cliente con el JWT del usuario para validar identidad/RLS
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
      presentation_id,
      account_id,
      expires_at,
      password,
      label,
      allow_pdf_download = true,
    } = body || {};

    if (!presentation_id || !account_id || !expires_at) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresDate = new Date(expires_at);
    if (isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      return new Response(JSON.stringify({ error: "invalid_expiration" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar que el usuario tiene acceso a la cuenta y la presentación existe en ella
    const { data: pres, error: presErr } = await userClient
      .from("presentations")
      .select("id, account_id")
      .eq("id", presentation_id)
      .eq("account_id", account_id)
      .maybeSingle();

    if (presErr || !pres) {
      return new Response(JSON.stringify({ error: "presentation_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hashear password (si viene) usando RPC SECURITY DEFINER
    let passwordHash: string | null = null;
    if (password && typeof password === "string" && password.length > 0) {
      if (password.length < 4) {
        return new Response(JSON.stringify({ error: "password_too_short" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hashed, error: hashErr } = await userClient.rpc("hash_share_password", {
        p_password: password,
      });
      if (hashErr) throw hashErr;
      passwordHash = hashed as string;
    }

    // Generar token único
    const token = generateToken(48);

    // Insert con cliente service-role para evitar problemas de RLS en el insert
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: inserted, error: insErr } = await adminClient
      .from("shared_presentations")
      .insert({
        presentation_id,
        account_id,
        token,
        password_hash: passwordHash,
        expires_at: expiresDate.toISOString(),
        allow_pdf_download: !!allow_pdf_download,
        label: label || null,
        created_by: user.id,
      })
      .select("id, token, expires_at")
      .single();

    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true, share: inserted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-share-link error:", e);
    return new Response(JSON.stringify({ error: "internal_error", detail: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
