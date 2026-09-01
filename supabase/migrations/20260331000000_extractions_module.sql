CREATE TYPE public.extraction_source AS ENUM ('filename', 'transcription_cliente', 'transcription_asesor', 'summary');
CREATE TYPE public.extraction_type AS ENUM ('split', 'keyword_mapping');

CREATE TABLE public.extraction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source public.extraction_source NOT NULL,
    extraction_type public.extraction_type NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.call_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_file_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES public.extraction_rules(id) ON DELETE CASCADE,
    extracted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_extraction_rules_account ON public.extraction_rules(account_id);
CREATE INDEX idx_call_extractions_audio ON public.call_extractions(audio_file_id);
CREATE INDEX idx_call_extractions_rule ON public.call_extractions(rule_id);

-- RLS
ALTER TABLE public.extraction_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_extractions ENABLE ROW LEVEL SECURITY;

-- Policy for extraction_rules
CREATE POLICY "Extraction rules account access" ON public.extraction_rules FOR SELECT TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Extraction rules insert" ON public.extraction_rules FOR INSERT TO authenticated
  WITH CHECK (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Extraction rules update" ON public.extraction_rules FOR UPDATE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));
CREATE POLICY "Extraction rules delete" ON public.extraction_rules FOR DELETE TO authenticated
  USING (public.user_has_account_access(auth.uid(), account_id));

-- Policy for call_extractions
CREATE POLICY "Call extractions access" ON public.call_extractions FOR SELECT TO authenticated
  USING (audio_file_id IN (SELECT id FROM public.audio_files WHERE public.user_has_account_access(auth.uid(), account_id)));
CREATE POLICY "System insert call extractions" ON public.call_extractions FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "System delete call extractions" ON public.call_extractions FOR DELETE TO authenticated
  USING (audio_file_id IN (SELECT id FROM public.audio_files WHERE public.user_has_account_access(auth.uid(), account_id)));
