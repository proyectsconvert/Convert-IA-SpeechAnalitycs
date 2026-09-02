// fetch is natively available in Supabase Edge Functions — no polyfill needed
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./utils/cors.ts";
import { transcribeAudio } from "./services/transcriptionService.ts";
import { generateSummary, detectCallTopic } from "./services/summaryService.ts";
import { generateFeedback } from "./services/feedbackService.ts";
import { processExtractions } from "./services/extractionService.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let audioFileId: string | null = null;
  let accountId: string | null = null;
  let jobId: string | null = null;

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const internalHeader = req.headers.get("x-remote-import-internal") || req.headers.get("x-internal-token");
    // Accept service role key directly, or via an internal header while using anon Authorization
    // so gateway-level JWT checks cannot block SFTP auto-processing.
    const isServiceRole = token === supabaseServiceKey || internalHeader === supabaseServiceKey;
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const body = await req.json();
    // Support both callId (original) and audio_file_id (this project)
    audioFileId = body.audio_file_id || body.callId;
    accountId = body.account_id;
    const promptId = body.prompt_id;
    const qualityMatrixId = body.quality_matrix_id;
    const summaryPrompt = body.summaryPrompt;
    const feedbackPrompt = body.feedbackPrompt;

    console.log('🚀 Processing call request ENHANCED:', {
      audioFileId,
      accountId,
      promptId: promptId ? 'provided' : 'not provided',
      qualityMatrixId: qualityMatrixId ? 'provided' : 'not provided',
      summaryPrompt: summaryPrompt ? 'provided' : 'not provided',
      feedbackPrompt: feedbackPrompt ? 'provided' : 'not provided',
    });

    if (!audioFileId || !accountId) {
      throw new Error('Missing required parameter: audio_file_id or account_id');
    }

    // Get audio file data
    const { data: audioFile, error: fetchError } = await supabase
      .from('audio_files')
      .select('*')
      .eq('id', audioFileId)
      .single();

    if (fetchError || !audioFile) {
      console.error('❌ Error fetching audio file:', fetchError);
      throw new Error('Could not fetch audio file data');
    }

    // Verificar si ya está completada
    if (audioFile.status === 'completed') {
      console.log('✅ Already completed, skipping:', audioFileId);
      return new Response(
        JSON.stringify({ success: true, message: 'Already completed', alreadyCompleted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();

    // Create processing job
    const { data: job } = await supabase
      .from('processing_jobs')
      .insert({
        audio_file_id: audioFileId,
        account_id: accountId,
        prompt_id: promptId || null,
        job_type: 'full',
        status: 'transcribing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    jobId = job?.id ?? null;

    // Bucket audio-files es privado: getPublicUrl no sirve para fetch desde Edge.
    // URL firmada (service role) permite descargar el objeto durante la transcripción.
    const signTtlSec = 60 * 60; // 1 h
    let audioUrl: string | null = null;
    const trySign = async (objectPath: string) => {
      const { data, error } = await supabase.storage
        .from("audio-files")
        .createSignedUrl(objectPath, signTtlSec);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    };

    audioUrl = await trySign(audioFile.file_path);
    if (!audioUrl) {
      audioUrl = await trySign(`${accountId}/${audioFile.file_path}`);
    }
    if (!audioUrl) {
      throw new Error("No se pudo generar URL firmada para el audio en Storage (¿existe el archivo?)");
    }

    console.log("🔍 Audio: usando URL firmada de Storage (bucket privado)");

    // === STAGE 1: TRANSCRIPCIÓN ===
    console.log('🎤 Starting transcription stage...');
    await supabase.from('audio_files').update({ status: 'transcribing' }).eq('id', audioFileId);

    let transcription;
    try {
      transcription = await transcribeAudio(audioUrl, accountId, supabase);
    } catch (transcriptionError: any) {
      console.error('❌ Transcription failed:', transcriptionError);
      await supabase.from('audio_files').update({ status: 'error' }).eq('id', audioFileId);
      if (jobId) {
        await supabase.from('processing_jobs').update({
          status: 'error',
          error_message: transcriptionError.message,
          completed_at: new Date().toISOString()
        }).eq('id', jobId);
      }
      throw new Error(`Transcription failed: ${transcriptionError.message}`);
    }

    const transcriptionTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`📝 Transcription completed in ${transcriptionTime}s: ${transcription.length} chars`);

    // Validación de calidad
    const isValidTranscription = transcription &&
      !transcription.includes('No hay transcripción disponible') &&
      transcription.trim().length > 100 &&
      (transcription.includes('Asesor:') || transcription.includes('Cliente:') || transcription.includes('['));

    // Detect real duration from MP3 header bitrate
    let estimatedDuration = audioFile.duration_seconds || 0;
    if (estimatedDuration <= 0 && audioFile.file_size_bytes && audioUrl) {
      try {
        const headerRes = await fetch(audioUrl, {
          headers: { Range: 'bytes=0-16383' },
        });
        const headerBuf = new Uint8Array(await headerRes.arrayBuffer());
        const bitrate = detectMp3Bitrate(headerBuf);
        if (bitrate > 0) {
          estimatedDuration = Math.round((audioFile.file_size_bytes * 8) / bitrate);
          console.log(`🎵 Detected bitrate: ${bitrate}bps → duration: ${estimatedDuration}s`);
        } else {
          estimatedDuration = Math.round(audioFile.file_size_bytes / 2000);
        }
      } catch (e) {
        console.warn('⚠️ Bitrate detection failed, using fallback:', e);
        estimatedDuration = Math.round(audioFile.file_size_bytes / 2000);
      }
    }
    // Try to extract from timestamps in transcription
    if (estimatedDuration <= 0 && transcription) {
      const timeMatches = transcription.match(/\[(\d+):(\d+)\]/g);
      if (timeMatches && timeMatches.length > 0) {
        const lastMatch = timeMatches[timeMatches.length - 1];
        const parts = lastMatch.match(/\[(\d+):(\d+)\]/);
        if (parts) {
          estimatedDuration = parseInt(parts[1]) * 60 + parseInt(parts[2]) + 30;
        }
      }
    }

    // Save transcription to transcriptions table
    await supabase.from('audio_files').update({
      status: 'transcribed',
      duration_seconds: Math.max(1, estimatedDuration)
    }).eq('id', audioFileId);

    const { data: transcriptionRecord } = await supabase
      .from('transcriptions')
      .insert({
        audio_file_id: audioFileId,
        account_id: accountId,
        full_text: transcription,
        language: 'es',
      })
      .select()
      .single();

    if (!isValidTranscription) {
      console.log('❌ Invalid transcription, completing with basic analysis');
      await supabase.from('audio_files').update({
        status: 'completed',
        call_topic: 'Sin contenido analizable',
        sentiment: 'neutral',
      }).eq('id', audioFileId);

      await supabase.from('analyses').insert({
        audio_file_id: audioFileId,
        account_id: accountId,
        prompt_id: promptId || null,
        summary: 'Contenido insuficiente para análisis',
        overall_sentiment: 'neutral',
        sentiment_score: 0.5,
        tags: [],
        insights: [],
        results: { score: 0, positive: [], negative: ['Transcripción insuficiente'], opportunities: [] },
      });

      if (jobId) {
        await supabase.from('processing_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', jobId);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'No analyzable content', transcriptionAvailable: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === STAGE 2: ANALYZING ===
    console.log('📊 Starting analysis stage...');
    await supabase.from('audio_files').update({ status: 'analyzing' }).eq('id', audioFileId);
    if (jobId) await supabase.from('processing_jobs').update({ status: 'analyzing' as any }).eq('id', jobId);

    // Get custom prompt instructions if provided
    let customSummaryPrompt = summaryPrompt;
    let customFeedbackPrompt = feedbackPrompt;
    let promptName = 'Predeterminado';

    if (promptId) {
      const { data: prompt } = await supabase.from('prompts').select('system_instructions, name').eq('id', promptId).single();
      if (prompt?.system_instructions) {
        // Use the prompt for BOTH summary and feedback to ensure alignment
        if (!customSummaryPrompt) customSummaryPrompt = prompt.system_instructions;
        if (!customFeedbackPrompt) customFeedbackPrompt = prompt.system_instructions;
        promptName = prompt.name || 'Personalizado';
      }
    }
    console.log(`📋 Using prompt: "${promptName}" for analysis`);

    // Generate summary
    const summaryStartTime = Date.now();
    let summary;
    try {
      summary = await generateSummary(transcription, customSummaryPrompt || undefined);
    } catch (e: any) {
      console.error('❌ Summary error:', e);
      summary = `Resumen automático: ${transcription.substring(0, 300)}...`;
    }
    const summaryTime = Math.round((Date.now() - summaryStartTime) / 1000);
    console.log(`📄 Summary generated in ${summaryTime}s`);

    // Detect topic
    const topicStartTime = Date.now();
    let callTopic;
    try {
      callTopic = await detectCallTopic(transcription, summary);
    } catch (e: any) {
      console.error('❌ Topic error:', e);
      callTopic = 'Consulta general';
    }
    console.log(`🎯 Topic: ${callTopic} in ${Math.round((Date.now() - topicStartTime) / 1000)}s`);

    // Update summary and topic
    await supabase.from('audio_files').update({
      summary: summary,
      call_topic: callTopic,
    }).eq('id', audioFileId);

    // Generate feedback
    const feedbackStartTime = Date.now();
    let feedbackResult;
    try {
      feedbackResult = await generateFeedback(transcription, summary, customFeedbackPrompt || undefined);
    } catch (e: any) {
      console.error('❌ Feedback error:', e);
      feedbackResult = {
        score: 50,
        positive: ['Transcripción procesada'],
        negative: ['Error en análisis detallado'],
        opportunities: ['Revisar configuración'],
        sentiment: 'neutral',
        entities: [],
        topics: [],
        behaviors_analysis: []
      };
    }
    const feedbackTime = Math.round((Date.now() - feedbackStartTime) / 1000);
    console.log(`💬 Feedback in ${feedbackTime}s, score: ${feedbackResult.score}`);

    // Save analysis
    await supabase.from('analyses').insert({
      audio_file_id: audioFileId,
      account_id: accountId,
      prompt_id: promptId || null,
      summary: summary,
      overall_sentiment: feedbackResult.sentiment,
      sentiment_score: feedbackResult.score / 100,
      tags: feedbackResult.topics || [],
      insights: [
        { title: 'Insights', description: feedbackResult.insights, category: 'AI', severity: 'info' },
        { title: 'Recomendaciones', description: feedbackResult.recommendations, category: 'AI', severity: 'medium' },
        { title: 'Conclusiones', description: feedbackResult.conclusions, category: 'AI', severity: 'high' }
      ],
      results: {
        score: feedbackResult.score,
        positive: feedbackResult.positive,
        negative: feedbackResult.negative,
        opportunities: feedbackResult.opportunities,
        entities: feedbackResult.entities,
        topics: feedbackResult.topics,
        analysis: feedbackResult.analysis_prompt_aligned,
        insights: feedbackResult.insights,
        recommendations: feedbackResult.recommendations,
        conclusions: feedbackResult.conclusions
      },
    });

    // === STAGE 3: EXTRACTIONS (RULE-BASED) ===
    console.log('🔍 Running rule-based extractions...');
    await processExtractions(supabase, accountId, audioFileId, audioFile.file_name, transcription, summary);

    // Final update
    await supabase.from('audio_files').update({
      status: 'completed',
      sentiment: feedbackResult.sentiment,
    }).eq('id', audioFileId);

    if (jobId) {
      await supabase.from('processing_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', jobId);
    }

    // Track usage
    try {
      await supabase.rpc('increment_usage', {
        p_account_id: accountId,
        p_transcription_hours: Math.round(((estimatedDuration || 0) / 3600) * 100) / 100,
        p_chatbot_queries: 0,
        p_files_processed: 1,
      });
    } catch { /* ignore */ }

    // Audit log
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    try {
      await supabase.from('audit_logs').insert({
        account_id: accountId,
        module: 'audio_processing',
        action: 'process_call',
        detail: `${audioFile.file_name} | ${totalTime}s | Score: ${feedbackResult.score}`,
        result: 'success',
      });
    } catch { /* ignore */ }

    // Quality matrix evaluation (only affects NEW analyses)
    try {
      const agentName = (audioFile?.metadata as any)?.agent || (audioFile?.metadata as any)?.agent_name || null;
      console.log('📊 Evaluando matriz de calidad para audioFileId:', audioFileId, 'qualityMatrixId:', qualityMatrixId);
      
      if (qualityMatrixId) {
        await supabase.from('audio_files').update({ quality_matrix_id: qualityMatrixId }).eq('id', audioFileId);
      }

      const evalRes = await fetch(`${supabaseUrl}/functions/v1/evaluate-quality`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
        },
        body: JSON.stringify({
          account_id: accountId,
          source_type: 'call',
          audio_file_id: audioFileId,
          agent_name: agentName,
          conversation_text: transcription || '',
          quality_matrix_id: qualityMatrixId || audioFile?.quality_matrix_id || null,
        }),
      });
      if (!evalRes.ok) {
        const errTxt = await evalRes.text();
        console.warn('evaluate-quality call warning:', evalRes.status, errTxt);
      } else {
        const evalData = await evalRes.json();
        console.log('✅ evaluate-quality completado:', evalData);
      }
    } catch (e: any) {
      console.warn('evaluate-quality dispatch error:', e?.message);
    }

    console.log(`✅ Done: ${audioFile.file_name} in ${totalTime}s`);

    return new Response(
      JSON.stringify({
        success: true,
        audio_file_id: audioFileId,
        callId: audioFileId,
        accountId: accountId,
        feedbackScore: feedbackResult.score,
        callTopic: callTopic,
        transcriptionAvailable: true,
        duration: estimatedDuration,
        processingTime: {
          total: totalTime,
          transcription: transcriptionTime,
          summary: summaryTime,
          feedback: feedbackTime,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error processing call:', error);

    if (audioFileId) {
      try {
        await supabase.from('audio_files').update({ status: 'error' }).eq('id', audioFileId);
        if (jobId) {
          await supabase.from('processing_jobs').update({
            status: 'error',
            error_message: error.message,
            completed_at: new Date().toISOString()
          }).eq('id', jobId);
        }
      } catch { /* ignore */ }
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Error interno del servidor',
        timestamp: new Date().toISOString(),
        audio_file_id: audioFileId || 'unknown'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// MP3 bitrate lookup tables (MPEG1 Layer 3)
const BITRATE_TABLE_V1_L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const BITRATE_TABLE_V2_L3 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];

function detectMp3Bitrate(buf: Uint8Array): number {
  // Skip ID3v2 tag if present
  let offset = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
                 ((buf[8] & 0x7f) << 7)  |  (buf[9] & 0x7f);
    offset = 10 + size;
  }

  // Scan for first valid MP3 sync frame
  const limit = Math.min(buf.length - 4, 16000);
  for (let i = offset; i < limit; i++) {
    if (buf[i] !== 0xFF) continue;
    const b1 = buf[i + 1];
    // Check sync bits (11 bits set)
    if ((b1 & 0xE0) !== 0xE0) continue;

    const mpegVersion = (b1 >> 3) & 0x03; // 0=2.5, 2=2, 3=1
    const layer = (b1 >> 1) & 0x03;       // 1=Layer3
    if (layer !== 1) continue; // Only Layer 3

    const bitrateIdx = (buf[i + 2] >> 4) & 0x0F;
    if (bitrateIdx === 0 || bitrateIdx === 15) continue;

    let kbps: number;
    if (mpegVersion === 3) {
      // MPEG1
      kbps = BITRATE_TABLE_V1_L3[bitrateIdx];
    } else {
      // MPEG2 / MPEG2.5
      kbps = BITRATE_TABLE_V2_L3[bitrateIdx];
    }

    if (kbps > 0) return kbps * 1000; // return bps
  }
  return 0;
}
