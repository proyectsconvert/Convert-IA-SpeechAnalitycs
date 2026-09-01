import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles } from "lucide-react";
import { usePromptImprove } from "@/hooks/usePromptImprove";
import { PromptComparisonDialog } from "./PromptComparisonDialog";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
  content: z.string().min(10, { message: "El contenido debe tener al menos 10 caracteres" }),
  active: z.boolean().default(false),
});

type PromptFormValues = z.infer<typeof formSchema>;

export interface PromptRecord {
  id: string;
  name: string;
  system_instructions: string;
  status: "active" | "draft" | "archived";
  account_id: string;
  created_by?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  version: number;
  updated_at: string;
}

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt?: PromptRecord | null;
  onSuccess?: () => void;
}

export function PromptDialog({ open, onOpenChange, prompt, onSuccess }: PromptDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonData, setComparisonData] = useState<{
    originalContent: string;
    improvedContent: string;
  } | null>(null);

  const { improvePrompt, isImproving } = usePromptImprove();
  const { currentAccount } = useAccount();
  const { user } = useAuth();
  const isEditing = Boolean(prompt);

  const form = useForm<PromptFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", content: "", active: false },
  });

  useEffect(() => {
    if (prompt) {
      form.reset({
        name: prompt.name,
        content: prompt.system_instructions,
        active: prompt.status === "active",
      });
    } else {
      form.reset({ name: "", content: "", active: false });
    }
  }, [prompt, form]);

  const handleImprovePrompt = async () => {
    const currentContent = form.getValues("content");
    const currentName = form.getValues("name") || "Nuevo prompt";

    if (!currentContent.trim()) {
      toast.error("Primero escribe algo de contenido para mejorar");
      return;
    }

    const result = await improvePrompt({ content: currentContent, name: currentName });

    if (result?.success) {
      setComparisonData({
        originalContent: result.originalContent,
        improvedContent: result.improvedContent,
      });
      setShowComparison(true);
    }
  };

  const handleAcceptImprovement = () => {
    if (comparisonData) {
      form.setValue("content", comparisonData.improvedContent);
      toast.success("Prompt mejorado aplicado");
    }
    setShowComparison(false);
    setComparisonData(null);
  };

  const handleRejectImprovement = () => {
    setShowComparison(false);
    setComparisonData(null);
  };

  const onSubmit = async (values: PromptFormValues) => {
    setIsSubmitting(true);
    try {
      const accountId = currentAccount?.account_id;
      if (!accountId) throw new Error("No hay cuenta seleccionada");

      const payload = {
        name: values.name,
        system_instructions: values.content,
        status: values.active ? "active" as const : "draft" as const,
        account_id: accountId,
        created_by: user?.id,
        model: "gpt-5.4-nano",
      };

      if (isEditing && prompt) {
        const { error } = await supabase.from("prompts").update(payload).eq("id", prompt.id);
        if (error) throw error;
        toast.success("Prompt actualizado correctamente");
      } else {
        const { error } = await supabase.from("prompts").insert(payload);
        if (error) throw error;
        toast.success("Prompt creado correctamente");
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error saving prompt:", error);
      toast.error(isEditing ? "Error al actualizar el prompt" : "Error al crear el prompt");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Prompt" : "Nuevo Prompt"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Modifica el contenido del prompt." : "Crea un nuevo prompt para análisis de llamadas."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del prompt" {...field} />
                    </FormControl>
                    <FormDescription>Nombre descriptivo para identificar el prompt.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Contenido</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleImprovePrompt}
                        disabled={isImproving}
                        className="ml-2"
                      >
                        {isImproving ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        {isImproving ? "Mejorando..." : "Mejorar con IA"}
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Escribe el contenido del prompt..."
                        className="min-h-32 resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      El texto del prompt que se usará para generar respuestas. Usa el botón "Mejorar con IA"
                      para optimizar automáticamente tu prompt con enfoques de ventas, comercial e insights estratégicos.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activo</FormLabel>
                      <FormDescription>
                        Determina si este prompt está disponible para ser utilizado.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? "Actualizar" : "Crear"} plantilla
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {comparisonData && (
        <PromptComparisonDialog
          open={showComparison}
          onOpenChange={setShowComparison}
          originalContent={comparisonData.originalContent}
          improvedContent={comparisonData.improvedContent}
          promptName={form.getValues("name") || "Nuevo prompt"}
          onAccept={handleAcceptImprovement}
          onReject={handleRejectImprovement}
        />
      )}
    </>
  );
}
