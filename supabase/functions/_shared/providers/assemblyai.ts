// ============================================================
// AssemblyAI Provider Adapter
// Flow: Upload audio → Submit transcript → Poll → Parse
// Uses universal-2 model with native speaker diarization
// ============================================================

import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionSegment,
  ProviderConfig,
  TranscribeOptions,
} from "./types.ts";

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes

export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai";

  async transcribe(
    audioUrl: string,
    audioBuffer: ArrayBuffer | null,
    config: ProviderConfig,
    options: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error("AssemblyAI API key not configured");

    const language = options.language || (config.config.language_code as string) || "es";

    // =====================================================
    //  Step 1: Upload audio to AssemblyAI's hosting
    //  This ensures AssemblyAI can access the file reliably
    //  (signed Supabase URLs may not always be reachable)
    // =====================================================
    let uploadUrl: string;

    if (audioBuffer && audioBuffer.byteLength > 0) {
      // Preferred: Upload the raw buffer directly to AssemblyAI
      console.log(`🔷 [AssemblyAI] Uploading audio file (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)...`);
      uploadUrl = await this.uploadAudio(apiKey, audioBuffer);
      console.log(`🔷 [AssemblyAI] Upload complete: ${uploadUrl.substring(0, 60)}...`);
    } else if (audioUrl) {
      // Fallback: If no buffer, try to download and then upload
      console.log(`🔷 [AssemblyAI] No buffer provided, downloading from URL to upload...`);
      try {
        const downloadRes = await fetch(audioUrl);
        if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);
        const downloadedBuffer = await downloadRes.arrayBuffer();
        uploadUrl = await this.uploadAudio(apiKey, downloadedBuffer);
        console.log(`🔷 [AssemblyAI] Upload complete: ${uploadUrl.substring(0, 60)}...`);
      } catch (dlErr: any) {
        // Last resort: pass the URL directly and hope AssemblyAI can reach it
        console.warn(`🔷 [AssemblyAI] Could not download+upload, using URL directly: ${dlErr.message}`);
        uploadUrl = audioUrl;
      }
    } else {
      throw new Error("AssemblyAI: No audio buffer or URL provided");
    }

    // =====================================================
    //  Step 2: Submit transcription job
    // =====================================================
    // Build speech_models array — AssemblyAI accepts an array with internal fallback
    // e.g. ["universal-3-pro", "universal-2"] tries pro first, falls back to universal-2
    const speechModels = this.buildSpeechModels(config.model);
    console.log(`🔷 [AssemblyAI] Submitting transcription: speech_models=${JSON.stringify(speechModels)}, language=${language}`);

    const submitResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        speaker_labels: true,
        language_code: language,
        speech_models: speechModels,
      }),
    });

    if (!submitResponse.ok) {
      const errText = await submitResponse.text();
      throw new Error(`AssemblyAI submit failed (${submitResponse.status}): ${errText}`);
    }

    const submitData = await submitResponse.json();
    const transcriptId = submitData.id;

    if (!transcriptId) {
      throw new Error("AssemblyAI: No transcript ID returned");
    }

    console.log(`🔷 [AssemblyAI] Job submitted: ${transcriptId}. Polling...`);

    // =====================================================
    //  Step 3: Poll for completion
    // =====================================================
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
        headers: { authorization: apiKey },
      });

      if (!pollResponse.ok) {
        const errText = await pollResponse.text();
        throw new Error(`AssemblyAI poll failed (${pollResponse.status}): ${errText}`);
      }

      const pollData = await pollResponse.json();

      if (pollData.status === "completed") {
        console.log(`🔷 [AssemblyAI] Transcription completed in ${Math.round((Date.now() - startTime) / 1000)}s`);
        return this.parseResult(pollData, config);
      }

      if (pollData.status === "error") {
        throw new Error(`AssemblyAI transcription error: ${pollData.error || "Unknown error"}`);
      }

      // Still processing
      console.log(`🔷 [AssemblyAI] Status: ${pollData.status}...`);
    }

    throw new Error(`AssemblyAI: Polling timeout after ${MAX_POLL_TIME_MS / 1000}s`);
  }

  /**
   * Build the speech_models array from a model config string.
   * AssemblyAI expects an array like ["universal-3-pro", "universal-2"].
   * We add universal-2 as fallback when using universal-3-pro for broader language coverage.
   */
  private buildSpeechModels(model: string): string[] {
    const primary = model || "universal-2";
    // If using universal-3-pro, add universal-2 as fallback for unsupported languages
    if (primary === "universal-3-pro") {
      return ["universal-3-pro", "universal-2"];
    }
    // Otherwise just use the single model
    return [primary];
  }

  async testConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate the key by submitting a very small test request
      const response = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
        method: "POST",
        headers: {
          authorization: apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audio_url: "https://storage.googleapis.com/aai-web-samples/5_common_misconceptions_about_evolution.wav",
          language_code: "en",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // If we get an id, the key works. Delete the job to avoid cost.
        if (data.id) {
          try {
            await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${data.id}`, {
              method: "DELETE",
              headers: { authorization: apiKey },
            });
          } catch { /* ignore */ }
        }
        return { success: true };
      }

      const errText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // =========================================================
  //  Upload audio binary to AssemblyAI's /v2/upload endpoint
  //  Returns the hosted URL to use in the /v2/transcript call
  // =========================================================
  private async uploadAudio(apiKey: string, audioBuffer: ArrayBuffer): Promise<string> {
    const response = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AssemblyAI upload failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.upload_url) {
      throw new Error("AssemblyAI upload: No upload_url returned");
    }

    return data.upload_url;
  }

  // =========================================================
  //  Parse the completed transcript into normalized format
  // =========================================================
  private parseResult(data: any, config: ProviderConfig): TranscriptionResult {
    const utterances: any[] = data.utterances || [];
    const fullText = data.text || "";
    const duration = data.audio_duration || 0;

    // Build segments from utterances, preserving raw speaker labels (A, B, C...)
    const rawSegments = utterances.map((u: any) => ({
      rawSpeaker: u.speaker || "A",
      text: (u.text || "").trim(),
      start: u.start || 0,
      end: u.end || 0,
    }));

    // Map speaker labels to roles using content heuristics
    const speakerMap = this.buildSpeakerMap(rawSegments);

    const segments: TranscriptionSegment[] = rawSegments.map((s) => ({
      speaker: speakerMap[s.rawSpeaker] || "Asesor",
      text: s.text,
      start: s.start,
      end: s.end,
    }));

    // Build formatted text
    const formattedText = segments
      .map((s) => `${s.speaker}: ${s.text}`)
      .join("\n");

    return {
      text: fullText,
      formattedText: formattedText || fullText,
      segments,
      duration,
      language: data.language_code || "es",
      provider: "assemblyai",
      model: config.model,
      hasDiarization: true,
    };
  }

  /**
   * Builds a mapping from raw speaker labels (A, B, ...) to roles (Asesor, Cliente).
   * Uses content-based scoring to determine who is the agent.
   */
  private buildSpeakerMap(segments: Array<{ rawSpeaker: string; text: string }>): Record<string, string> {
    // Collect unique speakers
    const speakers = [...new Set(segments.map((s) => s.rawSpeaker))];

    if (speakers.length <= 1) {
      return { [speakers[0] || "A"]: "Asesor" };
    }

    // Score each unique speaker
    const scores: Record<string, { agent: number; client: number }> = {};
    for (const sp of speakers) {
      scores[sp] = { agent: 0, client: 0 };
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const lower = seg.text.toLowerCase();
      scores[seg.rawSpeaker].agent += this.scoreAgent(lower, i);
      scores[seg.rawSpeaker].client += this.scoreClient(lower);
    }

    // The speaker with the highest agent score (relative to client) is the Asesor
    // If scores are ambiguous, the first speaker is typically the agent in call centers
    const firstSpeaker = segments[0]?.rawSpeaker;
    let agentSpeaker = firstSpeaker;
    let bestAgentDelta = -Infinity;

    for (const sp of speakers) {
      const delta = scores[sp].agent - scores[sp].client;
      if (delta > bestAgentDelta) {
        bestAgentDelta = delta;
        agentSpeaker = sp;
      }
    }

    // If no clear signal, default to first speaker = agent
    if (bestAgentDelta <= 0) {
      agentSpeaker = firstSpeaker;
    }

    const map: Record<string, string> = {};
    for (const sp of speakers) {
      map[sp] = sp === agentSpeaker ? "Asesor" : "Cliente";
    }

    return map;
  }

  private scoreAgent(text: string, index: number): number {
    let score = 0;
    if (/\b(nosotros|nuestro|nuestra|ofrecemos|podemos|contamos)\b/.test(text)) score += 2;
    if (/\b(verificar|confirmar|validar|registrar|activar|servicio|plan|promoción)\b/.test(text)) score += 3;
    if (/\b(señor|señora|don|doña|permítame|por seguridad|con quién tengo)\b/.test(text)) score += 2;
    if (index <= 2 && /\b(me comunico|llamo de|mi nombre es|de parte de|buenos días|buenas tardes)\b/.test(text)) score += 4;
    if (/\b(le comento|le informo|le explico)\b/.test(text)) score += 2;
    return score;
  }

  private scoreClient(text: string): number {
    let score = 0;
    if (/\b(yo tengo|no me interesa|ya tengo|muy caro|no quiero)\b/.test(text)) score += 3;
    if (/\b(quiero saber|cuánto|cómo|dónde|por qué|para qué|necesito)\b/.test(text)) score += 2;
    if (/[¿?]/.test(text) && /\b(cuánto|cómo|dónde|por qué|para qué|tiene|hay|puedo)\b/.test(text)) score += 2;
    return score;
  }
}
