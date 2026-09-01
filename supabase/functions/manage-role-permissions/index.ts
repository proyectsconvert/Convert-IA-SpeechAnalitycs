import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return json({ error: "Sesión inválida" }, 401);

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
    if (!profile?.is_superadmin) return json({ error: "Solo superadministradores" }, 403);

    const body = await req.json();
    const { action } = body;

    const logChange = async (act: string, target_type: string, target_id: string | null, label: string, details: any = {}) => {
      await supabaseAdmin.from("role_change_history").insert({
        actor_id: user.id, action: act, target_type, target_id, target_label: label, details,
      });
    };

    // ===== Fixed roles =====
    if (action === "sync_role") {
      const { role, permission_ids } = body;
      if (!role || !Array.isArray(permission_ids)) return json({ error: "Datos inválidos" }, 400);
      await supabaseAdmin.from("role_permissions").delete().eq("role", role);
      if (permission_ids.length > 0) {
        const inserts = permission_ids.map((pid: string) => ({ role, permission_id: pid }));
        const { error } = await supabaseAdmin.from("role_permissions").insert(inserts);
        if (error) throw error;
      }
      await logChange("sync_role_permissions", "role", null, role, { count: permission_ids.length });
      return json({ success: true, count: permission_ids.length });
    }

    // Backward-compat
    if (action === "sync") {
      const { role, permission_ids } = body;
      await supabaseAdmin.from("role_permissions").delete().eq("role", role);
      if (permission_ids?.length > 0) {
        const inserts = permission_ids.map((pid: string) => ({ role, permission_id: pid }));
        const { error } = await supabaseAdmin.from("role_permissions").insert(inserts);
        if (error) throw error;
      }
      await logChange("sync_role_permissions", "role", null, role, { count: permission_ids?.length || 0 });
      return json({ success: true });
    }

    // ===== Custom roles =====
    if (action === "create_custom_role") {
      const { name, description, color, parent_role, parent_custom_role_id, permission_ids } = body;
      if (!name?.trim()) return json({ error: "El nombre es obligatorio" }, 400);
      const { data: created, error } = await supabaseAdmin
        .from("custom_roles")
        .insert({ name: name.trim(), description, color, parent_role, parent_custom_role_id, created_by: user.id })
        .select().single();
      if (error) throw error;
      if (Array.isArray(permission_ids) && permission_ids.length > 0) {
        const rows = permission_ids.map((pid: string) => ({ custom_role_id: created.id, permission_id: pid }));
        await supabaseAdmin.from("custom_role_permissions").insert(rows);
      }
      await logChange("create_custom_role", "custom_role", created.id, created.name, { permissions: permission_ids?.length || 0 });
      return json({ success: true, role: created });
    }

    if (action === "update_custom_role") {
      const { id, name, description, color, parent_role, parent_custom_role_id, is_active, permission_ids } = body;
      if (!id) return json({ error: "id requerido" }, 400);
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (color !== undefined) updates.color = color;
      if (parent_role !== undefined) updates.parent_role = parent_role;
      if (parent_custom_role_id !== undefined) updates.parent_custom_role_id = parent_custom_role_id;
      if (is_active !== undefined) updates.is_active = is_active;
      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin.from("custom_roles").update(updates).eq("id", id);
        if (error) throw error;
      }
      if (Array.isArray(permission_ids)) {
        await supabaseAdmin.from("custom_role_permissions").delete().eq("custom_role_id", id);
        if (permission_ids.length > 0) {
          const rows = permission_ids.map((pid: string) => ({ custom_role_id: id, permission_id: pid }));
          const { error } = await supabaseAdmin.from("custom_role_permissions").insert(rows);
          if (error) throw error;
        }
      }
      await logChange("update_custom_role", "custom_role", id, name || id, { changes: updates, permissions: permission_ids?.length });
      return json({ success: true });
    }

    if (action === "delete_custom_role") {
      const { id } = body;
      if (!id) return json({ error: "id requerido" }, 400);
      const { data: existing } = await supabaseAdmin.from("custom_roles").select("name").eq("id", id).maybeSingle();
      // Detach assignments
      await supabaseAdmin.from("user_accounts").update({ custom_role_id: null }).eq("custom_role_id", id);
      const { error } = await supabaseAdmin.from("custom_roles").delete().eq("id", id);
      if (error) throw error;
      await logChange("delete_custom_role", "custom_role", id, existing?.name || id, {});
      return json({ success: true });
    }

    if (action === "duplicate_custom_role") {
      const { source_id, new_name } = body;
      if (!source_id || !new_name?.trim()) return json({ error: "Datos inválidos" }, 400);
      const { data: src } = await supabaseAdmin.from("custom_roles").select("*").eq("id", source_id).maybeSingle();
      if (!src) return json({ error: "Rol origen no existe" }, 404);
      const { data: created, error } = await supabaseAdmin.from("custom_roles").insert({
        name: new_name.trim(),
        description: src.description,
        color: src.color,
        parent_role: src.parent_role,
        parent_custom_role_id: src.parent_custom_role_id,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      const { data: perms } = await supabaseAdmin.from("custom_role_permissions").select("permission_id").eq("custom_role_id", source_id);
      if (perms && perms.length > 0) {
        const rows = perms.map((p: any) => ({ custom_role_id: created.id, permission_id: p.permission_id }));
        await supabaseAdmin.from("custom_role_permissions").insert(rows);
      }
      await logChange("duplicate_custom_role", "custom_role", created.id, created.name, { source: src.name });
      return json({ success: true, role: created });
    }

    return json({ error: "Acción inválida" }, 400);
  } catch (error: any) {
    return json({ error: error.message || "Error interno" }, 500);
  }
});
