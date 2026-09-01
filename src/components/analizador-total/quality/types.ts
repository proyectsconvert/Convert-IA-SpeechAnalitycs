export type Affectation = "none" | "mp" | "riesgo" | "critico";
export type SectionKind = "regular" | "critical";
export type EvalStatus = "cumple" | "no_cumple" | "na" | "critico";

export interface QualityMatrixVersion {
  id: string;
  account_id: string;
  version: number;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QualityMatrixSection {
  id: string;
  version_id: string;
  name: string;
  kind: SectionKind;
  sort_order: number;
}

export interface QualityMatrixItem {
  id: string;
  section_id: string;
  attribute: string;
  sub_attribute: string | null;
  description: string | null;
  max_score: number;
  affectation: Affectation;
  is_active: boolean;
  sort_order: number;
}

export interface QualityEvaluation {
  id: string;
  account_id: string;
  matrix_version_id: string;
  source_type: "call" | "whatsapp";
  audio_file_id: string | null;
  whatsapp_conversation_id: string | null;
  agent_name: string | null;
  total_score: number;
  max_total_score: number;
  percent_score: number;
  has_critical_error: boolean;
  summary: string | null;
  created_at: string;
}

export interface QualityEvaluationItem {
  id: string;
  evaluation_id: string;
  item_id: string | null;
  section_name: string | null;
  attribute: string | null;
  sub_attribute: string | null;
  affectation: string | null;
  status: EvalStatus;
  score: number;
  max_score: number;
  observation: string | null;
}
