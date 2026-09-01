import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { Loader2, Settings, BarChart3, Zap, Plus, Minus, Save, Clock, MessageSquare, Users, Download, MessageCircle, Presentation } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function LimitesPage() {
  const { profile } = useAuth();
  const { allAccounts } = useAccount();

  if (!profile?.is_superadmin) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Acceso Restringido</h3>
          <p className="text-muted-foreground">Solo los superadministradores pueden gestionar límites.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Límites y Métricas</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestiona límites de uso y visualiza métricas de consumo por cuenta.</p>
      </div>
      <Tabs defaultValue="quick" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick"><Zap className="h-4 w-4 mr-1" /> Gestión Rápida</TabsTrigger>
          <TabsTrigger value="individual"><Settings className="h-4 w-4 mr-1" /> Config. Individual</TabsTrigger>
          <TabsTrigger value="metrics"><BarChart3 className="h-4 w-4 mr-1" /> Métricas</TabsTrigger>
        </TabsList>
        <TabsContent value="quick"><QuickConfig accounts={allAccounts} /></TabsContent>
        <TabsContent value="individual"><IndividualConfig accounts={allAccounts} /></TabsContent>
        <TabsContent value="metrics"><MetricsView accounts={allAccounts} /></TabsContent>
      </Tabs>
    </div>
  );
}

