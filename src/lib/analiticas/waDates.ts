export function waCargaTimeMs(conv: { created_at?: string; start_date?: string | null }): number | null {
  const raw = conv.created_at || conv.start_date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

export function waAnalysisTimeMs(
  conv: { status?: string; id: string },
  waByConvId: Map<string, Record<string, unknown>>,
): number | null {
  if (conv.status !== "analizado") return null;
  const r = waByConvId.get(conv.id);
  const raw = (r?.analyzed_at || r?.created_at) as string | undefined;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}
