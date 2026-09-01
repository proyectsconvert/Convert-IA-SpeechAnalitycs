import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { transcribeWithCascade } from "../_shared/providers/cascade.ts";
import { loadProviderConfig } from "../_shared/providers/configLoader.ts";
import type { TranscriptionResult } from "../_shared/providers/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB per chunk

// ========== HELPER: Split audio into chunks ==========
function splitAudioIntoChunks(audioBuffer: ArrayBuffer, mimeType: string): Blob[] {
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
  console.log(`Audio split into ${chunks.length} chunks (total ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
  return chunks;
}

// ========== HELPER: Transcribe a single chunk (text format, Colab-style) ==========
async function transcribeChunk(
  chunk: Blob,
  fileName: string,
  model: string,
  openaiKey: string,
): Promise<{ success: boolean; result?: any; error?: string }> {
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
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `${model} error ${response.status}: ${errText}` };
    }

    const rawText = await response.text();
    return { success: true, result: { text: rawText, duration: 0 } };
  } catch (e: any) {
    return { success: false, error: `${model} exception: ${e.message}` };
  }
}

// ========== HELPER: Transcribe with fallback chain (only mini models) ==========
async function transcribeWithFallback(
  chunks: Blob[],
  fileName: string,
  openaiKey: string,
): Promise<{ text: string; segments: any[]; duration: number; language: string; model: string }> {
  const models = ["gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-mini-transcribe"];

  for (const model of models) {
    console.log(`Attempting transcription with model: ${model} (${chunks.length} chunk(s))`);
    let allText = "";
    let totalDuration = 0;
    let modelFailed = false;

    for (let i = 0; i < chunks.length; i++) {
      const chunkFileName = chunks.length > 1 ? `chunk_${i}_${fileName}` : fileName;

      let result;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        result = await transcribeChunk(chunks[i], chunkFileName, model, openaiKey);

        if (result.success) break;

        if (result.error?.includes("429")) {
          const delay = Math.min(45000, 10000 * Math.pow(2, attempts));
          console.log(`Rate limited, waiting ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (attempts === maxAttempts) break;

        const baseDelay = 3000 * Math.pow(2, attempts - 1);
        const jitter = Math.random() * 2000;
        await new Promise((resolve) => setTimeout(resolve, Math.min(30000, baseDelay + jitter)));
      }

      if (!result?.success) {
        console.error(`Chunk ${i} failed with ${model}: ${result?.error}`);
        modelFailed = true;
        break;
      }

      const r = result.result!;
      allText += (allText ? " " : "") + (r.text || "");
      console.log(`Chunk ${i}/${chunks.length} done with ${model}: ${(r.text || "").substring(0, 80)}...`);
    }

    if (!modelFailed && allText.trim().length > 10) {
      console.log(`Transcription successful with ${model}. Text length: ${allText.length}`);
      return { text: allText, segments: [], duration: totalDuration, language: "es", model };
    }

    console.log(`Model ${model} failed, trying next fallback...`);
  }

  throw new Error(
    "All transcription models failed (gpt-4o-mini-transcribe-2025-12-15, gpt-4o-mini-transcribe)",
  );
}

