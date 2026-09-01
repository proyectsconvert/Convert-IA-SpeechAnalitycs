import { useMemo } from "react";
import { format } from "date-fns";
import {
  FileAudio,
  Calendar,
  Clock,
  User,
  Phone,
  Briefcase,
  Target,
  MapPin,
  Tag,
  Sparkles,
  Database,
  Hash,
  Activity,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { cn } from "@/lib/utils";

interface TranscriptInfoTabProps {
  audioFile: Record<string, unknown> | null | undefined;
  analysis: Record<string, unknown> | null | undefined;
  callExtractions: Array<{ id: string; extracted_value?: string; extraction_rules?: { name?: string } }>;
  formatTime: (seconds: number) => string;
}

export function TranscriptInfoTab({
  audioFile,
  analysis,
  callExtractions,
  formatTime,
}: TranscriptInfoTabProps) {
  const metadata = (audioFile?.metadata || {}) as Record<string, unknown>;
  const rawJson = metadata.json_raw || metadata;

  // Extraer valores reales
  const agentName =
    (typeof metadata.agent === "string" ? metadata.agent : undefined) ||
    (typeof metadata.agent_name === "string" ? metadata.agent_name : undefined) ||
    (typeof metadata.user_name === "string" ? metadata.user_name : undefined) ||
    (audioFile?.file_name && String(audioFile.file_name).includes("-")
      ? String(audioFile.file_name).split("-")[0].trim()
      : null);

  const campaign = (metadata.campaign || metadata.initiative) as string | undefined;
  const phone = (metadata.phone || metadata.telefono) as string | undefined;
  const contactName = (metadata.contact_name || metadata.cliente) as string | undefined;
  const disposition = (metadata.disposition || metadata.resultado) as string | undefined;
  const isGoal = metadata.disposition_is_goal != null ? Boolean(metadata.disposition_is_goal) : null;
  const attentionLevel = metadata.attention_level as string | undefined;
  const retries = metadata.retries as number | string | undefined;
  const adeudo = metadata.adeudo as string | number | undefined;

  const address = [metadata.ciudad, metadata.estado, metadata.direccion, metadata.cp]
    .filter(Boolean)
    .join(", ");

  const createdAtFormatted = audioFile?.created_at
    ? format(new Date(audioFile.created_at as string), "dd/MM/yyyy HH:mm:ss")
    : null;

  const startTimeFormatted = metadata.start_time
    ? String(metadata.start_time).replace("T", " ").slice(0, 19)
    : null;

  const durationSeconds = Number(audioFile?.duration_seconds) || 0;
  const sentiment = (analysis?.overall_sentiment as string) || (audioFile?.sentiment as string);
  const score = analysis?.sentiment_score != null ? Number(analysis.sentiment_score) * 100 : null;
  const tags = (analysis?.tags as string[]) || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Metadatos Principales en Cuadrícula */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-accent" />
            Información General de la Llamada
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Archivo */}
            <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                <FileAudio className="w-3.5 h-3.5 text-accent" />
                Nombre del Archivo
              </span>
              <p className="text-sm font-semibold text-foreground break-all">
                {String(audioFile?.file_name || "—")}
              </p>
              {audioFile?.id && (
                <p className="text-[11px] font-mono text-muted-foreground truncate">
                  ID: {String(audioFile.id)}
                </p>
              )}
            </div>

            {/* Fecha / Hora */}
            <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                Fecha y Hora
              </span>
              <p className="text-sm font-semibold text-foreground">
                {startTimeFormatted || createdAtFormatted || "—"}
              </p>
              {durationSeconds > 0 && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Duración: {formatTime(durationSeconds)} ({durationSeconds}s)
                </p>
              )}
            </div>

            {/* Asesor / Agente */}
            {agentName && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  Asesor / Agente
                </span>
                <p className="text-sm font-semibold text-foreground">{agentName}</p>
                {campaign && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> Campaña: {campaign}
                  </p>
                )}
              </div>
            )}

            {/* Cliente / Contacto */}
            {(contactName || phone) && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  Contacto / Cliente
                </span>
                {contactName && <p className="text-sm font-semibold text-foreground">{contactName}</p>}
                {phone && (
                  <p className="text-xs font-mono text-muted-foreground">Teléfono: {phone}</p>
                )}
              </div>
            )}

            {/* Resultado / Disposición */}
            {disposition && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  Resultado / Tipificación
                </span>
                <p className="text-sm font-semibold text-foreground">{disposition}</p>
                {isGoal !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] mt-1",
                      isGoal
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {isGoal ? "Es Objetivo: SÍ" : "Es Objetivo: NO"}
                  </Badge>
                )}
              </div>
            )}

            {/* Estado y Calificación */}
            <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                Estado del Audio
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs uppercase bg-secondary">
                  {String(audioFile?.status || "completado")}
                </Badge>
                {sentiment && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs capitalize",
                      sentiment === "positive"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : sentiment === "negative"
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {sentiment === "positive"
                      ? "Positivo"
                      : sentiment === "negative"
                        ? "Negativo"
                        : "Neutral"}
                  </Badge>
                )}
                {score !== null && (
                  <span className="text-xs font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                    {score.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>

            {/* Ubicación si existe */}
            {address && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  Ubicación
                </span>
                <p className="text-sm text-foreground">{address}</p>
              </div>
            )}

            {/* Nivel de atención / Reintentos / Adeudo */}
            {(attentionLevel || retries != null || adeudo != null) && (
              <div className="bg-card/70 border border-border/80 rounded-xl p-4 space-y-1.5 shadow-sm">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Parámetros Adicionales
                </span>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {attentionLevel && <p>Nivel de atención: {attentionLevel}</p>}
                  {retries != null && <p>Intentos: {retries}</p>}
                  {adeudo != null && <p>Adeudo: {adeudo}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reglas de Extracción Dinámicas si existen */}
        {callExtractions.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              Campos Extraídos por Reglas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {callExtractions.map((ext) => (
                <div
                  key={ext.id}
                  className="bg-accent/5 border border-accent/15 rounded-xl p-3.5 shadow-sm"
                >
                  <p className="text-xs font-semibold text-accent mb-1">
                    {ext.extraction_rules?.name || "Regla"}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {ext.extracted_value || "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Etiquetas si existen */}
        {tags.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-muted-foreground" />
              Etiquetas del Análisis
            </h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs uppercase font-medium bg-secondary/80 border border-border/60"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Visor JSON Completo */}
        <div className="pt-2">
          <JsonTreeViewer data={rawJson} rootTitle="Metadata / JSON Completo" />
        </div>
      </div>
    </ScrollArea>
  );
}
