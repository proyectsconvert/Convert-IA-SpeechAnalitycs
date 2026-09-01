
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function updateCallInDatabase(
  supabase: SupabaseClient,
  callId: string,
  updates: {
    status?: string;
    progress?: number;
    transcription?: string;
    summary?: string;
    sentiment?: string;
    entities?: string[];
    topics?: string[];
    call_topic?: string;
    content_embedding?: string;
  }
) {
  try {
    // Prepare the update object with proper field mapping
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Map each field correctly
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.progress !== undefined) updateData.progress = updates.progress;
    if (updates.transcription !== undefined) updateData.transcription = updates.transcription;
    if (updates.summary !== undefined) updateData.summary = updates.summary;
    if (updates.sentiment !== undefined) updateData.sentiment = updates.sentiment;
    if (updates.entities !== undefined) updateData.entities = updates.entities;
    if (updates.topics !== undefined) updateData.topics = updates.topics;
    if (updates.call_topic !== undefined) updateData.call_topic = updates.call_topic;
    
    // Handle content_embedding with proper validation
    if (updates.content_embedding !== undefined) {
      if (updates.content_embedding === null) {
        updateData.content_embedding = null;
      } else if (typeof updates.content_embedding === 'string') {
        // Validate that it's a proper vector format
        if (updates.content_embedding.startsWith('[') && updates.content_embedding.endsWith(']')) {
          updateData.content_embedding = updates.content_embedding;
        } else {
          console.warn('⚠️ Invalid content_embedding format, skipping:', updates.content_embedding);
        }
      }
    }

    console.log('📝 Updating call with data:', { 
      callId, 
      fields: Object.keys(updateData),
      hasEmbedding: !!updateData.content_embedding
    });

    const { error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', callId);

    if (error) {
      console.error('❌ Error updating call in database:', error);
      throw error;
    }

    console.log(`✅ Call ${callId} updated successfully with fields:`, Object.keys(updateData));
  } catch (error) {
    console.error('❌ Database update failed:', error);
    throw error;
  }
}