// ========== HELPER: Speaker diarization from segments ==========
function diarizeFromSegments(segments: any[]): string {
  if (!segments || segments.length === 0) return "";

  // Filter noise/invalid segments
  const noiseTags = /(\[(noise|music|música|ruido|laughter|risas|aplausos|background|fondo|inaudible)\])/i;
  const validSegments = segments
    .filter((seg) => {
      const text = seg.text ? seg.text.trim() : "";
      const noSpeechProb = typeof seg.no_speech_prob === "number" ? seg.no_speech_prob : 0;
      return text.length > 2 && !text.match(/^[.,!?;:\s\-_]+$/) && !noiseTags.test(text) && noSpeechProb < 0.6;
    })
    .sort((a, b) => (a.start || 0) - (b.start || 0));

  if (validSegments.length === 0) return "";

  let currentSpeaker = "Agente";
  let lastEndTime = 0;
  let consecutiveCount = 0;
  let formattedTranscription = "";

  function computeSpeakerScores(text: string, index: number) {
    const lower = text.toLowerCase();
    let agent = 0,
      client = 0;

    // Agent patterns
    if (/\b(nosotros|nuestro|nuestra|ofrecemos|podemos|contamos)\b/.test(lower)) agent += 2;
    if (/\b(verificar|confirmar|validar|registrar|activar|servicio|plan|promoción)\b/.test(lower)) agent += 3;
    if (/\b(señor|señora|don|doña|permítame|por seguridad|con quién tengo)\b/.test(lower)) agent += 2;
    if (index <= 2 && /\b(me comunico|llamo de|mi nombre es|de parte de|buenos días|buenas tardes)\b/.test(lower))
      agent += 3;

    // Client patterns
    if (/\b(yo|mi|mis|me|tengo|quiero|necesito|puedo|estoy)\b/.test(lower)) client += 2;
    if (/\b(no me interesa|ya tengo|muy caro|no quiero)\b/.test(lower)) client += 3;
    if (/[¿?]/.test(text)) client += 1;
    if (/\b(cuánto|precio|vale|cuesta|cómo|dónde|por qué)\b/.test(lower)) client += 2;

    const wordCount = lower.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 12) agent += 1;

    return { agent, client };
  }

  validSegments.forEach((segment, index) => {
    const text = segment.text ? segment.text.trim() : "";
    if (!text || text.length < 2) return;

    const startTime = segment.start || 0;
    const endTime = segment.end || 0;
    const silenceGap = startTime - lastEndTime;

    const { agent: agentScore, client: clientScore } = computeSpeakerScores(text, index);

    let shouldSwitch = false;
    if (agentScore > clientScore && agentScore > 0 && currentSpeaker !== "Agente") shouldSwitch = true;
    else if (clientScore > agentScore && clientScore > 0 && currentSpeaker !== "Cliente") shouldSwitch = true;
    else if (silenceGap > 1.5 && consecutiveCount > 2) shouldSwitch = true;
    else if (consecutiveCount > 3 && silenceGap > 0.8) shouldSwitch = true;

    if (shouldSwitch) {
      if (agentScore > clientScore) currentSpeaker = "Agente";
      else if (clientScore > agentScore) currentSpeaker = "Cliente";
      else currentSpeaker = currentSpeaker === "Agente" ? "Cliente" : "Agente";
      consecutiveCount = 0;
    }
    consecutiveCount++;

    const minutes = Math.floor(startTime / 60);
    const seconds = Math.floor(startTime % 60);
    const timestamp = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    const cleanText = text.replace(noiseTags, "").replace(/\s+/g, " ").trim();
    formattedTranscription += `[${timestamp}] ${currentSpeaker}: ${cleanText}\n`;
    lastEndTime = endTime;

    // Mark significant silences
    const nextSeg = validSegments[index + 1];
    if (nextSeg) {
      const silenceDuration = (nextSeg.start || 0) - endTime;
      if (silenceDuration >= 2) {
        const sMin = Math.floor(endTime / 60);
        const sSec = Math.floor(endTime % 60);
        formattedTranscription += `[${sMin}:${sSec.toString().padStart(2, "0")}] Silencio: ${Math.round(silenceDuration)} segundos\n`;
      }
    }
  });

  return formattedTranscription;
}

