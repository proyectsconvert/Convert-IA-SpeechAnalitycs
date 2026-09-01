import { FileAudio, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FileUploadItem } from "@/components/AudioUpload";

interface FileListProps {
  files: FileUploadItem[];
  onRemove: (id: string) => void;
}

export function FileList({ files, onRemove }: FileListProps) {
  return (
    <div className="space-y-2">
      {files.map((item) => (
        <div key={item.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg p-3">
          <FileAudio className="w-5 h-5 text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground break-all leading-snug">{item.file.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
            {item.status === "uploading" && <Progress value={item.progress} className="h-1 mt-1" />}
            {item.error && <p className="text-xs text-destructive mt-1">{item.error}</p>}
          </div>
          {item.status === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
          {item.status === "error" && <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />}
          {item.status === "uploading" && <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />}
          {(item.status === "pending" || item.status === "error") && (
            <button onClick={() => onRemove(item.id)} className="p-1 hover:bg-secondary rounded">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
