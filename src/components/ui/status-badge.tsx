import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        completed: "bg-success/10 text-success",
        processing: "bg-warning/10 text-warning",
        pending: "bg-info/10 text-info",
        error: "bg-destructive/10 text-destructive",
        neutral: "bg-muted text-muted-foreground",
        positive: "bg-success/10 text-success",
        negative: "bg-destructive/10 text-destructive",
        active: "bg-success/10 text-success",
        draft: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ variant, children, dot = true, className }: StatusBadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", {
        "bg-success": variant === "completed" || variant === "positive" || variant === "active",
        "bg-warning animate-pulse-dot": variant === "processing",
        "bg-info": variant === "pending",
        "bg-destructive": variant === "error" || variant === "negative",
        "bg-muted-foreground": variant === "neutral" || variant === "draft",
      })} />}
      {children}
    </span>
  );
}
