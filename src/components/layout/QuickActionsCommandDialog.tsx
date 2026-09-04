import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Home,
  FileAudio,
  MessageSquare,
  BarChart3,
  BrainCircuit,
  Sparkles,
  FolderOpen,
  Wifi,
  Settings,
  Users,
  Shield,
  CreditCard,
  Plus,
  ArrowRight,
  LogOut,
  RotateCw,
  SlidersHorizontal,
  FilePlus,
  Command as CommandIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioUploadModal } from "@/contexts/AudioUploadModalContext";
import { usePermissions } from "@/hooks/usePermissions";
import { NAVIGATION_CONFIG } from "@/config/navigationConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickActionsCommandDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { openUploadModal } = useAudioUploadModal();
  const { can } = usePermissions();

  const isMac = useMemo(() => {
    return typeof window !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  }, []);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  const canUpload = can("library", "create") || can("uploads", "create");
  const canQualityMatrix = can("analytics", "edit") || can("analytics", "view");
  const canPrompts = can("prompts", "view");

  const allowedModules = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      url: string;
      icon: any;
      category?: string;
    }> = [];

    NAVIGATION_CONFIG.forEach((group) => {
      if (group.children && group.children.length > 0) {
        group.children.forEach((child) => {
          if (can(child.perm.module, child.perm.action)) {
            list.push({
              id: child.id,
              title: `${group.title} → ${child.title}`,
              url: child.url,
              icon: child.icon,
              category: group.title,
            });
          }
        });
      } else if (group.url) {
        const isAllowed = group.perm ? can(group.perm.module, group.perm.action) : true;
        if (isAllowed) {
          list.push({
            id: group.id,
            title: group.title,
            url: group.url,
            icon: group.icon,
          });
        }
      }
    });

    return list;
  }, [can]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-2xl rounded-3xl border border-emerald-500/20 bg-background/95 backdrop-blur-2xl shadow-2xl">
        <Command className="rounded-3xl border-0 bg-transparent [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/60">
          {/* Input de Búsqueda de Comandos */}
          <div className="flex items-center px-4 py-1 gap-2.5">
            <Search className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <CommandInput
              placeholder="Escribe un comando o busca un módulo... (ej: 'transcripciones', 'subir', 'calidad')"
              className="h-12 text-sm border-0 focus:ring-0 placeholder:text-muted-foreground/70"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground bg-secondary/80 border border-border/80 rounded-md">
              ESC
            </kbd>
          </div>

          <CommandList className="max-h-[380px] p-2 overflow-y-auto scrollbar-thin">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              No se encontraron acciones ni módulos autorizados.
            </CommandEmpty>

            {/* GRUPO 1: ACCIONES RÁPIDAS (Filtradas por permisos) */}
            <CommandGroup heading="Acciones Frecuentes">
              {canUpload && (
                <CommandItem
                  onSelect={() =>
                    runCommand(() => {
                      openUploadModal();
                    })
                  }
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-emerald-500/10 aria-selected:bg-emerald-500/15 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">Subir y Analizar Llamadas</p>
                    <p className="text-[10px] text-muted-foreground">Abre el asistente de carga inteligente</p>
                  </div>
                  <CommandShortcut className="text-[10px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded border border-border/60">
                    {isMac ? "⌘U" : "Ctrl+U"}
                  </CommandShortcut>
                </CommandItem>
              )}

              {canQualityMatrix && (
                <CommandItem
                  onSelect={() =>
                    runCommand(() => {
                      navigate("/analizador-total?tab=quality");
                    })
                  }
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-emerald-500/10 aria-selected:bg-emerald-500/15 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0 border border-teal-500/30">
                    <FilePlus className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">Matriz de Calidad</p>
                    <p className="text-[10px] text-muted-foreground">Configurar criterios y auditorías de servicio</p>
                  </div>
                  <CommandShortcut className="text-[10px] font-mono text-muted-foreground">
                    Matrices
                  </CommandShortcut>
                </CommandItem>
              )}

              {canPrompts && (
                <CommandItem
                  onSelect={() =>
                    runCommand(() => {
                      navigate("/prompts");
                    })
                  }
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-emerald-500/10 aria-selected:bg-emerald-500/15 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 border border-indigo-500/30">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">Gestionar Prompts de IA</p>
                    <p className="text-[10px] text-muted-foreground">Ver y redactar instrucciones personalizadas</p>
                  </div>
                  <CommandShortcut className="text-[10px] font-mono text-muted-foreground">
                    Prompts
                  </CommandShortcut>
                </CommandItem>
              )}

              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    window.location.reload();
                  })
                }
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary aria-selected:bg-secondary transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center flex-shrink-0">
                  <RotateCw className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">Recargar Datos Actuales</p>
                  <p className="text-[10px] text-muted-foreground">Refrescar consultas de la vista activa</p>
                </div>
                <CommandShortcut className="text-[10px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded border border-border/60">
                  {isMac ? "⌘R" : "Ctrl+R"}
                </CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator className="my-1.5" />

            {/* GRUPO 2: NAVEGACIÓN A MÓDULOS (100% DINÁMICO SEGÚN PERMISOS) */}
            {allowedModules.length > 0 && (
              <CommandGroup heading="Módulos Autorizados">
                {allowedModules.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => runCommand(() => navigate(item.url))}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-secondary aria-selected:bg-secondary transition-colors"
                    >
                      <Icon className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-semibold flex-1">{item.title}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            <CommandSeparator className="my-1.5" />

            {/* GRUPO 3: CUENTA */}
            <CommandGroup heading="Sesión y Cuenta">
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    signOut();
                  })
                }
                className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-rose-500 hover:bg-rose-500/10 aria-selected:bg-rose-500/15 transition-colors"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-semibold flex-1">Cerrar Sesión</span>
                <CommandShortcut className="text-[10px] text-rose-500/70">Salir</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>

          {/* Pie informativo de atajos de teclado */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-secondary/30 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-[9px] font-mono font-bold">↑</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-[9px] font-mono font-bold">↓</kbd>
                para navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-[9px] font-mono font-bold">↵</kbd>
                ejecutar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-[9px] font-mono font-bold">ESC</kbd>
                cerrar
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CommandIcon className="w-3 h-3" />
              <span>Convert-IA Spotlight</span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
