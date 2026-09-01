// ============================================================
// OpenAI Provider Adapter
// Wraps existing Whisper transcription logic (mini models)
// Does NOT provide native diarization — caller must use GPT
// ============================================================

import type {
  TranscriptionProvider,
  TranscriptionResult,
  ProviderConfig,
  TranscribeOptions,
} from "./types.ts";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB per chunk

export class OpenAIProvider implements TranscriptionProvider {
  readonly name = "openai";

  async transcribe(
    _audioUrl: string,
    audioBuffer: ArrayBuffer | null,
    config: ProviderConfig,
    options: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error("OpenAI API key not configured");

    if (!audioBuffer) {
      throw new Error("OpenAI provider requires audioBuffer (cannot transcribe from URL alone)");
    }

    const model = config.model || "gpt-4o-mini-transcribe-2025-12-15";
    const fallbackModels = this.getFallbackModels(model);

    console.log(`🟠 [OpenAI] Transcribing with model=${model}, file=${options.fileName} (${options.fileSizeMB.toFixed(1)}MB)`);

    // Split into chunks if needed
    const chunks = this.splitAudioIntoChunks(audioBuffer, options.mimeType);

    // Try each model in sequence
    for (const currentModel of [model, ...fallbackModels]) {
      console.log(`🟠 [OpenAI] Attempting with model: ${currentModel} (${chunks.length} chunk(s))`);

      let allText = "";
      let modelFailed = false;

      for (let i = 0; i < chunks.length; i++) {
        const chunkFileName = chunks.length > 1 ? `chunk_${i}_${options.fileName}` : options.fileName;
        const result = await this.transcribeChunkWithRetry(chunks[i], chunkFileName, currentModel, apiKey);

        if (!result.success) {
          console.error(`🟠 [OpenAI] Chunk ${i} failed with ${currentModel}: ${result.error}`);
          modelFailed = true;
          break;
        }

        allText += (allText ? " " : "") + (result.text || "");
        console.log(`🟠 [OpenAI] Chunk ${i + 1}/${chunks.length} done: ${(result.text || "").substring(0, 80)}...`);
      }

      if (!modelFailed && allText.trim().length >= 2) {
        console.log(`🟠 [OpenAI] Transcription successful with ${currentModel}. Text length: ${allText.length}`);
        return {
          text: allText,
          formattedText: "", // No formatting — no diarization
          segments: [],
          duration: 0, // OpenAI text mode doesn't return duration
          language: "es",
          provider: "openai",
          model: currentModel,
          hasDiarization: false,
        };
      }

      console.log(`🟠 [OpenAI] Model ${currentModel} failed, trying next...`);
    }

    throw new Error(`OpenAI: All transcription models failed (${[model, ...fallbackModels].join(", ")})`);
  }

  async testConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Use the models endpoint to verify the key
      const response = await fetch(`${OPENAI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (response.ok) {
        return { success: true };
      }

      const errText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private getFallbackModels(primaryModel: string): string[] {
    const allModels = ["gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-mini-transcribe"];
    return allModels.filter((m) => m !== primaryModel);
  }

  private splitAudioIntoChunks(audioBuffer: ArrayBuffer, mimeType: string): Blob[] {
    const totalSize = audioBuffer.byteLength;
    if (totalSize <= MAX_CHUNK_SIZE) {
      return [new Blob([audioBuffer], { type: mimeType })];
    }

    const chunks: Blob[] = [];
    let offset = 0;
    while (offset < totalSize) {
      const end = Math.min(offset + MAX_CHUNK_SIZE, totalSize);
      chunks.push(new Blob([audioBuffer.slice(offset, end)], { type: mimeType }));
      offset = end;
    }

    console.log(`🟠 [OpenAI] Audio split into ${chunks.length} chunks (total ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
    return chunks;
  }

  private async transcribeChunkWithRetry(
    chunk: Blob,
    fileName: string,
    model: string,
    apiKey: string,
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const formData = new FormData();
      formData.append("file", chunk, fileName);
      formData.append("model", model);
      formData.append("language", "es");
      formData.append("response_format", "text");
      formData.append("temperature", "0.0");
      formData.append(
        "prompt",
        "Transcribe en español de forma literal (verbatim), sin normalizar números ni nombres. No incluyas etiquetas como [ruido], [música], [risas] ni [inaudible].",
      );

      try {
        const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!response.ok) {
          const errText = await response.text();

          // Rate limited — wait and retry
          if (response.status === 429) {
            const delay = Math.min(45000, 10000 * Math.pow(2, attempt));
            console.log(`🟠 [OpenAI] Rate limited, waiting ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          if (attempt === maxAttempts) {
            return { success: false, error: `${model} error ${response.status}: ${errText}` };
          }
        } else {
          const rawText = await response.text();
          if (rawText && rawText.trim().length > 0) {
            return { success: true, text: rawText };
          }

          if (attempt === maxAttempts) {
            return { success: false, error: `${model}: empty response` };
          }
        }
      } catch (e: any) {
        if (attempt === maxAttempts) {
          return { success: false, error: `${model} exception: ${e.message}` };
        }
      }

      // Exponential backoff between attempts
      const baseDelay = 3000 * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 2000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(30000, baseDelay + jitter)));
    }

    return { success: false, error: `${model}: max attempts exceeded` };
  }
}
