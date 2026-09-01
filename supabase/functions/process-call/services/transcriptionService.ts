import { createAudioTranscription, createChatCompletion } from "../utils/openai.ts";
import { transcribeWithCascade } from "../../_shared/providers/cascade.ts";
import { loadProviderConfig } from "../../_shared/providers/configLoader.ts";
import type { TranscriptionResult } from "../../_shared/providers/types.ts";

const PRIMARY_MODEL = "gpt-4o-mini-transcribe-2025-12-15";
const FALLBACK_MODEL = "gpt-4o-mini-transcribe";

// Modelo principal de diarización
const DIARIZATION_MODEL_PRIMARY = "gpt-4o-mini";
// Fallbacks si el modelo principal no está disponible
const DIARIZATION_MODEL_FALLBACKS = ["gpt-4.1-nano", "gpt-5-nano", "gpt-5.4-nano"];

// Tamaño máximo de texto crudo por chunk para diarización (en caracteres)
const DIARIZATION_CHUNK_SIZE = 12000;
const DIARIZATION_OVERLAP = 200;

export async function transcribeAudio(audioUrl: string, accountId?: string, supabaseClient?: any) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    console.log("🔍 Downloading and validating audio from URL:", audioUrl);

    // --- HEAD for size/MIME without downloading ---
    const headCtrl = new AbortController();
    const headTO = setTimeout(() => headCtrl.abort(), 15000);
    let contentLengthHeader: string | null = null;
    let contentTypeHeader: string | null = null;

    try {
      const head = await fetch(audioUrl, {
        method: "HEAD",
        signal: headCtrl.signal,
      });
      if (head.ok) {
        contentLengthHeader = head.headers.get("content-length");
        contentTypeHeader = head.headers.get("content-type");
      }
    } catch (_) {
      // ignorar HEAD failures
    }
    clearTimeout(headTO);

    const sizeMBHeader = contentLengthHeader
      ? Math.round((Number(contentLengthHeader) / 1024 / 1024) * 100) / 100
      : null;

    // --- Download audio ---
    const res = await fetch(audioUrl);
    if (!res.ok || !res.body) {
      throw new Error(`No se pudo descargar el audio (${res.status})`);
    }

    const contentType = contentTypeHeader || res.headers.get("content-type") || "audio/mpeg";
    const fileName = decodeURIComponent(new URL(audioUrl).pathname.split("/").pop() || "audio.mp3");

    const blob = await res.blob();
    const audioBuffer = await blob.arrayBuffer();
    const fileSizeMB = audioBuffer.byteLength / 1024 / 1024;

    console.log(`🎵 File ready → name=${fileName} type=${contentType} size=${fileSizeMB.toFixed(1)}MB`);

    // =====================================================
    //  STEP 1: Transcripción con cascada multi-proveedor
    // =====================================================
    let cascadeResult: TranscriptionResult | null = null;
    let rawTranscriptionText = "";
    let usedModel = "";
    let usedProvider = "";

    // Try multi-provider cascade if accountId and supabase are available
      try {
        const providerConfigs = await loadProviderConfig(supabaseClient);
        console.log(`🔄 Using global multi-provider cascade with ${providerConfigs.filter(p => p.enabled).length} enabled provider(s)`);

        cascadeResult = await transcribeWithCascade(
          audioUrl,
          audioBuffer,
          providerConfigs,
          { fileName, mimeType: contentType, fileSizeMB },
        );

        rawTranscriptionText = cascadeResult.text;
        usedModel = cascadeResult.model;
        usedProvider = cascadeResult.provider;

        // If provider has native diarization, use it directly
        if (cascadeResult.hasDiarization && cascadeResult.formattedText) {
          console.log(`✅ ${usedProvider} proporcionó diarización nativa — omitiendo diarización GPT`);
          console.log(`📦 Segmentos recibidos: ${cascadeResult.segments.length}`);

          let formattedTranscription = cascadeResult.formattedText;

          // Apply same postprocessing as the GPT diarization path
          formattedTranscription = sanitizeRepetitionsPerLine(formattedTranscription);
          formattedTranscription = dedupeConsecutiveLines(formattedTranscription);
          formattedTranscription = mergeConsecutiveSpeakerTurns(formattedTranscription);
          formattedTranscription = dedupeConsecutiveLines(formattedTranscription);
          formattedTranscription = normalizeSpeakerLabels(formattedTranscription);

          if (formattedTranscription && formattedTranscription.trim().length > 20) {
            // Validate integrity
            const rawWordCount = rawTranscriptionText.split(/\s+/).filter(Boolean).length;
            const formattedTextOnly = formattedTranscription
              .replace(/^(?:\[\d+:\d{2}\]\s*)?(Asesor|Cliente):\s*/gim, "")
              .replace(/\n+/g, " ");
            const formattedWordCount = formattedTextOnly.split(/\s+/).filter(Boolean).length;
            const retentionRatio = formattedWordCount / Math.max(rawWordCount, 1);

            console.log(
              `📐 Integridad: raw=${rawWordCount} | formatted=${formattedWordCount} | retención=${(retentionRatio * 100).toFixed(1)}%`,
            );

            const lines = formattedTranscription.split("\n").filter((l) => l.trim());
            const conversationLines = lines.filter((l) => l.startsWith("Asesor:") || l.startsWith("Cliente:"));

            if (conversationLines.length >= 2) {
              const totalWords = formattedTranscription.split(/\s+/).length;
              const advisorLines = conversationLines.filter((l) => l.startsWith("Asesor:")).length;
              const clientLines = conversationLines.filter((l) => l.startsWith("Cliente:")).length;

              console.log(`✅ Transcription completed via ${usedProvider} (${usedModel}):`);
              console.log(`📊 Quality Stats:`);
              console.log(`  - Conversation lines: ${conversationLines.length}`);
              console.log(`  - Asesor lines: ${advisorLines}`);
              console.log(`  - Cliente lines: ${clientLines}`);
              console.log(`  - Total words: ${totalWords}`);
              console.log(`  - Provider: ${usedProvider} | Model: ${usedModel}`);

              return formattedTranscription;
            }
          }

          // If native diarization output was insufficient, fall through to GPT diarization
          console.log("⚠️ Native diarization output insufficient, falling through to GPT diarization...");
        }
      } catch (cascadeError: any) {
        console.error("❌ Multi-provider cascade failed:", cascadeError.message);
        console.log("⚠️ Falling back to legacy OpenAI-only transcription...");
        // Fall through to legacy OpenAI flow below
      }

    // =====================================================
    //  STEP 1 FALLBACK: Transcripción solo OpenAI (legacy)
    //  (cuando la cascada no está disponible o falló)
    // =====================================================
    if (!rawTranscriptionText || rawTranscriptionText.trim().length < 2) {
      console.log("\n🔄 Usando flujo legacy de transcripción (solo OpenAI)...");
      const uploadFile = new File([blob], fileName, { type: contentType });
      const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];
      let attempts = 0;
      const maxAttempts = 3;

      const verbatimPrompt =
        "Transcribe el audio en español latino de forma fiel al habla real y priorizando claridad. " +
        "Conserva exactamente el contenido dicho, sin resumir ni reinterpretar. " +
        "Mantén muletillas, interjecciones, titubeos y repeticiones solo cuando sean claramente audibles y realmente pronunciadas por la persona. " +
        "No corrijas gramática. " +
        "No completes frases truncadas. " +
        "No inventes palabras, frases ni contenido. " +
        "No normalices nombres, números, marcas, cédulas, teléfonos, fechas, direcciones ni valores monetarios. " +
        "Usa puntuación natural para reflejar pausas e intención del habla. " +
        "Si un fragmento no se entiende con claridad, transcríbelo solo una vez de la forma más breve posible sin adivinar ni fabricar texto. " +
        "No agregues etiquetas de hablante, comentarios, explicaciones, descripciones ni marcas como ruido, música o silencio. " +
        "Importante: no repitas artificialmente palabras, preguntas o frases si no ocurren realmente en el audio. " +
        "Si una palabra o frase es ambigua, no la expandas ni la repitas; transcríbela una sola vez y continúa con el resto del contenido.";

      while (attempts < maxAttempts) {
        try {
          attempts++;
          console.log(`🔄 Transcription attempt ${attempts}/${maxAttempts}`);

          let transcribed = false;

          for (const model of modelsToTry) {
            try {
              console.log(`🎤 Trying ${model}...`);
              const response = await createAudioTranscription({
                file: uploadFile,
                model,
                language: "es",
                response_format: "text",
                temperature: 0.0,
                prompt: verbatimPrompt,
                timeoutMs: 180000,
              });

              rawTranscriptionText = typeof response === "string" ? response : response.text || "";

              if (rawTranscriptionText.trim().length >= 2) {
                console.log(`✅ Success with ${model} (${rawTranscriptionText.length} chars)`);
                usedModel = model;
                usedProvider = "openai";
                transcribed = true;
                break;
              }
            } catch (err: any) {
              console.warn(`⚠️ ${model} failed:`, err?.message || err);
            }
          }

          if (transcribed) break;

          if (attempts === maxAttempts) {
            throw new Error("All transcription models failed");
          }

          const baseDelay = 3000 * Math.pow(2, attempts - 1);
          const jitter = Math.random() * 2000;
          await new Promise((resolve) => setTimeout(resolve, Math.min(30000, baseDelay + jitter)));
        } catch (attemptError: any) {
          console.error(`❌ Attempt ${attempts} failed:`, attemptError);

          if (attemptError.status === 413 || attemptError.message?.includes("413")) {
            return `No hay transcripción disponible - archivo demasiado grande (${fileSizeMB.toFixed(1)}MB). Máximo permitido: 25MB`;
          }

          if (attemptError.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(45000, 10000 * Math.pow(2, attempts))));
          }

          if (attempts === maxAttempts) {
            throw attemptError;
          }

          const baseDelay = 3000 * Math.pow(2, attempts - 1);
          const jitter = Math.random() * 2000;
          await new Promise((resolve) => setTimeout(resolve, Math.min(30000, baseDelay + jitter)));
        }
      }
    }

    if (!rawTranscriptionText || rawTranscriptionText.trim().length < 2) {
      return "No hay transcripción disponible - no se detectó contenido de audio válido";
    }

    rawTranscriptionText = rawTranscriptionText.replace(/[ \t]+/g, " ").trim();

    // Limpieza anti-repetición en texto crudo
    const beforeLen = rawTranscriptionText.length;
    rawTranscriptionText = sanitizeRepetitions(rawTranscriptionText);
    const afterLen = rawTranscriptionText.length;

    if (beforeLen !== afterLen) {
      console.log(
        `🧹 Anti-repetición aplicada: ${beforeLen} → ${afterLen} chars (-${(
          ((beforeLen - afterLen) / beforeLen) *
          100
        ).toFixed(1)}%)`,
      );
    }

    console.log(`✅ Texto crudo listo (${rawTranscriptionText.length} chars, proveedor: ${usedProvider || "openai"}). Formateando con hablantes...`);

    // =====================================================
    //  STEP 2: Diarización por chunks
    // =====================================================
    console.log("👥 Step 2: Identificando hablantes...");

    const chunks = splitTextIntoChunks(rawTranscriptionText, DIARIZATION_CHUNK_SIZE, DIARIZATION_OVERLAP);
    console.log(`📦 Procesando ${chunks.length} chunk(s) para diarización`);

    const formattedChunks: string[] = [];
    let lastSpeaker: "Asesor" | "Cliente" | null = null;
    let usedDiarizationModel = "";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const contextHint = lastSpeaker
        ? `\nCONTEXTO: El último hablante del fragmento anterior fue "${lastSpeaker}". Mantén coherencia conversacional y evita cambios de hablante innecesarios.`
        : "";

      const diarizationPrompt = `Eres un especialista en diarización de llamadas de call center entre dos participantes:
Asesor
Cliente

Recibirás una transcripción literal sin etiquetas.

Tu tarea es dividir el texto en turnos de habla y etiquetar cada turno únicamente como:
Asesor:
Cliente:

Reglas:
1. Conserva literalmente el texto original.
2. No resumas, no corrijas, no completes y no inventes.
3. No elimines muletillas, titubeos o repeticiones reales.
4. Separa turnos solo cuando haya evidencia razonable de cambio de hablante.
5. Prioriza coherencia conversacional y continuidad de contexto.
6. Si hay ambigüedad, elige la opción más probable por contexto inmediato, sin forzar alternancia.
7. No dupliques líneas ni repitas el mismo contenido en turnos consecutivos.
8. Si una frase parece continuidad del mismo hablante, mantenla en el mismo turno en lugar de fragmentarla innecesariamente.
9. No agregues timestamps, comentarios, encabezados ni explicaciones.

Señales frecuentes de Asesor:
- se presenta con nombre o empresa
- valida datos
- explica servicios, pagos, planes, procesos o promociones
- usa cierres o lenguaje formal de atención

Señales frecuentes de Cliente:
- responde validaciones
- expresa dudas, objeciones o molestias
- brinda datos personales
- pregunta condiciones, costos o motivos

Devuelve únicamente el diálogo etiquetado.${contextHint}

Fragmento ${i + 1}/${chunks.length}:
${chunk}`;

      let chunkFormatted = "";
      const modelsForDiarization = [DIARIZATION_MODEL_PRIMARY, ...DIARIZATION_MODEL_FALLBACKS];

      for (const dModel of modelsForDiarization) {
        try {
          const isGpt5 = dModel.startsWith("gpt-5");
          const chatResponse = await createChatCompletion({
            model: dModel,
            messages: [{ role: "user", content: diarizationPrompt }],
            ...(isGpt5 ? {} : { temperature: 0.0 }),
            max_tokens: 16000,
            timeoutMs: 120000,
          });

          chunkFormatted = chatResponse.choices?.[0]?.message?.content?.trim() || "";

          if (chunkFormatted) {
            usedDiarizationModel = dModel;
            break;
          }
        } catch (e: any) {
          console.warn(`⚠️ Diarización con ${dModel} falló:`, e?.message || e);
        }
      }

      if (chunkFormatted) {
        chunkFormatted = normalizeSpeakerLabels(chunkFormatted);

        const speakerMatches = [...chunkFormatted.matchAll(/(?:^|\n)(Asesor|Cliente):/g)];
        if (speakerMatches.length > 0) {
          lastSpeaker = speakerMatches[speakerMatches.length - 1][1] as "Asesor" | "Cliente";
        }

        formattedChunks.push(chunkFormatted);
        console.log(`✅ Chunk ${i + 1}/${chunks.length} diarizado con ${usedDiarizationModel}`);
      } else {
        console.warn(`⚠️ Chunk ${i + 1} sin respuesta de modelos, usando heurística`);
        formattedChunks.push(heuristicDiarization(chunk));
      }
    }

    let formattedTranscription = formattedChunks.join("\n").trim();

    // Postproceso
    formattedTranscription = sanitizeRepetitionsPerLine(formattedTranscription);
    formattedTranscription = dedupeConsecutiveLines(formattedTranscription);
    formattedTranscription = mergeConsecutiveSpeakerTurns(formattedTranscription);
    formattedTranscription = dedupeConsecutiveLines(formattedTranscription);
    formattedTranscription = normalizeSpeakerLabels(formattedTranscription);

    // =====================================================
    //  FALLBACK total si todo falló
    // =====================================================
    if (!formattedTranscription || formattedTranscription.trim().length < 20) {
      console.log("⚠️ Using full heuristic speaker detection as fallback...");
      formattedTranscription = heuristicDiarization(rawTranscriptionText);
    }

    // Validación de integridad
    const rawWordCount = rawTranscriptionText.split(/\s+/).filter(Boolean).length;
    const formattedTextOnly = formattedTranscription
      .replace(/^(?:\[\d+:\d{2}\]\s*)?(Asesor|Cliente):\s*/gim, "")
      .replace(/\n+/g, " ");
    const formattedWordCount = formattedTextOnly.split(/\s+/).filter(Boolean).length;
    const retentionRatio = formattedWordCount / Math.max(rawWordCount, 1);

    console.log(
      `📐 Integridad de palabras: raw=${rawWordCount} | formatted=${formattedWordCount} | retención=${(
        retentionRatio * 100
      ).toFixed(1)}%`,
    );

    if (retentionRatio < 0.85) {
      console.warn("⚠️ Pérdida de contenido detectada. Devolviendo diarización heurística.");
      formattedTranscription = heuristicDiarization(rawTranscriptionText);
    }

    if (!formattedTranscription || formattedTranscription.trim() === "") {
      return "No hay transcripción disponible - error en el procesamiento del audio";
    }

    const lines = formattedTranscription.split("\n").filter((l) => l.trim());
    const conversationLines = lines.filter((l) => l.startsWith("Asesor:") || l.startsWith("Cliente:"));

    if (conversationLines.length < 2) {
      console.log("⚠️ Insufficient turns, returning raw transcription");
      return rawTranscriptionText;
    }

    const totalWords = formattedTranscription.split(/\s+/).length;
    const advisorLines = conversationLines.filter((l) => l.startsWith("Asesor:")).length;
    const clientLines = conversationLines.filter((l) => l.startsWith("Cliente:")).length;

    console.log(`✅ Transcription completed successfully:`);
    console.log(`📊 Quality Stats:`);
    console.log(`  - Conversation lines: ${conversationLines.length}`);
    console.log(`  - Asesor lines: ${advisorLines}`);
    console.log(`  - Cliente lines: ${clientLines}`);
    console.log(`  - Total words: ${totalWords}`);
    console.log(`  - File size: ${sizeMBHeader ?? "?"}MB`);
    console.log(`  - Transcription model: ${usedModel}`);
    console.log(`  - Diarization model: ${usedDiarizationModel || "heuristic"}`);

    return formattedTranscription;
  } catch (error: any) {
    console.error("❌ Error in transcription service:", error);

    if (error.name === "AbortError") {
      return "No hay transcripción disponible - tiempo de descarga agotado (archivo muy grande o conexión lenta)";
    }
    if (error.status === 413 || error.message?.includes("413")) {
      return "No hay transcripción disponible - archivo demasiado grande para la API (máximo 25MB)";
    }
    if (error.status === 429) {
      return "No hay transcripción disponible - límite de velocidad alcanzado";
    }
    if (error.message?.includes("Invalid file format")) {
      return "No hay transcripción disponible - formato de archivo no compatible";
    }
    if (error.message?.includes("No speech found")) {
      return "No hay transcripción disponible - no se detectó habla clara en el audio";
    }

    throw new Error(`Transcription failed: ${error.message}`);
  }
}

