import { motion } from "framer-motion";
import { Check, Sparkles, Layers, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = 1 | 2 | 3;

interface Props {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
  isProcessing: boolean;
}

const STEPS = [
  { step: 1 as WizardStep, label: "Prompt de Análisis", icon: Sparkles },
  { step: 2 as WizardStep, label: "Matriz de Calidad", icon: Layers },
  { step: 3 as WizardStep, label: "Cargar Llamadas", icon: FileAudio },
];

export function WizardStepIndicator({ currentStep, onStepClick, isProcessing }: Props) {
  return (
    <div className="w-full pb-3 border-b border-border/60">
      <div className="flex items-center justify-between max-w-xl mx-auto px-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isCompleted = currentStep > s.step;
          const isActive = currentStep === s.step;
          const isClickable = !isProcessing && currentStep > s.step;

          return (
            <div key={s.step} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(s.step)}
                className={cn(
                  "flex items-center gap-2.5 group transition-all text-left outline-none",
                  isClickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <motion.div
                  layout
                  initial={false}
                  animate={{
                    scale: isActive ? 1.08 : 1,
                    transition: { type: "spring", stiffness: 400, damping: 25 },
                  }}
                  className={cn(
                    "relative w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-colors duration-300 shadow-2xs",
                    isActive
                      ? "bg-accent text-accent-foreground ring-2 ring-accent/40 ring-offset-2 ring-offset-background shadow-md shadow-accent/20"
                      : isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-secondary text-muted-foreground border border-border/70",
                  )}
                >
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </motion.div>
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </motion.div>

                <div className="hidden sm:block">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Paso {s.step}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold block truncate max-w-[120px] transition-colors",
                      isActive
                        ? "text-foreground font-bold"
                        : isCompleted
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              </button>

              {idx < STEPS.length - 1 && (
                <div className="flex-1 mx-3 hidden sm:block relative">
                  <div className="h-0.5 w-full bg-border/60 rounded-full" />
                  <motion.div
                    className="absolute top-0 left-0 h-0.5 bg-emerald-500 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: isCompleted ? "100%" : "0%" }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
