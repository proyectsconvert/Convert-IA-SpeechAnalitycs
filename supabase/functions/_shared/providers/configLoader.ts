// ============================================================
// Configuration Loader
// Loads provider configuration from Supabase database
// Falls back to OpenAI with env var if no config exists
// ============================================================

import type { ProviderConfig } from "./types.ts";

/**
 * Load transcription provider configuration for an account from the database.
 *
 * If no configuration is found (e.g. table doesn't exist yet or no rows),
 * falls back to a single OpenAI provider using the OPENAI_API_KEY env var.
 *
 * @param supabase - Supabase client with service role access
 * @param accountId - The account ID to load configuration for
 * @returns Sorted array of ProviderConfig (by priority ascending)
 */
export async function loadProviderConfig(
  supabase: any,
): Promise<ProviderConfig[]> {
  try {
    const { data, error } = await supabase
      .from("transcription_providers")
      .select("*")
      .order("priority", { ascending: true });

    if (error) {
      console.warn("⚠️ Could not load provider config from DB:", error.message);
      return getDefaultConfig();
    }

    if (!data || data.length === 0) {
      console.log("ℹ️ No global provider config found, using defaults");
      return getDefaultConfig();
    }

    // Map of provider name → env var name for API keys
    const ENV_KEY_MAP: Record<string, string> = {
      assemblyai: "ASSEMBLY",
      deepgram: "DEEPGRAM",
      openai: "OPENAI_API_KEY",
    };

    const configs: ProviderConfig[] = [];

    for (const row of data) {
      // Always load API key from environment variable (Supabase Secrets)
      const envVarName = ENV_KEY_MAP[row.provider] || "";
      const apiKey = envVarName ? (Deno.env.get(envVarName) || Deno.env.get(`${row.provider.toUpperCase()}_API_KEY`) || "").trim().replace(/^["']|["']$/g, "") : "";

      if (apiKey) {
        console.log(`  🔑 ${row.provider}: API key cargada desde env ${envVarName} (${apiKey.substring(0, 8)}...)`);
      } else {
        console.log(`  ⚠️ ${row.provider}: No se encontró API key en env ${envVarName}`);
      }

      configs.push({
        provider: row.provider,
        displayName: row.display_name,
        apiKey,
        model: row.model,
        enabled: row.enabled,
        priority: row.priority,
        config: row.config || {},
      });
    }

    const enabledCount = configs.filter((c) => c.enabled).length;
    console.log(
      `📋 Loaded ${configs.length} global provider configs (${enabledCount} enabled)`,
    );

    return configs;
  } catch (e: any) {
    console.error("❌ Error loading provider config:", e.message);
    return getDefaultConfig();
  }
}

/**
 * Default configuration: OpenAI only, using env var.
 * This ensures backward compatibility when no DB config exists.
 */
function getDefaultConfig(): ProviderConfig[] {
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

  return [
    {
      provider: "openai",
      displayName: "OpenAI",
      apiKey: openaiKey,
      model: "gpt-4o-mini-transcribe-2025-12-15",
      enabled: true,
      priority: 1,
      config: { use_env_key: true, language: "es" },
    },
  ];
}