// =====================================================
//  ANTI-REPETICIÓN
// =====================================================
function sanitizeRepetitions(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // 1) Misma palabra repetida 3+ veces seguidas (con o sin puntuación intermedia) → conservar 2
  cleaned = cleaned.replace(/\b([\p{L}\p{N}'’\-]+)\b([\s,.;:¡!¿?]+\1\b){2,}/giu, (_m, w) => `${w} ${w}`);

  // 2) Frase de 2-15 palabras repetida 3+ veces consecutivas (ignorando puntuación intermedia)
  //    → conservar 1 ocurrencia
  for (let n = 15; n >= 2; n--) {
    const phrasePattern = new RegExp(`((?:\\b[\\p{L}\\p{N}'’\\-]+\\b[\\s,.;:¡!¿?]*){${n}})(?:\\1){2,}`, "giu");
    cleaned = cleaned.replace(phrasePattern, "$1");
  }

  // 3) Anti-loop GLOBAL: detecta frases (3-12 palabras) que aparezcan 4+ veces con casi cero
  //    separación entre sí (loops del modelo) y las colapsa a 2 ocurrencias.
  cleaned = collapseGlobalLoops(cleaned);

  // 4) Mismo carácter repetido 6+ veces → 3
  cleaned = cleaned.replace(/([\p{L}])\1{5,}/giu, "$1$1$1");

  // 5) Signos repetidos
  cleaned = cleaned.replace(/([.,!?¿¡])\1{2,}/g, "$1");

  // 6) Espacios múltiples
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n");

  return cleaned.trim();
}

// Normaliza una frase para comparación (sin puntuación, minúsculas, espacios colapsados)
function normalizePhraseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'()\-—–]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta runs de la misma frase (3-12 palabras) repetida 4+ veces casi consecutivamente
// y conserva solo las 2 primeras apariciones.
function collapseGlobalLoops(text: string): string {
  const tokens = text.split(/(\s+)/);
  const wordIdx: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] && !/^\s+$/.test(tokens[i])) wordIdx.push(i);
  }

  const totalWords = wordIdx.length;
  if (totalWords < 12) return text;

  const removed = new Set<number>();

  for (let n = 12; n >= 3; n--) {
    if (totalWords < n * 4) continue;

    const seen = new Map<string, number[]>();
    for (let i = 0; i <= totalWords - n; i++) {
      if (removed.has(wordIdx[i])) continue;
      const phraseTokens: string[] = [];
      for (let k = 0; k < n; k++) phraseTokens.push(tokens[wordIdx[i + k]]);
      const key = normalizePhraseKey(phraseTokens.join(" "));
      if (key.length < 6) continue;
      const list = seen.get(key) || [];
      list.push(i);
      seen.set(key, list);
    }

    for (const [, positions] of seen) {
      if (positions.length < 4) continue;
      let runStart = 0;
      for (let p = 1; p <= positions.length; p++) {
        const isEnd = p === positions.length || positions[p] - positions[p - 1] > n * 3;
        if (isEnd) {
          const runLen = p - runStart;
          if (runLen >= 4) {
            for (let q = runStart + 2; q < p; q++) {
              const startWord = positions[q];
              const endWord = startWord + n - 1;
              for (let w = startWord; w <= endWord; w++) {
                const tokIdx = wordIdx[w];
                if (tokIdx !== undefined) removed.add(tokIdx);
              }
            }
          }
          runStart = p;
        }
      }
    }

    if (removed.size > 0) break;
  }

  if (removed.size === 0) return text;

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (removed.has(i)) continue;
    out.push(tokens[i]);
  }
  return out
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeRepetitionsPerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(/^(?:(\[\d+:\d{2}\])\s*)?((?:Asesor|Cliente):\s*)(.*)$/i);
      if (m) {
        const prefix = `${m[1] ? `${m[1]} ` : ""}${m[2]}`;
        return prefix + sanitizeRepetitions(m[3]);
      }
      return sanitizeRepetitions(line);
    })
    .join("\n");
}

