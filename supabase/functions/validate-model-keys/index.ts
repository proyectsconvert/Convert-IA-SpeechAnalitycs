// Validate API keys for OpenAI, AssemblyAI and Deepgram
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

type Provider = "openai" | "assemblyai" | "deepgram";

interface ProviderResult {
  provider: Provider;
  configured: boolean;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  message?: string;
  details?: unknown;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ res: T; ms: number }> {
  const t0 = Date.now();
  const res = await fn();
  return { res, ms: Date.now() - t0 };
}

async function testOpenAI(key: string): Promise<ProviderResult> {
  if (!key) return { provider: "openai", configured: false, ok: false, message: "OPENAI_API_KEY no configurada" };
  try {
    const { res, ms } = await timed(() =>
      fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      })
    );
    const text = await res.text();
    let details: unknown = text;
    try { details = JSON.parse(text); } catch { /* ignore */ }
    return {
      provider: "openai",
      configured: true,
      ok: res.ok,
      status: res.status,
      latencyMs: ms,
      message: res.ok ? "Conexión exitosa" : `Error ${res.status}`,
      details: res.ok ? { models: Array.isArray((details as any)?.data) ? (details as any).data.length : undefined } : details,
    };
  } catch (e) {
    return { provider: "openai", configured: true, ok: false, message: (e as Error).message };
  }
}

async function testAssemblyAI(key: string): Promise<ProviderResult> {
  if (!key) return { provider: "assemblyai", configured: false, ok: false, message: "ASSEMBLYAI_API_KEY no configurada" };
  try {
    const { res, ms } = await timed(() =>
      fetch("https://api.assemblyai.com/v2/transcript?limit=1", {
        headers: { authorization: key },
      })
    );
    const text = await res.text();
    let details: unknown = text;
    try { details = JSON.parse(text); } catch { /* ignore */ }
    return {
      provider: "assemblyai",
      configured: true,
      ok: res.ok,
      status: res.status,
      latencyMs: ms,
      message: res.ok ? "Conexión exitosa" : `Error ${res.status}`,
      details,
    };
  } catch (e) {
    return { provider: "assemblyai", configured: true, ok: false, message: (e as Error).message };
  }
}

async function testDeepgram(key: string): Promise<ProviderResult> {
  if (!key) return { provider: "deepgram", configured: false, ok: false, message: "DEEPGRAM_API_KEY no configurada" };
  try {
    const { res, ms } = await timed(() =>
      fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: `Token ${key}` },
      })
    );
    const text = await res.text();
    let details: unknown = text;
    try { details = JSON.parse(text); } catch { /* ignore */ }
    return {
      provider: "deepgram",
      configured: true,
      ok: res.ok,
      status: res.status,
      latencyMs: ms,
      message: res.ok
        ? "Conexión exitosa"
        : res.status === 401
        ? "Credenciales inválidas (401)"
        : `Error ${res.status}`,
      details,
    };
  } catch (e) {
    return { provider: "deepgram", configured: true, ok: false, message: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const requested: Provider[] = Array.isArray(body?.providers) && body.providers.length > 0
      ? body.providers
      : ["openai", "assemblyai", "deepgram"];

    const openaiKey = (Deno.env.get("OPENAI_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
    const assemblyKey = (Deno.env.get("ASSEMBLY") || Deno.env.get("ASSEMBLYAI_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
    const deepgramKey = (Deno.env.get("DEEPGRAM") || Deno.env.get("DEEPGRAM_API_KEY") || "").trim().replace(/^["']|["']$/g, "");

    const tasks: Promise<ProviderResult>[] = [];
    if (requested.includes("openai")) tasks.push(testOpenAI(openaiKey));
    if (requested.includes("assemblyai")) tasks.push(testAssemblyAI(assemblyKey));
    if (requested.includes("deepgram")) tasks.push(testDeepgram(deepgramKey));

    const results = await Promise.all(tasks);

    return new Response(JSON.stringify({
      checked_at: new Date().toISOString(),
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
