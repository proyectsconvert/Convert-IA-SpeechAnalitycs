import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

interface PromptSelectorProps {
  accountId?: string;
  selectedPromptId: string;
  onSelect: (id: string) => void;
}

export function PromptSelector({ accountId, selectedPromptId, onSelect }: PromptSelectorProps) {
  const { data: prompts } = useQuery({
    queryKey: ["prompts-active", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data } = await supabase.from("prompts").select("id, name, category")
        .eq("account_id", accountId).eq("status", "active").order("name");
      return data || [];
    },
    enabled: !!accountId,
  });

  return (
    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg p-3">
      <Sparkles className="w-5 h-5 text-accent flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-foreground mb-1">Paso 1: Selecciona un prompt de análisis</p>
        <Select value={selectedPromptId} onValueChange={onSelect}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Seleccionar prompt..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Análisis predeterminado</SelectItem>
            {prompts?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.category ? ` (${p.category})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
