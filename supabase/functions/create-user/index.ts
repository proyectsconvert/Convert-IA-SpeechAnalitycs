import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check: caller must be a superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("is_superadmin").eq("id", caller.id).single();
    if (!callerProfile?.is_superadmin) {
      return new Response(JSON.stringify({ error: "Solo superadministradores pueden crear usuarios" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, fullName, role, accountIds } = await req.json();

    if (!email || !password || !fullName) {
      return new Response(JSON.stringify({ error: "email, password y fullName son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const membershipRole = (role || "observer") as string;
    const isSuperadminProfile = membershipRole === "superadmin";

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      const msg = authError.message || "Error al crear el usuario en Auth";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user!.id;

    try {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          full_name: fullName,
          is_superadmin: isSuperadminProfile,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      if (isSuperadminProfile) {
        const { data: allAccts, error: acctErr } = await supabaseAdmin.from("accounts").select("id");
        if (acctErr) throw acctErr;
        const rows = (allAccts ?? []).map((a: { id: string }) => ({
          user_id: userId,
          account_id: a.id,
          role: "superadmin" as const,
          is_active: true,
        }));
        if (rows.length > 0) {
          const { error: uaError } = await supabaseAdmin.from("user_accounts").upsert(rows, {
            onConflict: "user_id,account_id",
          });
          if (uaError) throw uaError;
        }
      } else if (accountIds && accountIds.length > 0) {
        const assignments = accountIds.map((accountId: string) => ({
          user_id: userId,
          account_id: accountId,
          role: membershipRole,
          is_active: true,
        }));
        const { error: uaError } = await supabaseAdmin.from("user_accounts").insert(assignments);
        if (uaError) throw uaError;
      }
    } catch (dbErr: unknown) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw dbErr;
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    const message =
      error && typeof error === "object" && "message" in error && typeof (error as { message: string }).message === "string"
        ? (error as { message: string }).message
        : "Error al crear el usuario";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
