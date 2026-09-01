// ============================================================
// Cascade Engine
// Orchestrates multi-provider transcription with failover
// ============================================================

import type {
  TranscriptionResult,
  ProviderConfig,
  TranscribeOptions,
  CascadeAttemptLog,
  TranscriptionProvider,
} from "./types.ts";
import { AssemblyAIProvider } from "./assemblyai.ts";
import { DeepgramProvider } from "./deepgram.ts";
import { OpenAIProvider } from "./openai.ts";

// Provider factory
const PROVIDERS: Record<string, TranscriptionProvider> = {
  assemblyai: new AssemblyAIProvider(),
  deepgram: new DeepgramProvider(),
  openai: new OpenAIProvider(),
};

/**
 * Transcribe audio using a cascade of providers with automatic failover.
 *
 * Providers are tried in priority order (lower priority number = tried first).
 * Only enabled providers are attempted. If a provider fails, the next one is tried.
 * If all providers fail, an error is thrown with a summary of all attempts.
 *
 * @param audioUrl - Signed URL for the audio file (used by AssemblyAI and Deepgram)
 * @param audioBuffer - Raw audio buffer (required by OpenAI for chunked upload)
 * @param providers - Ordered list of provider configurations
 * @param options - File metadata (name, MIME type, size)
 * @returns Normalized TranscriptionResult from the first successful provider
 */
export async function transcribeWithCascade(
  audioUrl: string,
  audioBuffer: ArrayBuffer | null,
  providers: ProviderConfig[],
  options: TranscribeOptions,
): Promise<TranscriptionResult> {
  // Sort by priority (ascending — lower number = higher priority)
  const sortedProviders = [...providers]
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  if (sortedProviders.length === 0) {
    throw new Error("No transcription providers are enabled. Please enable at least one provider in the admin panel.");
  }

  const attemptLogs: CascadeAttemptLog[] = [];

  console.log(
    `\n🔄 ═══════════════════════════════════════════════════════════════`,
  );
  console.log(
    `🔄 CASCADA DE TRANSCRIPCIÓN — ${sortedProviders.length} proveedor(es) habilitado(s)`,
  );
  console.log(
    `🔄 Orden: ${sortedProviders.map((p) => `${p.displayName}(p${p.priority})`).join(" → ")}`,
  );
  console.log(
    `🔄 Archivo: ${options.fileName} (${options.fileSizeMB.toFixed(1)}MB, ${options.mimeType})`,
  );
  console.log(
    `🔄 ═══════════════════════════════════════════════════════════════\n`,
  );

  for (const providerConfig of sortedProviders) {
    const provider = PROVIDERS[providerConfig.provider];

    if (!provider) {
      console.warn(`⚠️ Unknown provider: ${providerConfig.provider}. Skipping.`);
      attemptLogs.push({
        provider: providerConfig.provider,
        model: providerConfig.model,
        success: false,
        durationMs: 0,
        skippedReason: "Unknown provider",
      });
      continue;
    }

    // Check file size limit for OpenAI (25MB max)
    if (providerConfig.provider === "openai" && options.fileSizeMB > 25) {
      console.log(
        `⏭️ Skipping OpenAI: file size ${options.fileSizeMB.toFixed(1)}MB exceeds 25MB limit`,
      );
      attemptLogs.push({
        provider: "openai",
        model: providerConfig.model,
        success: false,
        durationMs: 0,
        skippedReason: `File too large (${options.fileSizeMB.toFixed(1)}MB > 25MB)`,
      });
      continue;
    }

    // Check that API key is available
    if (!providerConfig.apiKey) {
      console.log(`⏭️ Skipping ${providerConfig.provider}: No API key configured`);
      attemptLogs.push({
        provider: providerConfig.provider,
        model: providerConfig.model,
        success: false,
        durationMs: 0,
        skippedReason: "No API key configured",
      });
      continue;
    }

    const startTime = Date.now();

    try {
      console.log(
        `\n🎙️ ══════════════════════════════════════════════════════`,
      );
      console.log(
        `🎙️ Transcribiendo con ${providerConfig.displayName}...`,
      );
      console.log(
        `🎙️ Modelo: ${providerConfig.model} | Prioridad: ${providerConfig.priority}`,
      );
      console.log(
        `🎙️ ══════════════════════════════════════════════════════`,
      );

      const result = await provider.transcribe(audioUrl, audioBuffer, providerConfig, options);

      const durationMs = Date.now() - startTime;

      // Validate the result
      if (!result.text || result.text.trim().length < 2) {
        throw new Error("Transcription result is empty or too short");
      }

      attemptLogs.push({
        provider: providerConfig.provider,
        model: providerConfig.model,
        success: true,
        durationMs,
      });

      console.log(
        `\n✅ ══════════════════════════════════════════════════════`,
      );
      console.log(
        `✅ Transcripción exitosa con ${providerConfig.displayName}`,
      );
      console.log(
        `✅ Tiempo: ${(durationMs / 1000).toFixed(1)}s | Caracteres: ${result.text.length} | Diarización nativa: ${result.hasDiarization ? "SÍ" : "NO"}`,
      );
      console.log(
        `✅ ══════════════════════════════════════════════════════\n`,
      );

      // Log the full cascade summary
      logCascadeSummary(attemptLogs);

      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error.message || String(error);

      attemptLogs.push({
        provider: providerConfig.provider,
        model: providerConfig.model,
        success: false,
        durationMs,
        error: errorMsg,
      });

      console.error(
        `\n❌ ${providerConfig.displayName} falló después de ${(durationMs / 1000).toFixed(1)}s: ${errorMsg}`,
      );
      console.log(`⏭️ Intentando siguiente proveedor...\n`);
    }
  }

  // All providers failed
  logCascadeSummary(attemptLogs);

  const errorDetails = attemptLogs
    .map((log) => {
      if (log.skippedReason) return `${log.provider}: SKIPPED (${log.skippedReason})`;
      if (log.error) return `${log.provider}: FAILED (${log.error})`;
      return `${log.provider}: FAILED (unknown)`;
    })
    .join("; ");

  throw new Error(`All transcription providers failed. Details: ${errorDetails}`);
}

/**
 * Test the connection for a specific provider.
 */
export async function testProviderConnection(
  providerName: string,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    return { success: false, error: `Unknown provider: ${providerName}` };
  }

  return provider.testConnection(apiKey);
}

function logCascadeSummary(logs: CascadeAttemptLog[]): void {
  console.log("📋 Cascade Summary:");
  for (const log of logs) {
    const status = log.success
      ? "✅ SUCCESS"
      : log.skippedReason
        ? `⏭️ SKIPPED: ${log.skippedReason}`
        : `❌ FAILED: ${log.error}`;
    const time = log.durationMs > 0 ? ` (${(log.durationMs / 1000).toFixed(1)}s)` : "";
    console.log(`  ${log.provider} [${log.model}]: ${status}${time}`);
  }
}
