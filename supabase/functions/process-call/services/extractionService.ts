import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ExtractionRule {
  id: string;
  name: string;
  source: 'filename' | 'transcription_cliente' | 'transcription_asesor' | 'summary';
  extraction_type: 'split' | 'keyword_mapping';
  config: any;
}

export async function processExtractions(
  supabase: SupabaseClient,
  accountId: string,
  audioFileId: string,
  fileName: string,
  transcription: string,
  summary: string
) {
  console.log('🔄 Starting Rule-based Extractions...');
  try {
    // 1. Fetch rules for the account
    const { data: rules, error } = await supabase
      .from('extraction_rules')
      .select('*')
      .eq('account_id', accountId);

    if (error) {
      console.error('❌ Error fetching extraction rules:', error);
      return;
    }

    if (!rules || rules.length === 0) {
      console.log('ℹ️ No extraction rules configured for this account.');
      return;
    }

    console.log(`📋 Found ${rules.length} extraction rules to process.`);

    // 2. Prepare source texts
    const clienteText = transcription
      .split('\n')
      .filter(line => line.toLowerCase().includes('cliente:'))
      .join(' ')
      .toLowerCase();

    const asesorText = transcription
      .split('\n')
      .filter(line => line.toLowerCase().includes('asesor:'))
      .join(' ')
      .toLowerCase();

    const summaryText = (summary || '').toLowerCase();
    
    // Create new extractions payload
    const extractionsToInsert: any[] = [];

    // 3. Process each rule (omit reglas exclusivas de WhatsApp)
    for (const rule of rules as ExtractionRule[]) {
      const cfg = rule.config as Record<string, unknown> | undefined;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg) && cfg.targetChannel === 'whatsapp') {
        continue;
      }

      let sourceText = '';
      
      switch (rule.source) {
        case 'filename':
          sourceText = fileName;
          break;
        case 'transcription_cliente':
          sourceText = clienteText;
          break;
        case 'transcription_asesor':
          sourceText = asesorText;
          break;
        case 'summary':
          sourceText = summaryText;
          break;
      }

      let extractedValue: string | null = null;

      try {
        if (rule.extraction_type === 'split' && rule.config) {
          const separator = rule.config.separator || '_';
          const index = rule.config.index || 0;
          const parts = sourceText.split(separator);
          if (parts.length > index) {
            extractedValue = parts[index].trim();
          }
        } 
        else if (rule.extraction_type === 'keyword_mapping' && rule.config && Array.isArray(rule.config)) {
          // rule.config should be: [{ keywords: ["comprar", "pago"], output: "Exitoso" }]
          for (const mapping of rule.config) {
            const keywords: string[] = mapping.keywords || [];
            // Check if ANY keyword matches
            const matchFound = keywords.some(kw => sourceText.includes(kw.toLowerCase()));
            if (matchFound) {
              extractedValue = mapping.output;
              break; // Mapea al primero que encuentre y se detiene
            }
          }
        }
      } catch (err) {
        console.error(`⚠️ Error applying rule ${rule.name}:`, err);
      }

      if (extractedValue) {
        extractionsToInsert.push({
          audio_file_id: audioFileId,
          rule_id: rule.id,
          extracted_value: extractedValue
        });
        console.log(`   ✅ Extracted [${rule.name}]: ${extractedValue}`);
      }
    }

    // 4. Insert matches into db
    if (extractionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('call_extractions')
        .insert(extractionsToInsert);
        
      if (insertError) {
        console.error('❌ Error saving call extractions:', insertError);
      } else {
        console.log(`💾 Saved ${extractionsToInsert.length} extractions successfully.`);
      }
    }

  } catch (err) {
    console.error('❌ Fatal error in extractions processor:', err);
  }
}
