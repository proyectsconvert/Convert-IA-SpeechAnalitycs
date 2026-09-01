import { cn } from "@/lib/utils";

interface Props {
  text?: string;
  className?: string;
}

export function PulseLoader({ text = "Procesando...", className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      {/* Animated rings */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-accent/30 animate-ping" />
        <div className="absolute inset-1 rounded-full border-2 border-accent/50 animate-ping" style={{ animationDelay: "0.3s" }} />
        <div className="absolute inset-2 rounded-full border-2 border-accent/70 animate-ping" style={{ animationDelay: "0.6s" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-accent animate-pulse" />
        </div>
      </div>
      {/* Animated dots */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{text}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-accent"
              style={{
                animation: "pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