// ========== HELPER: Diarize using GPT (Colab-style approach) ==========
async function diarizeWithGPT(text: string, openaiKey: string): Promise<string> {
  if (!text || text.trim().length < 50) return text;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Eres un experto en análisis de llamadas de call center en Latinoamérica.
Recibes la transcripción completa de una llamada entre un AGENTE y un CLIENTE.
Tu tarea es reformatear el texto separando los turnos de cada hablante.

Identifica quién es el AGENTE (hace preguntas comerciales, ofrece productos, sigue un guión, saluda identificándose con nombre o empresa)
y quién es el CLIENTE (responde, hace preguntas sobre el servicio, puede estar inconforme, da datos personales).

Reglas estrictas:
- Divide el texto en turnos lógicos de conversación.
- Estima marcas de tiempo de forma lógica empezando en [0:00].
- Cada turno empieza en una línea nueva con el formato EXACTO: [M:SS] Agente: texto   o   [M:SS] Cliente: texto
- Si hay duda en un fragmento, asígnalo al hablante más probable por contexto.
- Conserva TODO el texto original, no resumas ni elimines contenido.
- No agregues comentarios, solo el diálogo formateado.

Transcripción:
${text.substring(0, 15000)}`,
          },
        ],
        temperature: 0,
        max_tokens: 16000,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      let formatted = result.choices[0].message.content || text;
      // Normalize labels
      formatted = formatted
        .replace(/\[AGENTE\]\s*:/gi, "Agente:")
        .replace(/\[CLIENTE\]\s*:/gi, "Cliente:")
        .replace(/^AGENTE\s*:/gim, "Agente:")
        .replace(/^CLIENTE\s*:/gim, "Cliente:")
        .replace(/^Asesor\s*:/gim, "Agente:");
      return formatted;
    }
  } catch (e) {
    console.error("GPT diarization failed:", e);
  }

  // Fallback: simple sentence alternation
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  let speaker = "Agente";
  return sentences
    .map((s, i) => {
      const ts = `${Math.floor((i * 8) / 60)}:${((i * 8) % 60).toString().padStart(2, "0")}`;
      const line = `[${ts}] ${speaker}: ${s.trim()}.`;
      if ((i + 1) % 2 === 0) speaker = speaker === "Agente" ? "Cliente" : "Agente";
      return line;
    })
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ========== HELPER: Generate summary ==========
async function generateSummary(transcription: string, openaiKey: string, customPrompt?: string): Promise<string> {
  if (!transcription || transcription.length < 50) return "Contenido insuficiente para resumen";

  const basePrompt =
    customPrompt ||
    `Crea un resumen conciso de esta llamada de servicio al cliente.
INSTRUCCIONES: Usa ÚNICAMENTE la información de la transcripción. NO inventes datos.
Incluye: tema principal, participantes, acciones tomadas, resultado.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: basePrompt },
          {
            role: "user",
            content: `Resume esta transcripción (solo datos reales):\n\n${transcription.substring(0, 6000)}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content?.trim() || "No se pudo generar resumen";
    }
  } catch (e) {
    console.error("Summary generation failed:", e);
  }
  return `Resumen automático: ${transcription.substring(0, 300)}...`;
}

// ========== HELPER: Detect call topic ==========
async function detectCallTopic(transcription: string, summary: string, openaiKey: string): Promise<string> {
  if (!transcription || transcription.length < 50) return "Consulta general";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Identifica el tema principal de esta llamada. Responde SOLO con la categoría:
Consulta general, Soporte técnico, Información de productos, Reclamos, Activación de servicios, Facturación, Seguimiento, Ventas, Cancelaciones, Otro`,
          },
          { role: "user", content: `Transcripción: ${transcription.substring(0, 2000)}\n\nResumen: ${summary}` },
        ],
        max_tokens: 30,
        temperature: 0.1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content?.trim() || "Consulta general";
    }
  } catch (e) {
    console.error("Topic detection failed:", e);
  }
  return "Consulta general";
}

