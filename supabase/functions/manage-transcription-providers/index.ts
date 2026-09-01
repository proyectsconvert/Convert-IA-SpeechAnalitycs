// ============================================================
// Edge Function: manage-transcription-providers
// CRUD operations for transcription provider configuration
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { testProviderConnection } from "../_shared/providers/cascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1]; // "test" for test endpoint

    // =========== GET: List global providers ===========
    if (req.method === "GET") {


      // All authenticated users can view global settings


      const { data: providers, error } = await supabase
        .from("transcription_providers")
        .select("id, provider, display_name, enabled, priority, api_key_hint, model, available_models, config, last_test_at, last_test_status, created_at, updated_at")
        .order("priority", { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ providers: providers || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========== POST: Test connection or create provider ===========
    if (req.method === "POST") {
      const body = await req.json();

      // Test connection endpoint
      if (action === "test" || body.action === "test") {
        const { provider, api_key } = body;

        if (!provider) {
          return new Response(JSON.stringify({ error: "Missing provider" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let keyToTest = api_key;

        // If no key provided, try to decrypt existing key from DB
        if (!keyToTest) {
          const { data: existing } = await supabase
            .from("transcription_providers")
            .select("api_key_encrypted, config")
            .eq("provider", provider)
            .single();

          if (existing?.config?.use_env_key) {
            keyToTest = Deno.env.get("OPENAI_API_KEY") || "";
          } else if (existing?.api_key_encrypted) {
            const { data: decrypted } = await supabase.rpc("decrypt_api_key", {
              encrypted_key: existing.api_key_encrypted,
            });
            keyToTest = decrypted || "";
          }
        }

        if (!keyToTest) {
          return new Response(
            JSON.stringify({ success: false, error: "No API key available to test" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const testResult = await testProviderConnection(provider, keyToTest);

        // Update test status in DB
        await supabase
          .from("transcription_providers")
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: testResult.success ? "success" : `error: ${testResult.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq("provider", provider);

        return new Response(JSON.stringify(testResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid POST action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========== PUT: Update providers configuration ===========
    if (req.method === "PUT") {
      const body = await req.json();
      const { providers } = body;

      if (!providers || !Array.isArray(providers)) {
        return new Response(JSON.stringify({ error: "Missing providers array" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only superadmins can manage global providers
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_superadmin) {
        return new Response(JSON.stringify({ error: "Superadmin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update each provider
      for (const prov of providers) {
        const updateData: Record<string, unknown> = {
          enabled: prov.enabled,
          priority: prov.priority,
          model: prov.model,
          updated_at: new Date().toISOString(),
        };

        // Handle API key update
        if (prov.api_key && prov.api_key.trim() !== "" && !prov.api_key.startsWith("••••")) {
          // Encrypt the new API key
          const { data: encrypted } = await supabase.rpc("encrypt_api_key", {
            plain_key: prov.api_key,
          });

          if (encrypted) {
            updateData.api_key_encrypted = encrypted;
            // Store hint (last 4 chars)
            updateData.api_key_hint = prov.api_key.slice(-4);
          }
        }

        // Update config (merge, don't replace)
        if (prov.config) {
          // Get existing config
          const { data: existing } = await supabase
            .from("transcription_providers")
            .select("config")
            .eq("provider", prov.provider)
            .single();

          updateData.config = { ...(existing?.config || {}), ...prov.config };
        }

        const { error: updateErr } = await supabase
          .from("transcription_providers")
          .update(updateData)
          .eq("provider", prov.provider);

        if (updateErr) {
          console.error(`Error updating ${prov.provider}:`, updateErr);
        }
      }

      // Audit log
      try {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          module: "configuracion",
          action: "update_global_transcription_providers",
          detail: `Updated global transcription provider configuration: ${providers.map((p: any) => `${p.provider}(p${p.priority},${p.enabled ? "ON" : "OFF"})`).join(", ")}`,
          result: "success",
        });
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("manage-transcription-providers error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
