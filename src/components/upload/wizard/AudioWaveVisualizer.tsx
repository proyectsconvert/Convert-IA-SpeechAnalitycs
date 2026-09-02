import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  isActive?: boolean;
  barCount?: number;
  className?: string;
}

export function AudioWaveVisualizer({ isActive = true, barCount = 18, className }: Props) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className={cn("flex items-center justify-center gap-1 h-8", className)}>
      {bars.map((i) => {
        // Altura base y variación orgánica
        const heightPattern = [30, 60, 90, 45, 100, 70, 40, 85, 95, 50, 75, 100, 60, 80, 40, 90, 65, 35];
        const initialHeight = heightPattern[i % heightPattern.length];

        return (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-accent/60 to-primary/80"
            animate={
              isActive
                ? {
                    height: [`${Math.max(15, initialHeight * 0.3)}%`, `${initialHeight}%`, `${Math.max(20, initialHeight * 0.4)}%`],
                  }
                : { height: "20%" }
            }
            transition={{
              repeat: Infinity,
              repeatType: "reverse",
              duration: 0.6 + (i % 4) * 0.15,
              ease: "easeInOut",
              delay: (i % 5) * 0.08,
            }}
          />
        );
      })}
    </div>
  );
}