// ========== MAIN HANDLER ==========
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { audio_file_id, account_id, prompt_id } = await req.json();
    if (!audio_file_id || !account_id) throw new Error("Missing audio_file_id or account_id");

    // Get audio file info
    const { data: audioFile, error: audioErr } = await supabaseAdmin
      .from("audio_files")
      .select("*")
      .eq("id", audio_file_id)
      .single();
    if (audioErr || !audioFile) throw new Error("Audio file not found");

    // Check if already completed
    if (audioFile.status === "completed") {
      console.log("Audio already completed, skipping:", audio_file_id);
      return new Response(JSON.stringify({ success: true, message: "Already completed", audio_file_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();

    // Update status to transcribing
    await supabaseAdmin.from("audio_files").update({ status: "transcribing" }).eq("id", audio_file_id);

    // Create processing job
    const { data: job } = await supabaseAdmin
      .from("processing_jobs")
      .insert({
        audio_file_id,
        account_id,
        prompt_id: prompt_id || null,
        job_type: "full",
        status: "transcribing",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Download audio - try account bucket first, then shared bucket
    let fileData: Blob | null = null;
    const accountBucket = `account-${account_id}`;

    const { data: accData } = await supabaseAdmin.storage.from(accountBucket).download(audioFile.file_path);

    if (accData) {
      fileData = accData;
    } else {
      const { data: sharedData, error: downloadErr } = await supabaseAdmin.storage
        .from("audio-files")
        .download(audioFile.file_path);
      if (downloadErr || !sharedData) throw new Error("Failed to download audio: " + downloadErr?.message);
      fileData = sharedData;
    }

    // ========== ETAPA 1: TRANSCRIPCIÓN con cascada multi-proveedor ==========
    console.log("🎤 Starting transcription for:", audioFile.file_name);
    const audioBuffer = await fileData!.arrayBuffer();
    const mimeType = audioFile.mime_type || "audio/mpeg";
    const fileSizeMB = audioBuffer.byteLength / 1024 / 1024;

    let transcriptionResult: TranscriptionResult | null = null;
    let rawText = "";
    let segments: any[] = [];
    let duration = 0;
    let detectedLang = "es";
    let usedModel = "";
    let usedProvider = "";
    let nativeDiarization = false;
    let nativeFormattedText = "";

    // Try multi-provider cascade first
    try {
      const providerConfigs = await loadProviderConfig(supabaseAdmin);
      console.log(`🔄 Using global multi-provider cascade with ${providerConfigs.filter(p => p.enabled).length} enabled provider(s)`);

      // Generate signed URL for providers that need URL access (AssemblyAI, Deepgram)
      let audioSignedUrl = "";
      try {
        const accountBucketName = `account-${account_id}`;
        const { data: signData } = await supabaseAdmin.storage
          .from(accountBucketName)
          .createSignedUrl(audioFile.file_path, 3600);
        if (signData?.signedUrl) {
          audioSignedUrl = signData.signedUrl;
        } else {
          const { data: sharedSignData } = await supabaseAdmin.storage
            .from("audio-files")
            .createSignedUrl(audioFile.file_path, 3600);
          audioSignedUrl = sharedSignData?.signedUrl || "";
        }
      } catch (e) {
        console.warn("⚠️ Could not generate signed URL for cascade providers:", e);
      }

      transcriptionResult = await transcribeWithCascade(
        audioSignedUrl,
        audioBuffer,
        providerConfigs,
        { fileName: audioFile.file_name, mimeType, fileSizeMB },
      );

      rawText = transcriptionResult.text;
      duration = transcriptionResult.duration;
      detectedLang = transcriptionResult.language;
      usedModel = transcriptionResult.model;
      usedProvider = transcriptionResult.provider;
      nativeDiarization = transcriptionResult.hasDiarization;
      nativeFormattedText = transcriptionResult.formattedText || "";

    } catch (cascadeError: any) {
      console.error("❌ Multi-provider cascade failed:", cascadeError.message);
      console.log("⚠️ Falling back to legacy OpenAI-only transcription...");

      // Legacy fallback: original chunk + OpenAI fallback logic
      const chunks = splitAudioIntoChunks(audioBuffer, mimeType);
      try {
        const legacyResult = await transcribeWithFallback(chunks, audioFile.file_name, openaiKey);
        rawText = legacyResult.text;
        segments = legacyResult.segments;
        duration = legacyResult.duration;
        detectedLang = legacyResult.language;
        usedModel = legacyResult.model;
        usedProvider = "openai";
      } catch (e: any) {
        console.error("All transcription attempts failed:", e.message);
        await supabaseAdmin.from("audio_files").update({ status: "error" }).eq("id", audio_file_id);
        if (job) {
          await supabaseAdmin
            .from("processing_jobs")
            .update({
              status: "error",
              error_message: e.message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
        throw e;
      }
    }

    const transcriptionTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`📝 Transcripción completada en ${transcriptionTime}s con ${usedProvider}/${usedModel}: ${rawText.length} caracteres`);

    // ========== ETAPA 1.5: DIARIZACIÓN DE HABLANTES ==========
    let formattedTranscription: string;

    if (nativeDiarization && nativeFormattedText && nativeFormattedText.trim().length > 50) {
      // Use native diarization from the provider (AssemblyAI / Deepgram)
      console.log(`🔍 Usando diarización nativa de ${usedProvider} (${transcriptionResult?.segments?.length || 0} segmentos)...`);
      formattedTranscription = nativeFormattedText;
    } else {
      // Use GPT-based diarization (for OpenAI or when native diarization is insufficient)
      console.log("🔍 Iniciando diarización de hablantes con GPT...");
      formattedTranscription = await diarizeWithGPT(rawText, openaiKey);
    }

    // Validate transcription quality
    const hasValidContent = formattedTranscription && formattedTranscription.trim().length > 50;

    // Update audio file with transcription
    await supabaseAdmin
      .from("audio_files")
      .update({
        duration_seconds: Math.round(duration),
        status: "transcribed",
      })
      .eq("id", audio_file_id);

    // Save transcription
    const { data: transcription } = await supabaseAdmin
      .from("transcriptions")
      .insert({
        audio_file_id,
        account_id,
        full_text: formattedTranscription || rawText,
        language: detectedLang,
      })
      .select()
      .single();

    // Save segments with speaker labels
    if (segments && segments.length > 0 && transcription) {
      // Parse formatted transcription to extract speaker labels per segment
      const lines = formattedTranscription.split("\n").filter((l) => l.includes("Agente:") || l.includes("Cliente:"));

      const segmentRows = segments
        .filter((s) => s.text && s.text.trim().length > 2)
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map((s: any, i: number) => {
          // Try to match speaker from formatted transcription
          let speaker = "Desconocido";
          if (lines[i]) {
            if (lines[i].includes("Agente:")) speaker = "Agente";
            else if (lines[i].includes("Cliente:")) speaker = "Cliente";
          } else {
            speaker = i % 2 === 0 ? "Agente" : "Cliente";
          }

          return {
            transcription_id: transcription.id,
            speaker,
            start_time: s.start || 0,
            end_time: s.end || 0,
            text: s.text?.trim() || "",
            sentiment: "neutral",
            sentiment_score: 0.5,
          };
        });

      if (segmentRows.length > 0) {
        await supabaseAdmin.from("transcription_segments").insert(segmentRows);
      }
    }

    // ========== STAGE 2: SUMMARY GENERATION ==========
    console.log("📊 Generating summary...");
    await supabaseAdmin.from("audio_files").update({ status: "analyzing" }).eq("id", audio_file_id);
    if (job)
      await supabaseAdmin
        .from("processing_jobs")
        .update({ status: "analyzing" as any })
        .eq("id", job.id);

    const summary = await generateSummary(formattedTranscription || rawText, openaiKey);
    const summaryTime = Math.round((Date.now() - startTime) / 1000) - transcriptionTime;

    // ========== STAGE 3: TOPIC DETECTION ==========
    console.log("🎯 Detecting call topic...");
    const callTopic = await detectCallTopic(formattedTranscription || rawText, summary, openaiKey);

    // Update audio file with summary and topic
    await supabaseAdmin
      .from("audio_files")
      .update({
        summary,
        call_topic: callTopic,
      })
      .eq("id", audio_file_id);

    // ========== STAGE 4: ANALYSIS with selected prompt ==========
    console.log("🔍 Starting analysis with prompt...");

    let systemInstructions = `Eres un analista experto en conversaciones de atención al cliente y ventas.
Tu prioridad es evaluar la CALIDAD DE GESTIÓN DEL ASESOR bajo estos criterios:

1. AMABILIDAD (0-30 pts): Cordialidad, empatía, uso de normas de cortesía. Si el asesor es grosero o prepotente, este puntaje es 0.
2. GESTIÓN Y SOLUCIÓN (0-40 pts): Capacidad para entender al cliente, brindar soluciones reales, manejo de herramientas y agilidad.
3. PROTOCOLO (0-30 pts): Saludo inicial, validación de datos, ofrecimiento de servicios adicionales y cierre correcto.

REGLAS DE ORO:
- Si el asesor es GROSERO o falta al respeto: El score final TOTAL no puede superar los 30 puntos.
- Si el asesor cuelga la llamada deliberadamente o da información falsa: El score final TOTAL no puede superar los 40 puntos.

Analiza la transcripción y devuelve un JSON con:
{
  "summary": "resumen ejecutivo breve",
  "overall_sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": 0.0-1.0,
  "tags": ["etiqueta1", "etiqueta2"],
  "score": 0-100,
  "positive": ["aspecto positivo 1"],
  "negative": ["aspecto negativo 1"],
  "opportunities": ["oportunidad 1"],
  "insights": [
    { "title": "título", "description": "descripción", "category": "dolor|oportunidad|cumplimiento|riesgo", "severity": "low|medium|high|critical" }
  ],
  "entities": ["entidad1"],
  "topics": ["tema1"],
  "segment_sentiments": [
    { "index": 0, "sentiment": "positive|negative|neutral", "score": 0.85 }
  ]
}
`;

    if (prompt_id) {
      const { data: prompt } = await supabaseAdmin.from("prompts").select("*").eq("id", prompt_id).single();
      if (prompt?.system_instructions) {
        systemInstructions = prompt.system_instructions;
      }
    }

    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstructions },
          {
            role: "user",
            content: `Analiza esta transcripción y devuelve SOLO JSON válido:\n\nRESUMEN: ${summary}\n\nTRANSCRIPCIÓN:\n${(formattedTranscription || rawText).substring(0, 8000)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    let analysisData = {
      summary: summary,
      overall_sentiment: "neutral",
      sentiment_score: 0.5,
      tags: [] as string[],
      score: 50,
      positive: [] as string[],
      negative: [] as string[],
      opportunities: [] as string[],
      insights: [] as any[],
      entities: [] as string[],
      topics: [callTopic],
      segment_sentiments: [] as any[],
    };

    if (analysisResponse.ok) {
      const analysisResult = await analysisResponse.json();
      try {
        const parsed = JSON.parse(analysisResult.choices[0].message.content);
        analysisData = {
          summary: parsed.summary || summary,
          overall_sentiment: parsed.overall_sentiment || "neutral",
          sentiment_score: parsed.sentiment_score || 0.5,
          tags: parsed.tags || [],
          score: Math.max(0, Math.min(100, parsed.score || 50)),
          positive: parsed.positive || [],
          negative: parsed.negative || [],
          opportunities: parsed.opportunities || [],
          insights: parsed.insights || [],
          entities: parsed.entities || [],
          topics: parsed.topics || [callTopic],
          segment_sentiments: parsed.segment_sentiments || [],
        };
      } catch (e) {
        console.error("Failed to parse analysis JSON:", e);
      }
    }

    // Update segment sentiments
    if (analysisData.segment_sentiments?.length > 0 && transcription) {
      const { data: savedSegments } = await supabaseAdmin
        .from("transcription_segments")
        .select("id")
        .eq("transcription_id", transcription.id)
        .order("start_time", { ascending: true });

      if (savedSegments) {
        for (const ss of analysisData.segment_sentiments) {
          const seg = savedSegments[ss.index];
          if (seg) {
            await supabaseAdmin
              .from("transcription_segments")
              .update({
                sentiment: ss.sentiment,
                sentiment_score: ss.score,
              })
              .eq("id", seg.id);
          }
        }
      }
    }

    // Update audio file sentiment
    await supabaseAdmin
      .from("audio_files")
      .update({
        sentiment: analysisData.overall_sentiment,
      })
      .eq("id", audio_file_id);

    // Save analysis
    await supabaseAdmin.from("analyses").insert({
      audio_file_id,
      account_id,
      prompt_id: prompt_id || null,
      created_by: user.id,
      summary: analysisData.summary,
      overall_sentiment: analysisData.overall_sentiment,
      sentiment_score: analysisData.sentiment_score,
      tags: analysisData.tags,
      insights: analysisData.insights,
      results: {
        ...analysisData,
        score: analysisData.score,
        positive: analysisData.positive,
        negative: analysisData.negative,
        opportunities: analysisData.opportunities,
      },
    });

    // ========== FINALIZE ==========
    await supabaseAdmin.from("audio_files").update({ status: "completed" }).eq("id", audio_file_id);
    if (job) {
      await supabaseAdmin
        .from("processing_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    // Track usage
    const durationHours = duration / 3600;
    try {
      await supabaseAdmin.rpc("increment_usage", {
        p_account_id: account_id,
        p_transcription_hours: Math.round(durationHours * 100) / 100,
        p_chatbot_queries: 0,
        p_files_processed: 1,
      });
    } catch (e) {
      console.error("Usage tracking error:", e);
    }

    // Audit log
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      account_id,
      module: "audio_processing",
      action: "process_audio",
      detail: `Procesado: ${audioFile.file_name} | Proveedor: ${usedProvider} | Modelo: ${usedModel} | ${totalTime}s total | Score: ${analysisData.score}`,
      result: "success",
    });

    console.log(`✅ Processing complete for ${audioFile.file_name} in ${totalTime}s`);

    return new Response(
      JSON.stringify({
        success: true,
        transcription_id: transcription?.id,
        audio_file_id,
        model: usedModel,
        score: analysisData.score,
        callTopic,
        processingTime: totalTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("process-audio error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
