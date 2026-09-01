import { StatusBadge } from "@/components/ui/status-badge";
import { highlightText } from "./highlightText";

interface DbSegment {
  id: string;
  speaker: string | null;
  start_time: number;
  text: string;
  sentiment?: string | null;
}

interface ParsedSegment {
  speaker: string;
  time: string;
  text: string;
  startSeconds: number;
}

type SegmentRow = DbSegment | ParsedSegment;

function isDbSegment(seg: SegmentRow): seg is DbSegment {
  return "id" in seg;
}

interface TranscriptSegmentCardProps {
  seg: SegmentRow;
  searchTerm: string;
  seekTo: (time: number) => void;
  formatTime: (seconds: number) => string;
}

export function TranscriptSegmentCard({ seg, searchTerm, seekTo, formatTime }: TranscriptSegmentCardProps) {
  const isDbSeg = isDbSegment(seg);
  const speaker = seg.speaker;
  const startTime = isDbSeg ? Number(seg.start_time) : seg.startSeconds;
  const text = seg.text;
  const sentiment = isDbSeg ? seg.sentiment : null;
  const speakerLower = (speaker || "").toLowerCase().trim();
  const isAgent =
    speakerLower.includes("agente") ||
    speakerLower.includes("asesor") ||
    speakerLower.includes("speaker 1") ||
    speakerLower === "hablante 1" ||
    speakerLower === "1" ||
    speakerLower.includes("agent") ||
    speakerLower.includes("representante");

  const speakerLabel = isAgent ? "Asesor" : "Cliente";

  return (
    <div
      className={`group flex w-full ${isAgent ? "justify-start" : "justify-end"}`}
      onClick={() => seekTo(startTime)}
    >
      <div
        className={`max-w-[85%] rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-sm ${
          isAgent
            ? "bg-primary/5 border-primary/20 hover:border-primary/40 rounded-tl-sm"
            : "bg-accent/5 border-accent/20 hover:border-accent/40 rounded-tr-sm"
        }`}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              isAgent ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
            }`}
          >
            {isAgent ? "A" : "C"}
          </div>
          <span
            className={`font-semibold text-xs uppercase tracking-wide ${
              isAgent ? "text-primary" : "text-accent"
            }`}
          >
            {speakerLabel}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              seekTo(startTime);
            }}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline font-mono transition-colors ml-auto"
          >
            ▶ {formatTime(startTime)}
          </button>
          {sentiment && (
            <StatusBadge variant={sentiment === "negative" ? "error" : sentiment === "positive" ? "completed" : "neutral"}>
              {sentiment}
            </StatusBadge>
          )}
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {searchTerm ? highlightText(text, searchTerm) : text}
        </p>
      </div>
    </div>
  );
}
