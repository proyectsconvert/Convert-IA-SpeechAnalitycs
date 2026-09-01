import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
}

export function DropZone({ isDragging, onDrop, onDragOver, onDragLeave, onClick }: DropZoneProps) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
        isDragging
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-border hover:border-accent/50 hover:bg-secondary/50"
      )}
    >
      <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">Paso 2: Arrastra archivos de audio aquí o haz clic para seleccionar</p>
      <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, OGG, FLAC • Máx 500MB por archivo</p>
    </div>
  );
}
