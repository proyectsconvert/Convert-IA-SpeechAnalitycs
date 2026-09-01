import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Sparkles,
  MessageSquare,
  FileText,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  CheckCircle2,
  Compass,
  ScrollText,
  Phone,
  MessageCircle,
  ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { normalizeWhatsappAnalysisForInsights } from "@/lib/analysis/normalizeWhatsappAnalysis";
import type { AnalizadorUnifiedRow } from "@/components/analizador-total/types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  row: AnalizadorUnifiedRow;
}

/* ───── helpers ───── */

const toArray = (v: unknown): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x == null) return "";
        if (typeof x === "string") return x;
        if (typeof x === "number" || typeof x === "boolean") return String(x);
        if (typeof x === "object") {
          const obj = x as Record<string, unknown>;
          return String(
            obj.descripcion ?? obj.description ?? obj.text ?? obj.titulo ?? obj.title ?? obj.detalle ?? JSON.stringify(obj),
          );
        }
        return String(x);
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n|·|•|–|—|;|(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/)
      .map((s) => s.replace(/^[\s\-*•·]+/, "").trim())
      .filter(Boolean);
  }
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .flatMap((x) => toArray(x));
  }
  return [String(v)];
};

const pickFirst = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const found = Object.keys(obj).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (found && obj[found] != null && obj[found] !== "") return obj[found];
  }
  return null;
};

import { formatCleanSummary } from "@/lib/utils/formatSummary";

/* Renderiza un párrafo de texto de un valor flexible */
const renderText = (v: unknown): string => {
  if (v == null) return "";
  return formatCleanSummary(v);
};

/* ───── parser de transcripción de voz ───── */

interface ConvTurn {
  who: "agente" | "cliente" | "otro";
  label: string;
  text: string;
  ts?: string;
}

const parseConversation = (raw: string, channel: "call" | "whatsapp"): ConvTurn[] => {
  if (!raw?.trim()) return [];
  const turns: ConvTurn[] = [];

  if (channel === "whatsapp") {
    // Formato: "[ts] Quien: contenido"
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*(?:\[([^\]]+)\]\s*)?([^:]{1,80})\s*:\s*(.*)$/);
      if (!m) {
        if (turns.length) turns[turns.length - 1].text += `\n${line}`;
        continue;
      }
      const ts = m[1];
      const labelRaw = m[2].trim();
      const lbl = labelRaw.toLowerCase();
      const who: ConvTurn["who"] = lbl.includes("cliente") || lbl.includes("contacto")
        ? "cliente"
        : lbl.includes("bot") || lbl.includes("agente") || lbl.length < 40
          ? "agente"
          : "otro";
      turns.push({ who, label: labelRaw, text: m[3].trim(), ts });
    }
    return turns;
  }

  // Voz: usar regex tolerante con etiquetas [AGENTE]/[CLIENTE]/Asesor:/Cliente:
  const tagRe = /\[(AGENTE|ASESOR|AGENT|CLIENTE|CLIENT|CUSTOMER)\]\s*:?/gi;
  const lineRe = /(?:\b(asesor|agente|cliente|customer)\b)\s*[:\-]/gi;

  let normalized = raw;
  if (!tagRe.test(raw) && !lineRe.test(raw)) {
    // Sin marcas: una sola burbuja
    return [{ who: "otro", label: "Transcripción", text: raw.trim() }];
  }

  // Re-instanciar regex para split (los .test consumen estado)
  const splitRe = /\[(AGENTE|ASESOR|AGENT|CLIENTE|CLIENT|CUSTOMER)\]\s*:?|\b(asesor|agente|cliente|customer)\b\s*[:\-]/gi;
  const parts = normalized.split(splitRe).filter((s) => s != null);

  let current: ConvTurn | null = null;
  for (const piece of parts) {
    const t = (piece ?? "").trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (["agente", "asesor", "agent"].includes(lower)) {
      if (current) turns.push(current);
      current = { who: "agente", label: "Asesor", text: "" };
    } else if (["cliente", "client", "customer"].includes(lower)) {
      if (current) turns.push(current);
      current = { who: "cliente", label: "Cliente", text: "" };
    } else {
      if (!current) current = { who: "otro", label: "Transcripción", text: "" };
      current.text += (current.text ? " " : "") + t;
    }
  }
  if (current) turns.push(current);
  return turns.filter((t) => t.text.trim().length > 0);
};