// =====================================================
//  Split text into overlapping chunks
// =====================================================
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf(". ", end);
      const wordEnd = text.lastIndexOf(" ", end);

      if (sentenceEnd > start + chunkSize * 0.5) {
        end = sentenceEnd + 1;
      } else if (wordEnd > start + chunkSize * 0.5) {
        end = wordEnd;
      }
    }

    chunks.push(text.slice(start, end).trim());

    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

// =====================================================
//  DEDUPE Y NORMALIZACIÓN
// =====================================================
function dedupeConsecutiveLines(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const result: string[] = [];

  for (const line of lines) {
    const prev = result[result.length - 1];
    if (prev && normalizeDialogueLine(prev) === normalizeDialogueLine(line)) {
      continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

function normalizeDialogueLine(line: string): string {
  return line
    .replace(/^(?:\[\d+:\d{2}\]\s*)?(Asesor|Cliente):\s*/i, "")
    .replace(/[.,!?¿¡]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeSpeakerLabels(text: string): string {
  return text
    .replace(/\[AGENTE\]\s*:/gi, "Asesor:")
    .replace(/\[CLIENTE\]\s*:/gi, "Cliente:")
    .replace(/^AGENTE\s*:/gim, "Asesor:")
    .replace(/^CLIENTE\s*:/gim, "Cliente:")
    .replace(/^Agente\s*:/gim, "Asesor:")
    .replace(/^Cliente\s*:/gim, "Cliente:")
    .replace(/^Asesor\s*:/gim, "Asesor:");
}

function mergeConsecutiveSpeakerTurns(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const merged: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(?:\[\d+:\d{2}\]\s*)?(Asesor|Cliente):\s*(.*)$/i);
    if (!match) continue;

    const speaker = match[1];
    const content = match[2];

    const prev = merged[merged.length - 1];
    const prevMatch = prev?.match(/^(?:\[\d+:\d{2}\]\s*)?(Asesor|Cliente):\s*(.*)$/i);

    if (prevMatch && prevMatch[1].toLowerCase() === speaker.toLowerCase()) {
      merged[merged.length - 1] = `${speaker}: ${prevMatch[2]} ${content}`.replace(/\s+/g, " ").trim();
    } else {
      merged.push(`${speaker}: ${content}`);
    }
  }

  return merged.join("\n");
}

// =====================================================
//  Heuristic diarization fallback
// =====================================================
function heuristicDiarization(rawText: string): string {
  const sentences = rawText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3);

  if (sentences.length === 0) return "";

  let currentSpeaker: "Asesor" | "Cliente" = "Asesor";
  let formatted = "";

  for (let i = 0; i < sentences.length; i++) {
    const text = sentences[i].trim();
    if (!text) continue;

    const lower = text.toLowerCase();

    const advisorSignals =
      /\b(nosotros|nuestro|ofrecemos|podemos|contamos|le comento|le informo|permítame|verificar|confirmar|activar|plan|servicio|promoción|mi nombre es|le llamo de|me comunico)\b/.test(
        lower,
      );

    const clientSignals =
      /\b(yo tengo|no me interesa|ya tengo|muy caro|no quiero|quiero saber|cuánto|cómo|dónde|por qué|para qué|me pueden|necesito)\b/.test(
        lower,
      );

    const hasQuestion = /[¿?]/.test(text) && /\b(cuánto|cómo|dónde|por qué|para qué|tiene|hay|puedo)\b/.test(lower);

    if (advisorSignals && currentSpeaker !== "Asesor") {
      currentSpeaker = "Asesor";
    } else if ((clientSignals || hasQuestion) && currentSpeaker !== "Cliente") {
      currentSpeaker = "Cliente";
    }
    // si no hay evidencia suficiente, mantener el hablante actual

    formatted += `${currentSpeaker}: ${text}\n`;
  }

  return formatted.trim();
}

// =====================================================
//  Batch processing with concurrency limit
// =====================================================
export async function transcribeAudioBatch(audioUrls: string[], concurrency = 50) {
  const results: Array<{
    url: string;
    ok: boolean;
    text?: string;
    error?: string;
  }> = [];

  const limit = Math.max(1, Math.min(concurrency, 100));
  let index = 0;

  async function worker() {
    while (index < audioUrls.length) {
      const myIndex = index++;
      const url = audioUrls[myIndex];

      try {
        const text = await transcribeAudio(url);
        results[myIndex] = { url, ok: true, text };
      } catch (e: any) {
        results[myIndex] = {
          url,
          ok: false,
          error: e?.message || String(e),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }).map(worker));
  return results;
}
