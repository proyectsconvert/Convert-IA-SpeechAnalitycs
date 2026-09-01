// ============================================================
// Shared types for multi-provider transcription cascade
// ============================================================

/** A single segment of transcribed speech with speaker identification */
export interface TranscriptionSegment {
  speaker: string;   // Normalized: "Asesor" | "Cliente"
  text: string;
  start: number;     // milliseconds
  end: number;       // milliseconds
}

/** Normalized transcription result returned by any provider */
export interface TranscriptionResult {
  text: string;                       // Full raw transcription text
  formattedText: string;              // Formatted with speaker labels
  segments: TranscriptionSegment[];   // Speaker-labeled segments
  duration: number;                   // Estimated duration in seconds
  language: string;
  provider: string;                   // Which provider produced this
  model: string;                      // Which model was used
  hasDiarization: boolean;            // Whether diarization came from the provider
}

/** Configuration for a single transcription provider */
export interface ProviderConfig {
  provider: string;
  displayName: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
}

/** Log entry for cascade attempt tracking */
export interface CascadeAttemptLog {
  provider: string;
  model: string;
  success: boolean;
  durationMs: number;
  error?: string;
  skippedReason?: string;
}

/** Interface that every provider adapter must implement */
export interface TranscriptionProvider {
  readonly name: string;

  transcribe(
    audioUrl: string,
    audioBuffer: ArrayBuffer | null,
    config: ProviderConfig,
    options: TranscribeOptions,
  ): Promise<TranscriptionResult>;

  testConnection(apiKey: string): Promise<{ success: boolean; error?: string }>;
}

/** Options passed to every transcribe call */
export interface TranscribeOptions {
  fileName: string;
  mimeType: string;
  fileSizeMB: number;
  language?: string;
}
