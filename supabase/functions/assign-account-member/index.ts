import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  action: "list" | "assign" | "bulk_assign_all";
  account_id?: string;
  user_id?: string;
  role?: string;
};

// deno-lint-ignore no-explicit-any
async function canAssignMembers(
  admin: any,
  callerId: string,
  accountId: string,
): Promise<boolean> {
  const { data: prof } = await admin.from("profiles").select("is_superadmin").eq("id", callerId).single();
  if (prof?.is_superadmin) return true;

  const { data: ua } = await admin
    .from("user_accounts")
    .select("role")
    .eq("user_id", callerId)
    .eq("account_id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (!ua) return false;

  const { data: perm } = await admin
    .from("permissions")
    .select("id")
    .eq("module", "usuarios")
    .eq("action", "asignar_cuentas")
    .maybeSingle();
  if (!perm?.id) return false;

  const { data: rp } = await admin
    .from("role_permissions")
    .select("id")
    .eq("role", ua.role)
    .eq("permission_id", perm.id)
    .maybeSingle();
  return !!rp;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const accountId = body.account_id;
    if (!accountId) {
      return new Response(JSON.stringify({ error: "account_id es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = await canAssignMembers(admin, caller.id, accountId);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "No tienes permiso para asignar usuarios a esta cuenta" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "list") {
      const { data: members, error: e1 } = await admin
        .from("user_accounts")
        .select("user_id")
        .eq("account_id", accountId);
      if (e1) throw e1;
      const memberSet = new Set((members ?? []).map((m) => m.user_id));

      const { data: profiles, error: e2 } = await admin
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (e2) throw e2;

      const available = (profiles ?? []).filter((p) => !memberSet.has(p.id));
      return new Response(JSON.stringify({ profiles: available }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const membershipRole = (body.role || "analyst") as string;
    const validRoles = ["admin", "supervisor", "analyst", "observer"];
    if (!validRoles.includes(membershipRole)) {
      return new Response(JSON.stringify({ error: "Rol inválido para membresía de cuenta" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "assign") {
      const uid = body.user_id;
      if (!uid) {
        return new Response(JSON.stringify({ error: "user_id es requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: exists } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
      if (!exists) {
        return new Response(JSON.stringify({ error: "Usuario no encontrado en perfiles" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await admin.from("user_accounts").upsert(
        {
          user_id: uid,
          account_id: accountId,
          role: membershipRole,
          is_active: true,
        },
        { onConflict: "user_id,account_id" },
      );
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "bulk_assign_all") {
      const { data: members, error: e1 } = await admin
        .from("user_accounts")
        .select("user_id")
        .eq("account_id", accountId);
      if (e1) throw e1;
      const memberSet = new Set((members ?? []).map((m) => m.user_id));

      const { data: profiles, error: e2 } = await admin.from("profiles").select("id");
      if (e2) throw e2;

      const toAdd = (profiles ?? []).filter((p) => !memberSet.has(p.id));
      if (toAdd.length === 0) {
        return new Response(JSON.stringify({ success: true, added: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = toAdd.map((p) => ({
        user_id: p.id,
        account_id: accountId,
        role: membershipRole,
        is_active: true,
      }));

      const { error } = await admin.from("user_accounts").upsert(rows, { onConflict: "user_id,account_id" });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, added: toAdd.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error && typeof (error as { message: string }).message === "string"
        ? (error as { message: string }).message
        : "Error interno";
    console.error("assign-account-member:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
