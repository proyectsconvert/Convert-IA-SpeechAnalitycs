// ============================================================
// Deepgram Provider Adapter
// Uses Nova-3 model with native speaker diarization
// Sends audio binary directly to /v1/listen (more reliable
// than URL-based since Deepgram may not reach signed URLs)
// ============================================================

import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionSegment,
  ProviderConfig,
  TranscribeOptions,
} from "./types.ts";

const DEEPGRAM_BASE_URL = "https://api.deepgram.com/v1";

export class DeepgramProvider implements TranscriptionProvider {
  readonly name = "deepgram";

  async transcribe(
    audioUrl: string,
    audioBuffer: ArrayBuffer | null,
    config: ProviderConfig,
    options: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    const apiKey = config.apiKey;
    if (!apiKey) throw new Error("Deepgram API key not configured");

    // Use es-419 for Latin American Spanish (better accuracy)
    const language = options.language || (config.config.language as string) || "es-419";
    const model = config.model || "nova-3";

    // Build query parameters
    const params = new URLSearchParams({
      model,
      language,
      diarize: "true",
      utterances: "true",
      smart_format: "true",
      punctuate: "true",
    });

    console.log(`🟢 [Deepgram] Transcribing with model=${model}, language=${language}`);

    let response: Response;

    if (audioBuffer && audioBuffer.byteLength > 0) {
      // =====================================================
      //  Preferred: Send audio binary directly
      //  This avoids issues with Deepgram not being able to
      //  reach signed Supabase URLs
      // =====================================================
      const mimeType = options.mimeType || "audio/mpeg";
      console.log(`🟢 [Deepgram] Sending audio buffer (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, ${mimeType})`);

      response = await fetch(`${DEEPGRAM_BASE_URL}/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": mimeType,
        },
        body: audioBuffer,
      });
    } else if (audioUrl) {
      // =====================================================
      //  Fallback: Send URL for Deepgram to fetch
      // =====================================================
      console.log(`🟢 [Deepgram] Sending audio URL for Deepgram to fetch`);

      response = await fetch(`${DEEPGRAM_BASE_URL}/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: audioUrl }),
      });
    } else {
      throw new Error("Deepgram: No audio buffer or URL provided");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram transcription failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log(`🟢 [Deepgram] Transcription completed successfully`);

    return this.parseResult(data, config);
  }

  async testConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Use the /projects endpoint to verify the key without cost
      const response = await fetch("https://api.deepgram.com/v1/projects", {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
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

  // =========================================================
  //  Parse Deepgram response into normalized format
  // =========================================================
  private parseResult(data: any, config: ProviderConfig): TranscriptionResult {
    const results = data.results;
    if (!results) throw new Error("Deepgram: No results in response");

    // Extract full text from the first channel's best alternative
    const channels = results.channels || [];
    const firstChannel = channels[0];
    const alternatives = firstChannel?.alternatives || [];
    const bestAlternative = alternatives[0];
    const fullText = bestAlternative?.transcript || "";

    // Extract duration from metadata
    const duration = data.metadata?.duration || 0;

    // Extract utterances with speaker labels (speaker is an integer: 0, 1, 2...)
    const utterances = results.utterances || [];
    const rawSegments = utterances.map((u: any) => ({
      rawSpeaker: u.speaker ?? 0,
      text: (u.transcript || "").trim(),
      start: Math.round((u.start || 0) * 1000), // Deepgram returns seconds → convert to ms
      end: Math.round((u.end || 0) * 1000),
    }));

    // Map speaker numbers to roles using content heuristics
    const speakerMap = this.buildSpeakerMap(rawSegments);

    const segments: TranscriptionSegment[] = rawSegments.map((s: any) => ({
      speaker: speakerMap[String(s.rawSpeaker)] || "Asesor",
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
      duration: Math.round(duration),
      language: data.metadata?.language || "es",
      provider: "deepgram",
      model: config.model,
      hasDiarization: true,
    };
  }

  /**
   * Builds a mapping from Deepgram speaker numbers (0, 1, ...) to roles (Asesor, Cliente).
   * Uses content-based scoring to determine who is the agent.
   */
  private buildSpeakerMap(segments: Array<{ rawSpeaker: number; text: string }>): Record<string, string> {
    // Collect unique speakers
    const speakers = [...new Set(segments.map((s) => String(s.rawSpeaker)))];

    if (speakers.length <= 1) {
      return { [speakers[0] || "0"]: "Asesor" };
    }

    // Score each unique speaker
    const scores: Record<string, { agent: number; client: number }> = {};
    for (const sp of speakers) {
      scores[sp] = { agent: 0, client: 0 };
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const lower = seg.text.toLowerCase();
      const key = String(seg.rawSpeaker);
      scores[key].agent += this.scoreAgent(lower, i);
      scores[key].client += this.scoreClient(lower);
    }

    // The speaker with the highest agent score (relative to client) is the Asesor
    // If scores are ambiguous, the first speaker is typically the agent
    const firstSpeaker = String(segments[0]?.rawSpeaker ?? 0);
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