/* ───── Sección con título ───── */

function Section({
  icon: Icon,
  title,
  accent = "primary",
  children,
}: {
  icon: React.ElementType;
  title: string;
  accent?: "primary" | "emerald" | "red" | "amber" | "violet" | "sky";
  children: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 bg-emerald-500/10",
    red: "text-red-600 bg-red-500/10",
    amber: "text-amber-600 bg-amber-500/10",
    violet: "text-violet-600 bg-violet-500/10",
    sky: "text-sky-600 bg-sky-500/10",
  };
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center", accentMap[accent])}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function BulletList({ items, tone = "default" }: { items: string[]; tone?: "default" | "positive" | "negative" | "warning" | "info" }) {
  if (!items.length) {
    return <p className="text-xs italic text-muted-foreground/80 px-1">Sin información disponible.</p>;
  }
  const dotMap: Record<string, string> = {
    default: "bg-primary/40",
    positive: "bg-emerald-500",
    negative: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-sky-500",
  };
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground/90 p-2.5 rounded-lg bg-secondary/20 border border-border/20"
        >
          <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", dotMap[tone])} />
          <span className="break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───── Componente principal ───── */

export function InteractionDetailPanel({ row }: Props) {
  const isCall = row.channel === "call";

  // On-demand load WA messages when __conversation is empty
  const [waMessages, setWaMessages] = useState<string>("");
  useEffect(() => {
    if (isCall || row.__conversation) { setWaMessages(""); return; }
    const convId = row.waConversationId;
    if (!convId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("timestamp, sender_type, agent_name, content, message_type")
        .eq("conversation_id", convId)
        .order("timestamp", { ascending: true });
      if (cancelled || !data?.length) return;
      const lines = data.map((msg: any) => {
        const d = new Date(msg.timestamp);
        const time = d.toLocaleTimeString("es-MX", { hour12: false });
        const dateStr = d.toLocaleDateString("es-MX");
        let role = "[AGENTE]";
        if (msg.sender_type === "Contacto") role = "[CLIENTE]";
        else if (msg.sender_type === "Bot") role = "[BOT]";
        const sender = msg.agent_name && msg.sender_type === "Agente" ? ` (${msg.agent_name})` : "";
        let content = msg.content || "";
        if (msg.message_type === "Audio") content = `[Audio transcrito]: ${content || "Contenido no disponible"}`;
        else if (msg.message_type === "Imagen") content = "[Imagen]";
        else if (msg.message_type === "Documento") content = `[Documento: ${content || "archivo"}]`;
        return `[${dateStr} ${time}] ${role}${sender}: ${content}`;
      });
      if (!cancelled) setWaMessages(lines.join("\n"));
    })();
    return () => { cancelled = true; };
  }, [isCall, row.__conversation, row.waConversationId]);

  const effectiveConversation = row.__conversation || waMessages;

  const conversation = useMemo(
    () => parseConversation(effectiveConversation, row.channel),
    [effectiveConversation, row.channel],
  );

  const waNormalized = useMemo(
    () =>
      isCall
        ? null
        : normalizeWhatsappAnalysisForInsights(
            {
              score_general: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
              prompt_name: null,
              results: (row.results || {}) as Record<string, unknown>,
            },
            null,
          ),
    [isCall, row.score, row.results],
  );

  const results = useMemo(
    () => (isCall ? ((row.results || {}) as Record<string, unknown>) : waNormalized?.results || {}),
    [isCall, row.results, waNormalized],
  );

  // Resumen
  const summaryText = useMemo(() => {
    const waSummary = !isCall ? String(waNormalized?.analysis?.summary || "").trim() : "";
    if (waSummary) return waSummary;
    const fromResults = pickFirst(results, [
      "resumen_ejecutivo",
      "resumen",
      "resumen_conversacion",
      "resumen_llamada",
      "summary",
      "executive_summary",
    ]);
    const cleanRes = renderText(fromResults);
    if (cleanRes) return cleanRes;
    return formatCleanSummary(row.summary) || "";
  }, [isCall, results, row.summary, waNormalized]);

  const positivos = useMemo(
    () => toArray(pickFirst(results, ["puntos_positivos", "fortalezas", "aciertos", "positive", "positives", "feedback_agente"])),
    [results],
  );
  const negativos = useMemo(
    () => toArray(pickFirst(results, ["puntos_negativos", "debilidades", "errores", "areas_mejora", "areas_de_mejora", "negative", "negatives"])),
    [results],
  );
  const oportunidades = useMemo(
    () => toArray(pickFirst(results, ["oportunidades", "oportunidades_mejora", "oportunidad_mejora", "opportunities"])),
    [results],
  );
  const insights = useMemo(
    () => toArray(pickFirst(results, ["insights", "insight", "hallazgos", "hallazgos_criticos"])),
    [results],
  );
  const conclusiones = useMemo(
    () => toArray(pickFirst(results, ["conclusiones", "conclusion", "conclusions"])),
    [results],
  );
  const recomendaciones = useMemo(
    () => toArray(pickFirst(results, ["recomendaciones", "recomendacion", "next_steps", "siguientes_pasos", "recommendations"])),
    [results],
  );

  // Análisis según prompt: campos no consumidos por otras secciones
  const promptAnalysis = useMemo(() => {
    const blacklist = new Set([
      "resumen", "resumen_ejecutivo", "resumen_conversacion", "resumen_llamada",
      "summary", "executive_summary",
      "puntos_positivos", "fortalezas", "aciertos", "positive", "positives", "feedback_agente",
      "puntos_negativos", "debilidades", "errores", "areas_mejora", "areas_de_mejora", "negative", "negatives",
      "oportunidades", "oportunidades_mejora", "oportunidad_mejora", "opportunities",
      "insight", "insights", "hallazgos", "hallazgos_criticos",
      "conclusiones", "conclusion", "conclusions",
      "recomendaciones", "recomendacion", "next_steps", "siguientes_pasos", "recommendations",
      "tags", "topics",
      "score_general", "score",
      "sentimiento_cliente", "sentiment", "overall_sentiment", "sentiment_score", "sentimiento_evolucion",
      "entities", "entidades",
    ]);
    const entries: Array<[string, unknown]> = [];
    for (const [k, v] of Object.entries(results)) {
      if (blacklist.has(k.toLowerCase())) continue;
      if (v == null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      entries.push([k, v]);
    }
    return entries;
  }, [results]);

  const topics = useMemo(() => toArray(pickFirst(results, ["topics", "tags"])), [results]);
  const entities = useMemo(() => toArray(pickFirst(results, ["entities", "entidades"])), [results]);

  const extEntries = Object.entries(row).filter(([k]) => k.startsWith("ext_"));

  // Score normalizado (acepta 0-1, 0-1.5 o 0-100)
  const scorePct = useMemo(() => {
    const n = Number(row.score);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n <= 1.5 ? n * 100 : n);
  }, [row.score]);

  return (
    <div className="flex flex-col h-full">
      {/* Cabecera */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/40 bg-card/80">
        <div className="flex items-center gap-2 mb-3">
          <Badge
            className={cn(
              "px-3 py-1 text-[10px] font-black uppercase tracking-widest border",
              row.sentiment === "positive"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : row.sentiment === "negative"
                  ? "bg-red-500/10 text-red-600 border-red-500/20"
                  : "bg-blue-500/10 text-blue-600 border-blue-500/20",
            )}
          >
            {row.sentiment === "positive" ? "Positivo" : row.sentiment === "negative" ? "Negativo" : "Neutral"}
          </Badge>
          {scorePct !== null && (
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter">
              Score: {scorePct}%
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] font-bold uppercase gap-1">
            {isCall ? <Phone className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
            {isCall ? "Llamada" : "WhatsApp"}
          </Badge>
        </div>
        <h2 className="text-lg font-black text-foreground tracking-tight leading-tight break-all">{row.file_name}</h2>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {format(new Date(row.created_at), "PPP 'a las' HH:mm", { locale: es })}
          {" · "}
          {isCall
            ? `${Math.floor(row.duration / 60)}m ${row.duration % 60}s`
            : `${row.total_messages ?? "—"} mensajes`}
          {row.agent ? ` · ${row.agent}` : ""}
          {row.campaign ? ` · ${row.campaign}` : ""}
        </p>
      </div>

      {/* Contenido scrollable */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-6 space-y-7">
          {/* Conversación / Mensajes */}
          <Section
            icon={isCall ? FileText : MessageSquare}
            title={isCall ? "Transcripción" : "Mensajes"}
            accent="sky"
          >
            {conversation.length === 0 ? (
              <p className="text-xs italic text-muted-foreground/80">
                {isCall ? "No hay transcripción disponible." : "No hay mensajes disponibles."}
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 rounded-xl bg-secondary/10 border border-border/30 p-3">
                {conversation.map((t, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-1 max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed shadow-sm",
                      t.who === "cliente"
                        ? "self-start bg-card border border-border/50 text-foreground"
                        : t.who === "agente"
                          ? "self-end ml-auto bg-primary/10 border border-primary/15 text-foreground"
                          : "bg-muted/40 border border-border/30 text-foreground/90 self-stretch max-w-full",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          t.who === "cliente"
                            ? "text-muted-foreground"
                            : t.who === "agente"
                              ? "text-primary"
                              : "text-muted-foreground",
                        )}
                      >
                        {t.label}
                      </span>
                      {t.ts && (
                        <span className="text-[9px] text-muted-foreground/70 font-mono">{t.ts}</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Resumen */}
          <Section icon={Sparkles} title={isCall ? "Resumen de la llamada" : "Resumen de la conversación"} accent="primary">
            {summaryText ? (
              <p className="text-sm text-foreground/90 leading-relaxed p-4 rounded-xl bg-primary/5 border border-primary/10">
                {summaryText}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground/80">No hay resumen disponible.</p>
            )}
          </Section>

          {/* Análisis según prompt (campos restantes) */}
          {promptAnalysis.length > 0 && (
            <Section icon={ListChecks} title="Análisis según prompt" accent="violet">
              <div className="space-y-2">
                {promptAnalysis.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex flex-col gap-1 p-3 rounded-xl bg-secondary/20 border border-border/20"
                  >
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                      {k.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-foreground/90 break-words whitespace-pre-wrap">
                      {renderText(v)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Datos extraídos personalizados */}
          {extEntries.length > 0 && (
            <Section icon={Compass} title="Datos extraídos" accent="amber">
              <div className="space-y-2">
                {extEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1 p-3 rounded-xl bg-secondary/20 border border-border/20">
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                      {key.replace(/^ext_/, "")}
                    </span>
                    <span className="text-xs font-bold text-foreground break-words">{String(value)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section icon={TrendingUp} title="Puntos positivos" accent="emerald">
            <BulletList items={positivos} tone="positive" />
          </Section>

          <Section icon={TrendingDown} title="Puntos negativos" accent="red">
            <BulletList items={negativos} tone="negative" />
          </Section>

          <Section icon={Target} title="Oportunidades" accent="amber">
            <BulletList items={oportunidades} tone="warning" />
          </Section>

          <Section icon={Lightbulb} title="Insights" accent="violet">
            <BulletList items={insights} tone="info" />
          </Section>

          <Section icon={ScrollText} title="Conclusiones" accent="sky">
            <BulletList items={conclusiones} tone="info" />
          </Section>

          <Section icon={CheckCircle2} title="Recomendaciones" accent="emerald">
            <BulletList items={recomendaciones} tone="positive" />
          </Section>

          {/* Topics / Temas */}
          {topics.length > 0 && (
            <Section icon={ListChecks} title="Temas tratados" accent="violet">
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <Badge key={`topic-${t}`} variant="secondary" className="text-[10px] px-2 py-0.5">
                    {t}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Entidades detectadas */}
          {entities.length > 0 && (
            <Section icon={Compass} title="Entidades detectadas" accent="sky">
              <div className="flex flex-wrap gap-1.5">
                {entities.map((e) => (
                  <Badge
                    key={`ent-${e}`}
                    variant="outline"
                    className="text-[10px] px-2 py-0.5 bg-primary/5 border-primary/20 text-primary"
                  >
                    {e}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Tags */}
          {row.tags?.length > 0 && topics.length === 0 && (
            <Section icon={ListChecks} title="Etiquetas" accent="primary">
              <div className="flex flex-wrap gap-1.5">
                {row.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] px-2 py-0.5">
                    {t}
                  </Badge>
                ))}
              </div>
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
