import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Pencil, Trash2, ToggleRight, ToggleLeft, Loader2, BookOpen } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PromptDialog, PromptRecord } from "@/components/prompts/PromptDialog";

import { useQueryClient } from "@tanstack/react-query";

export default function PromptsPage() {
  const { currentAccount } = useAccount();
  const { user } = useAuth();
  const accountId = currentAccount?.account_id;
  const queryClient = useQueryClient();

  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptRecord | null>(null);

  const fetchPrompts = async () => {
    if (!accountId) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setPrompts((data as PromptRecord[]) || []);
    } catch (error) {
      console.error("Error fetching prompts:", error);
      toast.error("Error al cargar los prompts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) fetchPrompts();
  }, [accountId]);

  const handleDelete = async () => {
    if (!selectedPromptId) return;
    try {
      const { error } = await supabase.from("prompts").delete().eq("id", selectedPromptId);
      if (error) throw error;
      setPrompts((prev) => prev.filter((p) => p.id !== selectedPromptId));
      queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast.success("Prompt eliminado correctamente");
    } catch (error) {
      console.error("Error deleting prompt:", error);
      toast.error("Error al eliminar el prompt");
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedPromptId(null);
    }
  };

  const togglePromptActive = async (promptId: string, currentStatus: string) => {
    try {
      setIsActivating(true);
      const newStatus = currentStatus === "active" ? "draft" : "active";
      const { error } = await supabase.from("prompts").update({ status: newStatus }).eq("id", promptId);
      if (error) throw error;
      await fetchPrompts();
      queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast.success("Estado del prompt actualizado correctamente");
    } catch (error) {
      console.error("Error updating prompt status:", error);
      toast.error("Error al actualizar el estado del prompt");
    } finally {
      setIsActivating(false);
    }
  };

  const handleEdit = (prompt: PromptRecord) => {
    setSelectedPrompt(prompt);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedPrompt(null);
    setIsDialogOpen(true);
  };

  const handleSuccess = () => {
    fetchPrompts();
    queryClient.invalidateQueries({ queryKey: ["prompts-upload"] });
    queryClient.invalidateQueries({ queryKey: ["prompts"] });
    setSelectedPrompt(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prompts</h1>
          <p className="text-muted-foreground text-sm">
            Catálogo de prompts y plantillas de análisis por macroproceso.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border rounded-xl">
        <div className="p-4 border-b bg-muted/30">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Templates</h3>
            <Button onClick={handleCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Nuevo Prompt
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm">No hay prompts disponibles para la cuenta seleccionada</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                prompts.map((prompt) => (
                  <TableRow key={prompt.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{prompt.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePromptActive(prompt.id, prompt.status)}
                        disabled={isActivating}
                        className="gap-2 px-0 font-normal"
                      >
                        {isActivating ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : prompt.status === "active" ? (
                          <ToggleRight className="h-6 w-6 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-6 w-6" />
                        )}
                        <Badge variant={prompt.status === "active" ? "default" : "secondary"}>
                          {prompt.status === "active" ? "Activo" : prompt.status === "draft" ? "Borrador" : "Archivado"}
                        </Badge>
                      </Button>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(prompt)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedPromptId(prompt.id);
                          setIsDeleteDialogOpen(true);
                        }}
                        className="hover:bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PromptDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        prompt={selectedPrompt}
        onSuccess={handleSuccess}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. ¿Deseas eliminar este prompt?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