function QuickConfig({ accounts }: { accounts: any[] }) {
  const queryClient = useQueryClient();
  const [limits, setLimits] = useState({ hours: 10, queries: 500, users: 5, whatsapp: 1000, presentations: 50 });

  const { data: accountsWithLimits, isLoading } = useQuery({
    queryKey: ["accounts-with-limits"],
    queryFn: async () => {
      const { data: limitsData } = await supabase.from("account_limits").select("*");
      const { data: accs } = await supabase.from("accounts").select("id, name, max_users");
      return (accs || []).map((acc) => {
        const limit = (limitsData ?? []).find((l) => l.account_id === acc.id);
        return {
          ...acc,
          max_transcription_hours: limit?.max_transcription_hours || 10,
          max_chatbot_queries: limit?.max_chatbot_queries || 500,
          max_whatsapp_conversations: limit?.max_whatsapp_conversations || 1000,
          max_presentations: limit?.max_presentations || 50,
          additional_hours: limit?.additional_hours || 0,
        };
      });
    },
  });

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const updates = (accountsWithLimits || []).map((acc) => ({
        account_id: acc.id,
        max_transcription_hours: limits.hours,
        max_chatbot_queries: limits.queries,
        max_whatsapp_conversations: limits.whatsapp,
        max_presentations: limits.presentations,
        max_storage_gb: 10,
        additional_hours: 0,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("account_limits").upsert(updates, { onConflict: "account_id" });
      if (error) throw error;
      for (const acc of accountsWithLimits || []) {
        await supabase.from("accounts").update({ max_users: limits.users }).eq("id", acc.id);
      }
    },
    onSuccess: () => { toast.success("Límites actualizados"); queryClient.invalidateQueries({ queryKey: ["accounts-with-limits"] }); },
    onError: () => toast.error("Error al actualizar"),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle><Zap className="h-5 w-5 inline mr-2" />Configuración Masiva</CardTitle><CardDescription>Aplica estos límites a todas las cuentas ({accountsWithLimits?.length})</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horas de Transcripción</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, hours: Math.max(0, p.hours - 5) }))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" value={limits.hours} onChange={(e) => setLimits((p) => ({ ...p, hours: +e.target.value }))} />
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, hours: p.hours + 5 }))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Conversaciones WhatsApp</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, whatsapp: Math.max(0, p.whatsapp - 100) }))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" value={limits.whatsapp} onChange={(e) => setLimits((p) => ({ ...p, whatsapp: +e.target.value }))} />
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, whatsapp: p.whatsapp + 100 }))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Consultas de Chatbot</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, queries: Math.max(0, p.queries - 50) }))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" value={limits.queries} onChange={(e) => setLimits((p) => ({ ...p, queries: +e.target.value }))} />
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, queries: p.queries + 50 }))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Presentation className="h-3.5 w-3.5" /> Presentaciones</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, presentations: Math.max(0, p.presentations - 10) }))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" value={limits.presentations} onChange={(e) => setLimits((p) => ({ ...p, presentations: +e.target.value }))} />
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, presentations: p.presentations + 10 }))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Usuarios Permitidos</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, users: Math.max(1, p.users - 1) }))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" value={limits.users} onChange={(e) => setLimits((p) => ({ ...p, users: +e.target.value }))} />
                <Button variant="outline" size="icon" onClick={() => setLimits((p) => ({ ...p, users: p.users + 1 }))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={() => bulkUpdate.mutate()} disabled={bulkUpdate.isPending}>
            {bulkUpdate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} <Save className="h-4 w-4 mr-2" /> Aplicar a Todas
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Vista de Límites Actuales</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {accountsWithLimits?.map((acc: any) => (
              <div key={acc.id} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium text-sm">{acc.name}</span>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{acc.max_transcription_hours}h</Badge>
                  <Badge variant="outline"><MessageCircle className="w-3 h-3 mr-1" />{acc.max_whatsapp_conversations} WA</Badge>
                  <Badge variant="outline"><MessageSquare className="w-3 h-3 mr-1" />{acc.max_chatbot_queries} consultas</Badge>
                  <Badge variant="outline"><Presentation className="w-3 h-3 mr-1" />{acc.max_presentations} pres.</Badge>
                  <Badge variant="outline"><Users className="w-3 h-3 mr-1" />{acc.max_users} usuarios</Badge>
                  {acc.additional_hours > 0 && <Badge variant="secondary">+{acc.additional_hours}h extra</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndividualConfig({ accounts }: { accounts: any[] }) {
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [form, setForm] = useState({ hours: 10, queries: 500, additionalHours: 0, maxUsers: 5, whatsapp: 1000, presentations: 50 });

  const { data: currentLimits, isLoading } = useQuery({
    queryKey: ["account-limits", selectedAccount],
    queryFn: async () => {
      const { data } = await supabase.from("account_limits").select("*").eq("account_id", selectedAccount).maybeSingle();
      return data;
    },
    enabled: !!selectedAccount,
  });

  const { data: accountData } = useQuery({
    queryKey: ["account-data", selectedAccount],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("max_users").eq("id", selectedAccount).single();
      return data;
    },
    enabled: !!selectedAccount,
  });

  useEffect(() => {
    if (currentLimits || accountData) {
      setForm({
        hours: Number(currentLimits?.max_transcription_hours) || 10,
        queries: currentLimits?.max_chatbot_queries || 500,
        additionalHours: Number(currentLimits?.additional_hours) || 0,
        maxUsers: accountData?.max_users || 5,
        whatsapp: currentLimits?.max_whatsapp_conversations || 1000,
        presentations: currentLimits?.max_presentations || 50,
      });
    }
  }, [currentLimits, accountData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase.from("account_limits").upsert({
        account_id: selectedAccount,
        max_transcription_hours: form.hours,
        max_chatbot_queries: form.queries,
        max_whatsapp_conversations: form.whatsapp,
        max_presentations: form.presentations,
        max_storage_gb: 10,
        additional_hours: form.additionalHours,
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id" });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("accounts").update({ max_users: form.maxUsers }).eq("id", selectedAccount);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Guardado"); queryClient.invalidateQueries({ queryKey: ["account-limits"] }); },
    onError: () => toast.error("Error"),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Seleccionar Cuenta</Label>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
          <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {selectedAccount && !isLoading && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Límites Mensuales</CardTitle><CardDescription>Se renuevan automáticamente el día 1 de cada mes</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horas de Transcripción</Label><Input type="number" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: +e.target.value }))} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Conversaciones WhatsApp</Label><Input type="number" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: +e.target.value }))} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Consultas de Chatbot</Label><Input type="number" value={form.queries} onChange={(e) => setForm((f) => ({ ...f, queries: +e.target.value }))} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1.5"><Presentation className="h-3.5 w-3.5" /> Presentaciones</Label><Input type="number" value={form.presentations} onChange={(e) => setForm((f) => ({ ...f, presentations: +e.target.value }))} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Usuarios Permitidos</Label><Input type="number" value={form.maxUsers} onChange={(e) => setForm((f) => ({ ...f, maxUsers: +e.target.value }))} /></div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Guardar</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Horas Adicionales</CardTitle><CardDescription>Se suman al cupo mensual de transcripción</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold text-primary">{form.additionalHours} horas</div>
              <Separator />
              <div className="space-y-2"><Label>Modificar Horas Adicionales</Label><Input type="number" value={form.additionalHours} onChange={(e) => setForm((f) => ({ ...f, additionalHours: +e.target.value }))} /></div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricsView({ accounts }: { accounts: any[] }) {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { data: usageData, isLoading, refetch } = useQuery({
    queryKey: ["usage-metrics", selectedAccount, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("usage_tracking").select("*");
      if (selectedAccount !== "all") query = query.eq("account_id", selectedAccount);
      // Filtra por el periodo seleccionado (solo filas del mes elegido)
      query = query.lte("period_start", dateTo).gte("period_end", dateFrom);
      const { data } = await query;
      return data || [];
    },
  });

  const { data: limitsData } = useQuery({
    queryKey: ["all-account-limits"],
    queryFn: async () => {
      const { data } = await supabase.from("account_limits").select("*");
      return data || [];
    },
  });

  const { data: audioStats } = useQuery({
    queryKey: ["audio-stats-metrics", selectedAccount, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("audio_files").select("account_id, duration_seconds, status, created_at");
      if (selectedAccount !== "all") query = query.eq("account_id", selectedAccount);
      query = query.gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
      const { data } = await query;
      return data || [];
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-for-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name, max_users");
      return data || [];
    },
  });

  const allAccs = accountsData || accounts;

  const totalFiles = audioStats?.length || 0;
  const totalSeconds = audioStats?.reduce((s, f) => s + (f.duration_seconds || 0), 0) || 0;
  const totalHours = totalSeconds / 3600;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const totalQueries = usageData?.reduce((s, u) => s + (u.chatbot_queries_used || 0), 0) || 0;
  const totalWhatsapp = usageData?.reduce((s, u) => s + (u.whatsapp_conversations_used || 0), 0) || 0;
  const totalPresentations = usageData?.reduce((s, u) => s + (u.presentations_created || 0), 0) || 0;

  const exportExcel = () => {
    const rows = [["Cuenta", "Grabaciones", "Horas Transcritas", "Consultas IA", "Conversaciones WA", "Presentaciones", "Archivos Procesados"]];
    const filtered = allAccs.filter((a) => selectedAccount === "all" || a.id === selectedAccount);
    filtered.forEach((acc) => {
      const files = audioStats?.filter((f) => f.account_id === acc.id) || [];
      const usage = usageData?.find((u) => u.account_id === acc.id);
      const dur = files.reduce((s, f) => s + (f.duration_seconds || 0), 0);
      rows.push([
        acc.name,
        files.length.toString(),
        (dur / 3600).toFixed(2),
        (usage?.chatbot_queries_used || 0).toString(),
        (usage?.whatsapp_conversations_used || 0).toString(),
        (usage?.presentations_created || 0).toString(),
        (usage?.files_processed || 0).toString(),
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `metricas-${dateFrom}-${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Métricas exportadas");
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Cuenta</Label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {allAccs.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Desde</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label>Hasta</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" /></div>
        <Button variant="outline" onClick={() => refetch()}>Actualizar</Button>
        <Button variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" /> Descargar CSV</Button>
      </div>

      <p className="text-sm text-muted-foreground">Período: {dateFrom} a {dateTo} · Los contadores de consumo se reinician el día 1 de cada mes</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-foreground">{totalFiles}</p><p className="text-xs text-muted-foreground">Total Grabaciones</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-foreground">{`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`}</p><p className="text-xs text-muted-foreground">Horas Transcritas</p><p className="text-[10px] text-muted-foreground">{totalHours.toFixed(2)} h</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-foreground">{totalWhatsapp.toLocaleString("es")}</p><p className="text-xs text-muted-foreground">Conv. WhatsApp</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-foreground">{totalQueries.toLocaleString("es")}</p><p className="text-xs text-muted-foreground">Consultas IA</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-foreground">{totalPresentations.toLocaleString("es")}</p><p className="text-xs text-muted-foreground">Presentaciones</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {allAccs.filter((a) => selectedAccount === "all" || a.id === selectedAccount).map((acc) => {
          const usage = usageData?.find((u) => u.account_id === acc.id);
          const limit = limitsData?.find((l) => l.account_id === acc.id);
          const files = audioStats?.filter((f) => f.account_id === acc.id) || [];
          const accSecs = files.reduce((s, f) => s + (f.duration_seconds || 0), 0);
          const hoursUsed = accSecs / 3600;
          const hoursLimit = Number(limit?.max_transcription_hours || 10) + Number(limit?.additional_hours || 0);
          const queriesUsed = usage?.chatbot_queries_used || 0;
          const queriesLimit = limit?.max_chatbot_queries || 500;
          const waUsed = usage?.whatsapp_conversations_used || 0;
          const waLimit = limit?.max_whatsapp_conversations || 1000;
          const presUsed = usage?.presentations_created || 0;
          const presLimit = limit?.max_presentations || 50;
          const hoursPct = hoursLimit > 0 ? Math.min((hoursUsed / hoursLimit) * 100, 100) : 0;
          const queriesPct = queriesLimit > 0 ? Math.min((queriesUsed / queriesLimit) * 100, 100) : 0;
          const waPct = waLimit > 0 ? Math.min((waUsed / waLimit) * 100, 100) : 0;
          const presPct = presLimit > 0 ? Math.min((presUsed / presLimit) * 100, 100) : 0;

          const renderBar = (icon: typeof Clock, label: string, used: number | string, total: number | string, pct: number, unit = "") => (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm">{icon({ className: "h-3 w-3" } as any)} {label}</div>
              <Progress value={pct} className={`h-2 ${pct >= 100 ? "[&>div]:bg-destructive" : pct >= 90 ? "[&>div]:bg-amber-500" : ""}`} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>{pct.toFixed(1)}%</span><span>{used} / {total} {unit}</span></div>
            </div>
          );

          return (
            <Card key={acc.id}>
              <CardHeader><CardTitle className="text-base">{acc.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div><p className="text-base font-bold">{files.length}</p><p className="text-muted-foreground">Grab.</p></div>
                  <div><p className="text-base font-bold">{hoursUsed.toFixed(1)}h</p><p className="text-muted-foreground">Trans.</p></div>
                  <div><p className="text-base font-bold">{waUsed}</p><p className="text-muted-foreground">WA</p></div>
                  <div><p className="text-base font-bold">{presUsed}</p><p className="text-muted-foreground">Pres.</p></div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm"><Clock className="h-3 w-3" /> Transcripción</div>
                    <Progress value={hoursPct} className={`h-2 ${hoursPct >= 100 ? "[&>div]:bg-destructive" : hoursPct >= 90 ? "[&>div]:bg-amber-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{hoursPct.toFixed(1)}%</span><span>{hoursUsed.toFixed(2)} / {hoursLimit} h</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm"><MessageCircle className="h-3 w-3" /> WhatsApp</div>
                    <Progress value={waPct} className={`h-2 ${waPct >= 100 ? "[&>div]:bg-destructive" : waPct >= 90 ? "[&>div]:bg-amber-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{waPct.toFixed(1)}%</span><span>{waUsed} / {waLimit} conv.</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm"><MessageSquare className="h-3 w-3" /> Consultas IA</div>
                    <Progress value={queriesPct} className={`h-2 ${queriesPct >= 100 ? "[&>div]:bg-destructive" : queriesPct >= 90 ? "[&>div]:bg-amber-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{queriesPct.toFixed(1)}%</span><span>{queriesUsed} / {queriesLimit}</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm"><Presentation className="h-3 w-3" /> Presentaciones</div>
                    <Progress value={presPct} className={`h-2 ${presPct >= 100 ? "[&>div]:bg-destructive" : presPct >= 90 ? "[&>div]:bg-amber-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{presPct.toFixed(1)}%</span><span>{presUsed} / {presLimit}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
