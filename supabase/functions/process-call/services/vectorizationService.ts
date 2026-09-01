
export async function generateContentEmbedding(text: string): Promise<number[] | null> {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('❌ OpenAI API key not configured for embeddings');
      return null;
    }

    console.log('🔄 Generating content embedding...');

    // Preparar el texto para embedding (máximo 8000 caracteres para ser eficiente)
    const cleanText = text.substring(0, 8000).replace(/\s+/g, ' ').trim();

    if (cleanText.length < 10) {
      console.warn('⚠️ Text too short for embedding');
      return null;
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: cleanText,
        encoding_format: 'float'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI embeddings error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.error('❌ Invalid embedding response');
      return null;
    }

    console.log('✅ Content embedding generated successfully:', embedding.length, 'dimensions');
    return embedding;

  } catch (error) {
    console.error('❌ Error generating content embedding:', error);
    return null;
  }
}

export function prepareContentForEmbedding(call: any): string {
  const parts = [];
  
  if (call.title) {
    parts.push(`Título: ${call.title}`);
  }
  
  if (call.agent_name) {
    parts.push(`Agente: ${call.agent_name}`);
  }
  
  if (call.summary) {
    parts.push(`Resumen: ${call.summary}`);
  }
  
  if (call.topics && Array.isArray(call.topics) && call.topics.length > 0) {
    parts.push(`Temas: ${call.topics.join(', ')}`);
  }
  
  if (call.call_topic) {
    parts.push(`Categoría: ${call.call_topic}`);
  }
  
  if (call.entities && Array.isArray(call.entities) && call.entities.length > 0) {
    parts.push(`Entidades: ${call.entities.join(', ')}`);
  }
  
  if (call.transcription) {
    const transcriptionPreview = call.transcription.substring(0, 2000);
    parts.push(`Transcripción: ${transcriptionPreview}`);
  }
  
  return parts.join('\n');
}
