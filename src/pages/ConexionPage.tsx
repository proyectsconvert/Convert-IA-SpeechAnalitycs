import { forwardRef, useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { Cable, CalendarClock, CheckCircle2, Clock, Database, FileAudio, FolderTree, Loader2, MessageCircle, Phone, Play, Plus, RefreshCw, Save, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ConnectionType = "sftp" | "ftp";
type ConnectionStatus = "active" | "inactive" | "error" | "testing";
type ImportStatus = "pending" | "scanning" | "ready" | "importing" | "imported" | "processing" | "completed" | "error" | "cancelled";
type AuthMethod = "password" | "private_key";

type RemoteConnection = {
  id: string;
  account_id: string;
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "private_key";
  remote_root_path: string;
  status: ConnectionStatus;
  last_test_status: string | null;
  last_test_message: string | null;
  last_tested_at: string | null;
};

type RemoteAutomation = {
  id: string;
  account_id: string;
  connection_id: string;
  name: string;
  is_enabled: boolean;
  import_filters: Record<string, unknown>;
  default_prompt_id: string | null;
  schedule_interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  target_module: string;
};

type PromptRow = { id: string; name: string; status: string; version: number };
type ImportJob = {
  id: string;
  connection_id: string;
  automation_id: string | null;
  prompt_id: string | null;
  status: ImportStatus;
  files_found: number;
  files_eligible: number;
  files_imported: number;
  files_excluded: number;
  error_message: string | null;
  created_at: string;
  filters: Record<string, unknown> | null;
  created_by: string | null;
  target_module: string;
  remote_import_automations?: { name: string } | null;
};

const initialConnection = {
  name: "",
  connection_type: "sftp" as ConnectionType,
  host: "",
  port: 22,
  username: "",
  auth_method: "password" as AuthMethod,
  password: "",
  privateKey: "",
  remote_root_path: "/",
};

const initialFilters = {
  startDate: "",
  endDate: "",
  mainFolder: "/",
  remotePath: "",
  includeSubfolders: true,
  subfolders: "",
  filePattern: "*.mp3, *.wav, *.m4a",
  allowedExtensions: "mp3,wav,m4a,ogg",
  minSizeKB: "",
  maxSizeKB: "",
  campaign: "",
  segment: "",
  extraParams: "",
  autoImportEnabled: false,
  scheduleIntervalMinutes: "60",
  maxScanLimit: "25000",
};

const statusLabel: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  error: "Error",
  testing: "Probando",
  pending: "Pendiente de importación",
  scanning: "Consultando ruta remota",
  ready: "Lista para confirmar",
  importing: "Importando",
  imported: "Importada",
  processing: "Procesando",
  completed: "Analizada",
  cancelled: "Cancelada",
};

export default function ConexionPage() {
  const { currentAccount } = useAccount();
  const { user } = useAuth();
  const accountId = currentAccount?.account_id;
  const [form, setForm] = useState(initialConnection);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<any[]>([]);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [excludedReasons, setExcludedReasons] = useState<Record<string, number>>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const lastRefreshRef = useRef(0);
  const autoStartedReadyJobsRef = useRef<Set<string>>(new Set());
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [importDestination, setImportDestination] = useState<"grabaciones" | "whatsapp">("grabaciones");
  const [minMessagesForAnalysis, setMinMessagesForAnalysis] = useState("3");
  const [minClientMessagesForAnalysis, setMinClientMessagesForAnalysis] = useState("1");

  const { data: connections = [], refetch: refetchConnections } = useQuery({
    queryKey: ["remote-connections", accountId],
    queryFn: async () => {
      if (!accountId) return [] as RemoteConnection[];
      const { data, error } = await supabase.from("remote_connections" as any).select("*").eq("account_id", accountId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RemoteConnection[];
    },
    enabled: !!accountId,
  });

  const { data: automations = [], refetch: refetchAutomations } = useQuery({
    queryKey: ["remote-automations", accountId],
    queryFn: async () => {
      if (!accountId) return [] as RemoteAutomation[];
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "list-automations", accountId },
      });
      if (error) throw error;
      return (data.automations ?? []) as RemoteAutomation[];
    },
    enabled: !!accountId,
  });

  const { data: prompts = [] } = useQuery({
    queryKey: ["active-prompts-for-remote-import", accountId],
    queryFn: async () => {
      if (!accountId) return [] as PromptRow[];
      const { data, error } = await supabase.from("prompts").select("id,name,status,version").eq("account_id", accountId).eq("status", "active").order("name");
      if (error) throw error;
      return (data ?? []) as PromptRow[];
    },
    enabled: !!accountId,
  });

  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["remote-import-jobs", accountId],
    queryFn: async () => {
      if (!accountId) return [] as ImportJob[];
      const { data, error } = await supabase.from("remote_import_jobs" as any).select("*, created_by, remote_import_automations(name)").eq("account_id", accountId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ImportJob[];
    },
    enabled: !!accountId,
  });

  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [automationForm, setAutomationForm] = useState({
    name: "",
    prompt_id: "",
    is_enabled: true,
    schedule_interval_minutes: "60",
    importDestination: "grabaciones" as "grabaciones" | "whatsapp",
    minMessagesForAnalysis: "3",
    minClientMessagesForAnalysis: "1",
    ...initialFilters
  });

  const selectedConnection = connections[0];
  const activeConnectionId = selectedConnection?.id || "";

  useEffect(() => {
    if (editingAutomationId) {
      const aut = automations.find(a => a.id === editingAutomationId);
      if (aut) {
        const filters = aut.import_filters || {};
        let allowedStr = typeof filters.allowedExtensions === "string" ? filters.allowedExtensions : "";
        if (!allowedStr && Array.isArray(filters.extensions)) {
          allowedStr = filters.extensions.join(", ");
        }
        setAutomationForm({
          name: aut.name,
          prompt_id: aut.default_prompt_id || "",
          is_enabled: aut.is_enabled,
          schedule_interval_minutes: String(aut.schedule_interval_minutes),
          importDestination: (String(filters.importDestination || aut.target_module || "grabaciones")) as "grabaciones" | "whatsapp",
          minMessagesForAnalysis: filters.minMessagesForAnalysis !== undefined ? String(filters.minMessagesForAnalysis) : "3",
          minClientMessagesForAnalysis: filters.minClientMessagesForAnalysis !== undefined ? String(filters.minClientMessagesForAnalysis) : "1",
          ...initialFilters,
          ...filters,
          allowedExtensions: allowedStr || ((filters.importDestination === "whatsapp" || aut.target_module === "whatsapp") ? "zip" : "mp3, wav, m4a, ogg, zip"),
          maxScanLimit: filters.maxScanLimit !== undefined ? String(filters.maxScanLimit) : "25000",
        });
      }
    } else {
      // Solo resetear si el nombre no está ya vacío (para evitar loops)
      setAutomationForm(prev => {
        if (prev.name === "" && prev.prompt_id === "") return prev;
        return { ...prev, ...initialFilters, name: "", prompt_id: "", is_enabled: true, importDestination: "grabaciones" as const, minMessagesForAnalysis: "3", minClientMessagesForAnalysis: "1" };
      });
    }
  }, [editingAutomationId, automations]);

  const canSave = form.name.trim() && form.host.trim() && form.username.trim() && form.remote_root_path.trim();

  const testConnection = async () => {
    if (!form.host.trim() || !form.username.trim()) {
      toast.error("Completa host y usuario antes de probar la conexión");
      return;
    }
    setIsTesting(true);
    try {
      const sanitizedForm = {
        ...form,
        host: form.host.trim(),
        username: form.username.trim(),
        password: form.password.trim(),
      };
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "test", accountId, connection: sanitizedForm },
      });
      if (error) throw error;
      if ((data as { success?: boolean; error?: string })?.success) toast.success("Conexión validada correctamente");
      else throw new Error((data as { error?: string })?.error || "No se pudo validar la conexión");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo validar la conexión. Revisa host, puerto y credenciales.");
    } finally {
      setIsTesting(false);
    }
  };

  const retestConnection = async (id: string) => {
    const toastId = toast.loading("Probando conexión...");
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "test", accountId, connectionId: id },
      });
      if (error) throw error;
      if ((data as { success?: boolean; error?: string })?.success) {
        toast.success("Conexión validada correctamente", { id: toastId });
        refetchConnections();
      } else throw new Error((data as { error?: string })?.error || "No se pudo validar la conexión");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al validar la conexión", { id: toastId });
      refetchConnections();
    }
  };

  const editConnection = (item: RemoteConnection) => {
    setEditingConnectionId(item.id);
    setForm({
      name: item.name,
      connection_type: item.connection_type,
      host: item.host,
      port: item.port,
      username: item.username,
      auth_method: item.auth_method,
      password: "",
      privateKey: "",
      remote_root_path: item.remote_root_path,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveConnection = async () => {
    if (!accountId || !user || !canSave) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: {
          action: "save",
          accountId,
          connectionId: editingConnectionId,
          connection: {
            ...form,
            host: form.host.trim(),
            username: form.username.trim(),
            password: form.password.trim(),
            port: Number(form.port)
          },
        },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "No se pudo guardar la conexión");
      toast.success(editingConnectionId ? "Conexión actualizada" : "Conexión guardada");
      setEditingConnectionId(null);
      setForm(initialConnection);
      refetchConnections();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la conexión");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAutomation = async () => {
    if (!accountId || !activeConnectionId || !automationForm.name.trim() || !automationForm.prompt_id) {
      toast.error("Nombre y prompt son obligatorios");
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: {
          action: "save-automation",
          accountId,
          automation: {
            id: editingAutomationId,
            connection_id: activeConnectionId,
            name: automationForm.name,
            prompt_id: automationForm.prompt_id,
            schedule_interval_minutes: Number(automationForm.schedule_interval_minutes),
            is_enabled: automationForm.is_enabled,
            target_module: automationForm.importDestination,
            filters: {
              ...automationForm,
              importDestination: automationForm.importDestination,
              minMessagesForAnalysis: automationForm.minMessagesForAnalysis,
              minClientMessagesForAnalysis: automationForm.minClientMessagesForAnalysis,
            }
          }
        },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "No se pudo guardar la automatización");
      toast.success(editingAutomationId ? "Automatización actualizada" : "Automatización creada");
      setEditingAutomationId(null);
      refetchAutomations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("remote-import", {
        body: { action: "delete-automation", accountId, automationId: id },
      });
      if (error) throw error;
      toast.success("Automatización eliminada");
      refetchAutomations();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase.functions.invoke("remote-import", {
        body: { action: "toggle-automation", accountId, automationId: id, enabled },
      });
      if (error) throw error;
      toast.success(enabled ? "Activada" : "Desactivada");
      refetchAutomations();
    } catch (error) {
      toast.error("Error al cambiar estado");
    }
  };

  const runAutomationNow = async (id: string) => {
    const toastId = toast.loading("Ejecutando proceso...");
    setIsRunningAutomation(true);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "run-automation", accountId, automationId: id },
      });
      if (error) throw error;
      toast.success("Proceso completado", { id: toastId });
      refetchJobs();
      refetchAutomations();
    } catch (error) {
      toast.error("Error al ejecutar", { id: toastId });
    } finally {
      setIsRunningAutomation(false);
    }
  };

  const updateConnectionStatus = async (id: string, status: ConnectionStatus) => {
    const { error } = await supabase.from("remote_connections" as any).update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "active" ? "Conexión activada" : "Conexión desactivada");
    refetchConnections();
  };

  const deleteConnection = async (id: string) => {
    const { error } = await supabase.from("remote_connections" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Conexión eliminada");
    refetchConnections();
  };

  const scanImport = async () => {
    if (!accountId || !user || !activeConnectionId || !selectedPromptId) {
      toast.error("Selecciona una conexión y un prompt antes de importar");
      return;
    }
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: {
          action: "scan",
          accountId,
          connectionId: activeConnectionId,
          promptId: selectedPromptId,
          filters: {
            ...filters,
            importDestination,
            minMessagesForAnalysis,
            minClientMessagesForAnalysis,
          },
        },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "No se pudo preparar la importación");

      if ((data as any).files && (data as any).jobId) {
        setPreviewFiles((data as any).files);
        setPreviewJobId((data as any).jobId);
        setExcludedReasons((data as any).excludedReasons || {});
      }

      if ((data as any).background || (data as any).queued) {
        toast.success("Escaneo iniciado en segundo plano. El trabajo aparecerá en la lista en unos segundos.");
      } else {
        toast.success((data as any).autoQueued ? "Resumen generado e importación iniciada automáticamente" : "Resumen de importación preparado con archivos reales del servidor");
      }

      refetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar la importación");
    } finally {
      setIsScanning(false);
    }
  };

  const stopImportJob = async (jobId: string) => {
    setIsStopping(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "stop", accountId, jobId },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "No se pudo detener el trabajo");
      toast.success("Trabajo detenido correctamente.");
      refetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al detener el trabajo");
    } finally {
      setIsStopping(null);
    }
  };

  const confirmImport = async (jobId: string, connectionId?: string) => {
    setIsConfirming(true);
    const connId = connectionId || activeConnectionId;
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "run", accountId, connectionId: connId, jobId },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "No se pudo iniciar la importación");
      toast.info("Importación iniciada.");
      setPreviewJobId(null);
      setPreviewFiles([]);
      refetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al iniciar");
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    jobs
      .filter((job) => job.status === "ready" && job.files_eligible > 0 && !autoStartedReadyJobsRef.current.has(job.id))
      .forEach((job) => {
        autoStartedReadyJobsRef.current.add(job.id);
        confirmImport(job.id, job.connection_id);
      });
  }, [jobs]);

  const deleteImportJob = async (id: string) => {
    const { error } = await supabase.from("remote_import_jobs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Historial eliminado");
    refetchJobs();
  };

  // --- Cargar configuración guardada de importación manual ---
  const loadManualConfig = useCallback(async (connId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: { action: "load-manual-config", accountId, connectionId: connId },
      });
      if (error) throw error;
      if ((data as any)?.success) {
        const saved = (data as any).filters || {};
        const savedPromptId = (data as any).promptId || "";
        const hasData = saved.remotePath || saved.mainFolder !== "/" || saved.filePattern ||
                       (saved.extensions && saved.extensions.length > 0) ||
                       saved.minSizeKB > 0 || saved.maxSizeKB > 0;
        if (hasData) {
          setFilters(prev => ({
            ...prev,
            mainFolder: saved.mainFolder || "/",
            remotePath: saved.remotePath || "",
            includeSubfolders: saved.includeSubfolders !== false,
            subfolders: Array.isArray(saved.subfolders) ? saved.subfolders.join("\n") : (saved.subfolders || ""),
            filePattern: saved.filePattern || "*.mp3, *.wav, *.m4a",
            allowedExtensions: Array.isArray(saved.extensions) ? saved.extensions.join(", ") : (saved.allowedExtensions || "mp3,wav,m4a,ogg"),
            minSizeKB: saved.minSizeKB ? String(saved.minSizeKB) : "",
            maxSizeKB: saved.maxSizeKB ? String(saved.maxSizeKB) : "",
            maxScanLimit: saved.maxScanLimit ? String(saved.maxScanLimit) : "2000",
            campaign: saved.campaign || "",
            segment: saved.segment || "",
          }));
          if (savedPromptId) setSelectedPromptId(savedPromptId);
          // Restore destination and WA analysis filters
          if (saved.importDestination === "whatsapp" || saved.importDestination === "grabaciones") {
            setImportDestination(saved.importDestination);
          }
          if (saved.minMessagesForAnalysis !== undefined) setMinMessagesForAnalysis(String(saved.minMessagesForAnalysis));
          if (saved.minClientMessagesForAnalysis !== undefined) setMinClientMessagesForAnalysis(String(saved.minClientMessagesForAnalysis));
          toast.info("Configuración de consulta cargada");
        }
        setConfigLoaded(true);
      }
    } catch (err) {
      console.warn("No se pudo cargar la configuración guardada:", err);
      setConfigLoaded(true);
    }
  }, [accountId]);

  useEffect(() => {
    if (activeConnectionId && !configLoaded) {
      loadManualConfig(activeConnectionId);
    }
  }, [activeConnectionId, configLoaded, loadManualConfig]);

  const saveManualConfig = async () => {
    if (!accountId || !activeConnectionId) {
      toast.error("Selecciona una conexión primero");
      return;
    }
    setIsSavingConfig(true);
    try {
      const { data, error } = await supabase.functions.invoke("remote-import", {
        body: {
          action: "save-manual-config",
          accountId,
          connectionId: activeConnectionId,
          filters: {
            ...filters,
            importDestination,
            minMessagesForAnalysis,
            minClientMessagesForAnalysis,
          },
          promptId: selectedPromptId || null,
        },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error || "Error al guardar");
      toast.success("Configuración de consulta guardada correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar la configuración");
    } finally {
      setIsSavingConfig(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      refetchAutomations();
      refetchJobs();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Cable className="w-6 h-6 text-accent" /> Integraciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Conexiones SFTP, API y almacenamiento seguro de grabaciones.</p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Credenciales protegidas por referencia segura</Badge>
      </div>

      <Tabs defaultValue="connections" className="space-y-5">
        <TabsList className="grid grid-cols-1 md:grid-cols-4 max-w-[800px]">
          <TabsTrigger value="connections" className="gap-2"><Cable className="h-4 w-4" /> Conexiones</TabsTrigger>
          <TabsTrigger value="automation" className="gap-2"><CalendarClock className="h-4 w-4" /> Automatización</TabsTrigger>
          <TabsTrigger value="import" className="gap-2"><FileAudio className="h-4 w-4" /> Importación manual</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><Database className="h-4 w-4" /> Trazabilidad</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {editingConnectionId ? <RefreshCw className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
              {editingConnectionId ? "Editar conexión" : "Nueva conexión"}
            </h2>

            {connections.length > 0 && !editingConnectionId ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <p className="font-bold mb-1">Solo se permite una conexión SFTP activa.</p>
                <p>Usa múltiples automatizaciones para aplicar diferentes reglas a este servidor.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="SFTP Principal" /></Field>
                <Field label="Tipo"><Select value={form.connection_type} onValueChange={(v: ConnectionType) => setForm((f) => ({ ...f, connection_type: v, port: v === "sftp" ? 22 : 21 }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sftp">SFTP</SelectItem><SelectItem value="ftp">FTP</SelectItem></SelectContent></Select></Field>
                <Field label="Host / servidor"><Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="files.empresa.com" /></Field>
                <Field label="Puerto"><Input type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} /></Field>
                <Field label="Usuario"><Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></Field>
                <Field label="Autenticación"><Select value={form.auth_method} onValueChange={(v: "password" | "private_key") => setForm((f) => ({ ...f, auth_method: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="password">Contraseña</SelectItem><SelectItem value="private_key">Llave privada</SelectItem></SelectContent></Select></Field>
                <div className="sm:col-span-2">
                  <Field label={form.auth_method === "password" ? (editingConnectionId ? "Nueva contraseña (opcional)" : "Contraseña") : (editingConnectionId ? "Nueva llave privada (opcional)" : "Llave privada")}>
                    {form.auth_method === "password" ? <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /> : <Textarea value={form.privateKey} onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))} />}
                  </Field>
                </div>
                <div className="sm:col-span-2"><Field label="Ruta remota principal"><Input value={form.remote_root_path} onChange={(e) => setForm((f) => ({ ...f, remote_root_path: e.target.value }))} placeholder="/recordings" /></Field></div>
              </div>
            )}

            <div className="flex gap-2">
              {(!connections.length || editingConnectionId) && (
                <>
                  <Button variant="outline" onClick={testConnection} disabled={isTesting}>{isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Probar</Button>
                  <Button onClick={saveConnection} disabled={!canSave || isSaving}>{isSaving ? "Guardando..." : (editingConnectionId ? "Actualizar conexión" : "Guardar conexión")}</Button>
                </>
              )}
              {editingConnectionId && (
                <Button variant="ghost" onClick={() => { setEditingConnectionId(null); setForm(initialConnection); }}>Cancelar</Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">Servidor Configurado</h2>
            {connections.length === 0 ? <EmptyState text="Aún no hay conexiones configuradas." /> : connections.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-semibold text-sm truncate">{item.name}</p><StatusBadge status={item.status} /></div><p className="text-xs text-muted-foreground mt-1">{item.connection_type.toUpperCase()} · {item.host}:{item.port} · {item.remote_root_path}</p><p className="text-xs text-muted-foreground mt-1">Última prueba: {item.last_test_message || "Sin prueba registrada"}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => retestConnection(item.id)}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Probar</Button>
                  <Button size="sm" variant="outline" onClick={() => editConnection(item)}>Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => updateConnectionStatus(item.id, item.status === "active" ? "inactive" : "active")}>{item.status === "active" ? "Desactivar" : "Activar"}</Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteConnection(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="automation" className="grid grid-cols-1 xl:grid-cols-[450px_1fr] gap-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 h-fit sticky top-6">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {editingAutomationId ? <RefreshCw className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
              {editingAutomationId ? "Editar Regla" : "Nueva Regla de Automatización"}
            </h2>

            <div className="space-y-4">
              <Field label="Nombre de la regla"><Input value={automationForm.name} onChange={(e) => setAutomationForm(f => ({ ...f, name: e.target.value }))} placeholder="Importar Ventas Semanales" /></Field>
              <Field label="Destino de importación">
                <Select value={automationForm.importDestination} onValueChange={(v: "grabaciones" | "whatsapp") => {
                  setAutomationForm(f => ({
                    ...f,
                    importDestination: v,
                    allowedExtensions: v === "whatsapp" ? "zip" : "mp3, wav, m4a, ogg, zip",
                    filePattern: v === "whatsapp" ? "*.zip" : "*.mp3, *.wav, *.m4a",
                  }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grabaciones"><span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Grabaciones → Biblioteca</span></SelectItem>
                    <SelectItem value="whatsapp"><span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp → Analytics</span></SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prompt para análisis"><Select value={automationForm.prompt_id} onValueChange={(v) => setAutomationForm(f => ({ ...f, prompt_id: v }))}><SelectTrigger><SelectValue placeholder="Seleccionar prompt" /></SelectTrigger><SelectContent>{prompts.map((prompt) => <SelectItem key={prompt.id} value={prompt.id}>{prompt.name} v{prompt.version}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Ejecutar cada X minutos"><Input type="number" min="1" value={automationForm.schedule_interval_minutes} onChange={(e) => setAutomationForm(f => ({ ...f, schedule_interval_minutes: e.target.value }))} /></Field>

              <div className="flex items-center gap-3 rounded-lg border border-purple-100 bg-purple-50/30 p-3">
                <Switch checked={automationForm.is_enabled} onCheckedChange={(checked) => setAutomationForm(f => ({ ...f, is_enabled: checked }))} />
                <div><p className="text-sm font-medium">Estado</p><p className="text-xs text-muted-foreground">Activar/desactivar esta regla</p></div>
              </div>

              {automationForm.importDestination === "whatsapp" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5" /> Filtros de análisis automático WhatsApp
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Conversaciones que cumplan estos mínimos se analizan automáticamente. Las demás quedan como "Sin analizar".</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Mínimo mensajes totales">
                      <Input type="number" min="0" value={automationForm.minMessagesForAnalysis} onChange={(e) => setAutomationForm(f => ({ ...f, minMessagesForAnalysis: e.target.value }))} placeholder="3" />
                    </Field>
                    <Field label="Mínimo mensajes del cliente">
                      <Input type="number" min="0" value={automationForm.minClientMessagesForAnalysis} onChange={(e) => setAutomationForm(f => ({ ...f, minClientMessagesForAnalysis: e.target.value }))} placeholder="1" />
                    </Field>
                  </div>
                </div>
              )}

              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-2">Filtros específicos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Carpeta principal"><Input value={automationForm.mainFolder} onChange={(e) => setAutomationForm(f => ({ ...f, mainFolder: e.target.value }))} /></Field>
                <Field label="Ruta específica"><Input value={automationForm.remotePath} onChange={(e) => setAutomationForm(f => ({ ...f, remotePath: e.target.value }))} placeholder="/ventas" /></Field>
                <Field label="Extensiones"><Input value={automationForm.allowedExtensions} onChange={(e) => setAutomationForm(f => ({ ...f, allowedExtensions: e.target.value }))} placeholder="mp3, wav" /></Field>
                <Field label="Patrón nombre"><Input value={automationForm.filePattern} onChange={(e) => setAutomationForm(f => ({ ...f, filePattern: e.target.value }))} placeholder="*.mp3" /></Field>
                <Field label="Tamaño mín (KB)"><Input type="number" min="0" value={automationForm.minSizeKB} onChange={(e) => setAutomationForm(f => ({ ...f, minSizeKB: e.target.value }))} placeholder="0" /></Field>
                <Field label="Tamaño máx (KB)"><Input type="number" min="0" value={automationForm.maxSizeKB} onChange={(e) => setAutomationForm(f => ({ ...f, maxSizeKB: e.target.value }))} placeholder="0" /></Field>
                <Field label="Límite escaneo">
                  <Select value={automationForm.maxScanLimit} onValueChange={(v) => setAutomationForm(f => ({ ...f, maxScanLimit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1000, 2000, 3000, 5000, 10000, 15000, 20000, 25000, 50000, 100000, 250000, 500000, 1000000].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n.toLocaleString()} archivos</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="w-full" onClick={saveAutomation} disabled={isSaving || !automationForm.name || !automationForm.prompt_id}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  {editingAutomationId ? "Actualizar Regla" : "Crear Regla"}
                </Button>
                {editingAutomationId && <Button variant="ghost" onClick={() => setEditingAutomationId(null)}>Cancelar</Button>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Automatizaciones Programadas</h2>
            {automations.length === 0 ? <EmptyState text="No hay reglas de automatización creadas." /> : (
              <div className="grid grid-cols-1 gap-3">
                {automations.map((aut) => (
                  <div key={aut.id} className="rounded-xl border border-border bg-card p-4 flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", aut.is_enabled ? "bg-green-500" : "bg-muted-foreground")} />
                        <h3 className="font-bold text-sm">{aut.name}</h3>
                        <Badge variant="outline" className="text-[10px] uppercase">{prompts.find(p => p.id === aut.default_prompt_id)?.name || 'Sin prompt'}</Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase gap-1">
                          {(aut.target_module || (aut.import_filters as any)?.importDestination || 'grabaciones') === 'whatsapp'
                            ? <><MessageCircle className="h-2.5 w-2.5" /> WhatsApp</>
                            : <><Phone className="h-2.5 w-2.5" /> Grabaciones</>
                          }
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Ruta: {String((aut.import_filters as any)?.remotePath || (aut.import_filters as any)?.mainFolder || '/')} · Cada {aut.schedule_interval_minutes} min</p>
                      <div className="flex gap-4 mt-2">
                        <div className="text-[10px]">
                          <p className="text-muted-foreground uppercase font-bold">Última ejecución</p>
                          <p className="font-medium">{aut.last_run_at ? new Date(aut.last_run_at).toLocaleString() : 'Nunca'}</p>
                        </div>
                        <div className="text-[10px]">
                          <p className="text-muted-foreground uppercase font-bold">Próxima</p>
                          <p className="font-medium text-primary">{aut.next_run_at ? new Date(aut.next_run_at).toLocaleString() : 'Pendiente'}</p>
                        </div>
                        <div className="text-[10px]">
                          <p className="text-muted-foreground uppercase font-bold">Estado</p>
                          <Badge variant={aut.last_run_status === 'error' ? 'destructive' : 'outline'} className="h-4 text-[9px] px-1">{aut.last_run_status || 'IDLE'}</Badge>
                        </div>
                      </div>
                      {aut.last_run_message && <p className="text-[10px] text-muted-foreground italic mt-1 truncate max-w-[400px]">{aut.last_run_message}</p>}
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <Button size="sm" variant="outline" onClick={() => runAutomationNow(aut.id)} disabled={isRunningAutomation}><Play className="h-3 w-3 mr-1" /> Ejecutar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingAutomationId(aut.id)}>Editar</Button>
                      <Switch checked={aut.is_enabled} onCheckedChange={(val) => toggleAutomation(aut.id, val)} />
                      <Button size="icon" variant="ghost" onClick={() => deleteAutomation(aut.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="import" className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Configuración de la Importación
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Conexión SFTP">
                  <Select value={activeConnectionId} onValueChange={setSelectedConnectionId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar conexión" /></SelectTrigger>
                    <SelectContent>
                      {connections.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Destino de importación">
                  <Select value={importDestination} onValueChange={(v: "grabaciones" | "whatsapp") => {
                    setImportDestination(v);
                    if (v === "whatsapp") {
                      setFilters(f => ({ ...f, allowedExtensions: "zip", filePattern: "*.zip" }));
                    } else {
                      setFilters(f => ({ ...f, allowedExtensions: "mp3,wav,m4a,ogg,zip", filePattern: "*.mp3, *.wav, *.m4a" }));
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grabaciones">
                        <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Grabaciones → Biblioteca</span>
                      </SelectItem>
                      <SelectItem value="whatsapp">
                        <span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp → Analytics</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Prompt para análisis">
                  <Select value={selectedPromptId} onValueChange={setSelectedPromptId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar prompt" /></SelectTrigger>
                    <SelectContent>
                      {prompts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} v{p.version}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {importDestination === "whatsapp" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5" /> Filtros de análisis automático WhatsApp
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Conversaciones que cumplan estos mínimos se analizan automáticamente. Las demás quedan en bandeja como "Sin analizar".</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Mínimo mensajes totales">
                      <Input type="number" min="0" value={minMessagesForAnalysis} onChange={(e) => setMinMessagesForAnalysis(e.target.value)} placeholder="3" />
                    </Field>
                    <Field label="Mínimo mensajes del cliente">
                      <Input type="number" min="0" value={minClientMessagesForAnalysis} onChange={(e) => setMinClientMessagesForAnalysis(e.target.value)} placeholder="1" />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                Filtros de Búsqueda
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <Field label="Carpeta principal"><Input value={filters.mainFolder} onChange={(e) => setFilters((f) => ({ ...f, mainFolder: e.target.value }))} /></Field>
                <Field label="Ruta específica"><Input value={filters.remotePath} onChange={(e) => setFilters((f) => ({ ...f, remotePath: e.target.value }))} placeholder="/recordings/campaña" /></Field>
                <Field label="Patrón de archivo">
                  <Input value={filters.filePattern} onChange={(e) => setFilters((f) => ({ ...f, filePattern: e.target.value }))} placeholder="*.mp3, *.wav (solo extensiones = usa filtro extensiones)" />
                  <p className="text-[10px] text-muted-foreground mt-1">Si solo usas patrones tipo *.ext, el filtro de extensiones tiene prioridad. Usa patrones avanzados como <code>reporte_*.mp3</code> para filtrar por nombre.</p>
                </Field>
                <Field label="Extensiones permitidas"><Input value={filters.allowedExtensions} onChange={(e) => setFilters((f) => ({ ...f, allowedExtensions: e.target.value }))} placeholder="mp3, wav, m4a" /></Field>
                <Field label="Tamaño mín (KB)"><Input type="number" min="0" value={filters.minSizeKB} onChange={(e) => setFilters((f) => ({ ...f, minSizeKB: e.target.value }))} placeholder="ej: 10 = 10 KB" /></Field>
                <Field label="Tamaño máx (KB)"><Input type="number" min="0" value={filters.maxSizeKB} onChange={(e) => setFilters((f) => ({ ...f, maxSizeKB: e.target.value }))} placeholder="ej: 50000 = ~50 MB (0=sin límite)" /></Field>
                <Field label="Límite escaneo">
                  <Select value={filters.maxScanLimit} onValueChange={(v) => setFilters((f) => ({ ...f, maxScanLimit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1000, 2000, 3000, 5000, 10000, 15000, 20000, 25000, 50000, 100000, 250000, 500000, 1000000].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n.toLocaleString()} archivos</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2 xl:col-span-3 flex items-center gap-3 rounded-lg border border-border p-3">
                  <Switch checked={filters.includeSubfolders} onCheckedChange={(checked) => setFilters((f) => ({ ...f, includeSubfolders: checked }))} />
                  <div>
                    <p className="text-sm font-medium">Incluir subcarpetas</p>
                    <p className="text-xs text-muted-foreground">Consulta carpetas hijas para esta prueba.</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={scanImport} disabled={isScanning} className="w-full sm:w-auto">
                  {isScanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                  Consultar y generar resumen
                </Button>
                <Button variant="outline" onClick={saveManualConfig} disabled={isSavingConfig || !activeConnectionId} className="w-full sm:w-auto">
                  {isSavingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar configuración
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4 col-span-1 xl:col-span-2">
            {previewJobId && previewFiles.length > 0 ? (
              <SFTPExplorer
                files={previewFiles}
                excludedReasons={excludedReasons}
                onConfirm={() => confirmImport(previewJobId)}
                onCancel={() => { setPreviewJobId(null); setPreviewFiles([]); setExcludedReasons({}); }}
                isConfirming={isConfirming}
                importDestination={importDestination}
              />
            ) : (
              <EmptyState text="Genera un resumen para ver archivos encontrados, válidos y excluidos en el Explorador SFTP." />
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">Trazabilidad y métricas (últimos 100 registros)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Ejecuciones" value={jobs.length} />
              <Metric label="Encontrados" value={jobs.reduce((acc, job) => acc + (job.files_found || 0), 0)} />
              <Metric label="Importados" value={jobs.reduce((acc, job) => acc + (job.files_imported || 0), 0)} />
              <Metric label="Excluidos/Dupl." value={jobs.reduce((acc, job) => acc + (job.files_excluded || 0), 0)} />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Historial detallado</h2>
            {jobs.length === 0 ? <EmptyState text="Sin importaciones registradas." /> : (
              <div className="border rounded-md max-h-[500px] overflow-y-auto bg-card">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="p-3 font-medium text-muted-foreground whitespace-nowrap">Fecha y Hora</th>
                      <th className="p-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="p-3 font-medium text-muted-foreground">Regla / Origen</th>
                      <th className="p-3 font-medium text-muted-foreground">Destino</th>
                      <th className="p-3 font-medium text-muted-foreground">Estado</th>
                      <th className="p-3 font-medium text-muted-foreground text-center">Encontrados</th>
                      <th className="p-3 font-medium text-muted-foreground text-center">Cumplen Filtros</th>
                      <th className="p-3 font-medium text-muted-foreground text-center">Importados</th>
                      <th className="p-3 font-medium text-muted-foreground text-center">Excluidos</th>
                      <th className="p-3 font-medium text-muted-foreground">Detalle / Error</th>
                      <th className="p-3 font-medium text-muted-foreground text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 whitespace-nowrap">{new Date(job.created_at).toLocaleString()}</td>
                        <td className="p-3">
                          {job.created_by ? (
                            <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700 font-normal">
                              <Play className="h-2.5 w-2.5" /> Manual
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-purple-700 font-normal">
                              <Clock className="h-2.5 w-2.5" /> Automático
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-medium">
                          {job.remote_import_automations?.name || (job.created_by ? "Ejecución Manual" : "-")}
                        </td>
                        <td className="p-3">
                          {(job.target_module === "whatsapp" || (job.filters as any)?.importDestination === "whatsapp")
                            ? <Badge variant="outline" className="gap-1 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700"><MessageCircle className="h-2.5 w-2.5" /> WA</Badge>
                            : <Badge variant="outline" className="gap-1 text-[10px] border-blue-200 bg-blue-50 text-blue-700"><Phone className="h-2.5 w-2.5" /> Grab.</Badge>
                          }
                        </td>
                        <td className="p-3"><StatusBadge status={job.status} /></td>
                        <td className="p-3 text-center font-medium">{job.files_found}</td>
                        <td className="p-3 text-center font-medium text-blue-600">{job.files_eligible}</td>
                        <td className="p-3 text-center font-medium text-green-600">{job.files_imported}</td>
                        <td className="p-3 text-center font-medium text-muted-foreground">{job.files_excluded}</td>
                        <td className="p-3 max-w-[200px]" title={job.error_message || ""}>
                          <div className="truncate text-xs text-muted-foreground">{job.error_message || "-"}</div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            {["importing", "pending", "scanning", "ready"].includes(job.status) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => stopImportJob(job.id)}
                                disabled={isStopping === job.id}
                                className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                title="Detener trabajo"
                              >
                                {isStopping === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => deleteImportJob(job.id)} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Field = forwardRef<HTMLDivElement, { label: string; children: ReactNode }>(({ label, children }, ref) => (
  <div ref={ref} className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground">{label}</Label>{children}</div>
));
Field.displayName = "Field";

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground text-center">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const ok = ["active", "completed", "imported", "ready"].includes(status);
  const bad = ["error", "cancelled"].includes(status);
  return <Badge variant={bad ? "destructive" : ok ? "default" : "secondary"} className="gap-1">{ok ? <CheckCircle2 className="h-3 w-3" /> : bad ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{statusLabel[status] || status}</Badge>;
}

function ImportJobCard({ job, compact }: { job: ImportJob; onConfirm?: () => void; compact?: boolean }) {
  return <div className={cn("rounded-lg border border-border p-4 space-y-3", compact && "space-y-2")}><div className="flex items-start justify-between gap-3"><div><StatusBadge status={job.status} /><p className="text-xs text-muted-foreground mt-2">{new Date(job.created_at).toLocaleString()}</p></div></div><div className="grid grid-cols-2 gap-2 text-xs"><Metric label="Encontrados" value={job.files_found} /><Metric label="Cumplen filtros" value={job.files_eligible} /><Metric label="Importados" value={job.files_imported} /><Metric label="Excluidos" value={job.files_excluded} /></div>{job.error_message && <p className="text-xs text-destructive">{job.error_message}</p>}</div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-muted/20 p-2"><p className="text-muted-foreground">{label}</p><p className="text-base font-bold text-foreground">{value}</p></div>;
}

function SFTPExplorer({
  files,
  excludedReasons = {},
  onConfirm,
  onCancel,
  isConfirming,
  importDestination
}: {
  files: any[];
  excludedReasons?: Record<string, number>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  importDestination?: "grabaciones" | "whatsapp";
}) {
  const [filter, setFilter] = useState<"all" | "approved" | "rejected">("approved");

  const displayedFiles = useMemo(() => {
    if (filter === "approved") return files.filter(f => f.ok);
    if (filter === "rejected") return files.filter(f => !f.ok);
    return files;
  }, [files, filter]);

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-primary" /> Explorador SFTP (Vista Previa)
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFilter("approved")} className={filter === "approved" ? "bg-muted border-green-500/50" : ""}><CheckCircle2 className="h-3 w-3 mr-1 text-green-500" /> Aprobados ({files.filter(f => f.ok).length})</Button>
          <Button variant="outline" size="sm" onClick={() => setFilter("all")} className={filter === "all" ? "bg-muted" : ""}>Todos ({files.length})</Button>
          <Button variant="outline" size="sm" onClick={() => setFilter("rejected")} className={filter === "rejected" ? "bg-muted border-destructive/50" : ""}><XCircle className="h-3 w-3 mr-1 text-destructive" /> Rechazados ({files.filter(f => !f.ok).length})</Button>
        </div>
      </div>

      {Object.keys(excludedReasons).length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-destructive/5 border border-destructive/10 rounded-lg">
          <p className="text-[10px] font-bold uppercase text-destructive flex items-center gap-1 w-full mb-1">
            <XCircle className="h-3 w-3" /> Resumen de descartados:
          </p>
          {Object.entries(excludedReasons).map(([reason, count]) => (
            <Badge key={reason} variant="outline" className="text-[10px] bg-white/50 border-destructive/20 text-destructive font-normal">
              {reason}: <span className="font-bold ml-1">{count}</span>
            </Badge>
          ))}
        </div>
      )}

      <div className="border rounded-md max-h-[400px] overflow-y-auto bg-card">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="p-3 font-medium text-muted-foreground">Estado</th>
              <th className="p-3 font-medium text-muted-foreground">Archivo Remoto</th>
              <th className="p-3 font-medium text-muted-foreground">Nombre en Plataforma</th>
              <th className="p-3 font-medium text-muted-foreground">Tamaño</th>
              <th className="p-3 font-medium text-muted-foreground">Ruta</th>
              <th className="p-3 font-medium text-muted-foreground w-1/3">Motivo de rechazo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedFiles.map((f, i) => (
              <tr key={i} className={cn("hover:bg-muted/30 transition-colors", f.ok ? "" : "text-muted-foreground bg-muted/10")}>
                <td className="p-3">
                  {f.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </td>
                <td className="p-3 font-medium max-w-[200px]" title={f.name}>
                  <div className="truncate">{f.ok ? f.name : <s className="opacity-70">{f.name}</s>}</div>
                </td>
                <td className="p-3 font-medium text-primary">
                  {f.name.toLowerCase().endsWith(".zip") ? (
                    <div className="flex items-center gap-1">
                      {importDestination === "whatsapp" ? (
                        <><MessageCircle className="h-3 w-3" />{f.name.replace(/\.zip$/i, "")}</>
                      ) : (
                        <><Database className="h-3 w-3" />{f.name.replace(/\.zip$/i, "")}</>
                      )}
                    </div>
                  ) : (
                    <span className="opacity-50">-</span>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {f.size !== undefined ? `${(f.size / 1024).toFixed(1)} KB` : "-"}
                </td>
                <td className="p-3 max-w-[200px]" title={f.path}>
                  <div className="truncate opacity-80">{f.path}</div>
                </td>
                <td className="p-3 max-w-[200px]" title={f.reason || ""}>
                  <div className="truncate">{f.reason || "-"}</div>
                </td>
              </tr>
            ))}
            {displayedFiles.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2"><FolderTree className="h-8 w-8 opacity-20" /> No hay archivos en esta vista.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onCancel}>Descartar</Button>
        <Button onClick={onConfirm} disabled={isConfirming || files.filter(f => f.ok).length === 0}>
          {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Reintentar importación ({files.filter(f => f.ok).length})
        </Button>
      </div>
    </div>
  );
}
