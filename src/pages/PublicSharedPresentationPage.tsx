import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Lock,
  AlertTriangle,
  Loader2,
  Download,
  ShieldCheck,
  Clock,
  Building2,
  FileText,
  Presentation as PresentationIcon,
} from "lucide-react";
import {
  isEditablePresentation,
  type EditablePresentation,
  SLIDE_W,
  SLIDE_H,
} from "@/lib/analizador-total/presentationModel";
import { isReportV3 } from "@/lib/analizador-total/reporteIaSchema";
import type { TotalAnalyzerV2Response } from "@/lib/analizador-total/reporteIaSchema";
import { ElementRenderer } from "@/components/analizador-total/reporte-ia-v2/SlideEditor";
import { ReporteEjecutivoView } from "@/components/analizador-total/reporte-ia-v2/ReporteEjecutivoView";
import { exportEditablePresentationPdf } from "@/lib/analizador-total/exportPresentationPdf";
import { exportReporteEjecutivoPdf } from "@/lib/analizador-total/exportReporteEjecutivoPdf";
import { toast } from "sonner";

type ErrorCode =
  | "invalid_token"
  | "not_found"
  | "revoked"
  | "expired"
  | "password_required"
  | "password_incorrect"
  | "presentation_deleted";

interface PublicPayload {
  title: string;
  slides_data: unknown;
  account_name: string;
  expires_at: string;
  allow_pdf_download: boolean;
  label: string | null;
}

const ERROR_MESSAGES: Record<ErrorCode, { title: string; desc: string }> = {
  invalid_token: { title: "Link inválido", desc: "El enlace que estás usando no es válido." },
  not_found: { title: "Link no encontrado", desc: "Este enlace no existe o fue eliminado." },
  revoked: { title: "Acceso revocado", desc: "El propietario ha revocado este link de acceso." },
  expired: { title: "Link expirado", desc: "Este enlace ya no está disponible. Solicita uno nuevo al propietario." },
  password_required: { title: "Contraseña requerida", desc: "Ingresa la contraseña para acceder al reporte." },
  password_incorrect: { title: "Contraseña incorrecta", desc: "La contraseña ingresada no es válida. Verifícala e intenta de nuevo." },
  presentation_deleted: { title: "Reporte no disponible", desc: "El reporte ya no existe en la plataforma." },
};

export default function PublicSharedPresentationPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = payload?.title ? `${payload.title} · Reporte` : "Reporte compartido";
  }, [payload?.title]);

  // Bloquear atajos comunes (imprimir, guardar, devtools, menú contextual)
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        (k === "s" || k === "p" || k === "u" || (e.shiftKey && (k === "i" || k === "j")))
      ) {
        e.preventDefault();
      }
      if (k === "f12") e.preventDefault();
    };
    const blockContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", blockKeys);
    window.addEventListener("contextmenu", blockContext);
    return () => {
      window.removeEventListener("keydown", blockKeys);
      window.removeEventListener("contextmenu", blockContext);
    };
  }, []);

  const fetchData = async (pwd?: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_shared_presentation" as any, {
        p_token: token,
        p_password: pwd ?? null,
      } as any);
      if (rpcErr) throw rpcErr;

      const result = data as any;
      if (result?.error) {
        const code = result.error as ErrorCode;
        if (code === "password_required" || code === "password_incorrect") {
          setNeedsPassword(true);
          if (code === "password_incorrect") setError(code);
          else setError(null);
        } else {
          setError(code);
          setNeedsPassword(false);
        }
        setPayload(null);
      } else {
        setPayload(result as PublicPayload);
        setError(null);
        setNeedsPassword(false);
      }
    } catch (e: any) {
      console.error(e);
      setError("not_found");
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchData(password);
  };

  // Detectar formatos disponibles en el payload
  const formats = useMemo(() => {
    if (!payload) return { hasReport: false, hasPresentation: false, reportData: null as TotalAnalyzerV2Response | null, presentationData: null as EditablePresentation | null };
    const raw = payload.slides_data;
    let hasReport = false;
    let hasPresentation = false;
    let reportData: TotalAnalyzerV2Response | null = null;
    let presentationData: EditablePresentation | null = null;

    if (isEditablePresentation(raw)) {
      hasPresentation = true;
      presentationData = raw as EditablePresentation;
      // Si la presentación incluye su sourceResponse, también podemos mostrar el Reporte
      if (presentationData.sourceResponse) {
        hasReport = true;
        reportData = presentationData.sourceResponse;
      }
    } else if (isReportV3(raw)) {
      hasReport = true;
      reportData = (raw as { schemaVersion: 3; data: TotalAnalyzerV2Response }).data;
    }
    return { hasReport, hasPresentation, reportData, presentationData };
  }, [payload]);

  const [activeView, setActiveView] = useState<"report" | "presentation">("report");
  useEffect(() => {
    if (formats.hasReport) setActiveView("report");
    else if (formats.hasPresentation) setActiveView("presentation");
  }, [formats.hasReport, formats.hasPresentation]);

  const handleDownloadPdf = async () => {
    if (!payload || !payload.allow_pdf_download) return;
    setExporting(true);
    try {
      if (activeView === "presentation" && formats.presentationData) {
        await exportEditablePresentationPdf(
          formats.presentationData,
          payload.title || "Reporte",
        );
      } else if (activeView === "report" && reportRef.current) {
        await exportReporteEjecutivoPdf(
          reportRef.current,
          `${payload.title || "Reporte"}.pdf`,
        );
      } else {
        toast.error("No hay nada para exportar en esta vista");
        return;
      }
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error("No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  // ====== ESTADOS ======
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Reporte protegido</h1>
              <p className="text-xs text-muted-foreground">Ingresa la contraseña para continuar</p>
            </div>
          </div>
          <form onSubmit={handleSubmitPassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Contraseña</Label>
              <Input
                id="pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error === "password_incorrect" && (
                <p className="text-xs text-destructive">Contraseña incorrecta. Intenta de nuevo.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !password}>
              {submitting ? "Verificando..." : "Acceder"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  if (error) {
    const info = ERROR_MESSAGES[error];
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md p-6 space-y-4 text-center">
          <div className="mx-auto rounded-full bg-destructive/10 p-3 w-fit">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{info.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{info.desc}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">No se pudo cargar el reporte.</p>
      </div>
    );
  }

  if (!formats.hasReport && !formats.hasPresentation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">El formato del reporte no es compatible con la vista pública.</p>
      </div>
    );
  }

  const showTabs = formats.hasReport && formats.hasPresentation;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col select-none">
      {/* Header público minimalista */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-wrap gap-2 sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate">{payload.title}</h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>Compartido por <strong>{payload.account_name}</strong></span>
              <span className="text-muted-foreground/50">·</span>
              <Clock className="h-3 w-3" />
              Expira {format(new Date(payload.expires_at), "dd MMM yyyy HH:mm")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showTabs && (
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "report" | "presentation")}>
              <TabsList className="h-8">
                <TabsTrigger value="report" className="h-7 text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Reporte
                </TabsTrigger>
                <TabsTrigger value="presentation" className="h-7 text-xs gap-1.5">
                  <PresentationIcon className="h-3.5 w-3.5" />
                  Presentación
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> Solo lectura
          </Badge>
          {payload.allow_pdf_download && (
            <Button size="sm" onClick={handleDownloadPdf} disabled={exporting} className="h-8">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              PDF
            </Button>
          )}
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1">
        {activeView === "report" && formats.reportData ? (
          <ReportPublicView reportData={formats.reportData} reportRef={reportRef} />
        ) : activeView === "presentation" && formats.presentationData ? (
          <PresentationPublicView slidesData={formats.presentationData} />
        ) : formats.hasReport && formats.reportData ? (
          <ReportPublicView reportData={formats.reportData} reportRef={reportRef} />
        ) : formats.presentationData ? (
          <PresentationPublicView slidesData={formats.presentationData} />
        ) : null}
      </main>

      {/* Footer / marca de agua */}
      <footer className="bg-card border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
        🔒 Vista compartida · {payload.account_name} · {format(new Date(), "dd MMM yyyy HH:mm")} · Datos confidenciales
      </footer>
    </div>
  );
}

// ============================================================
// Vista de REPORTE EJECUTIVO (web nativo, idéntico al panel)
// ============================================================
function ReportPublicView({
  reportData,
  reportRef,
}: {
  reportData: TotalAnalyzerV2Response;
  reportRef: React.RefObject<HTMLDivElement>;
}) {
  const noop = () => {};
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <ReporteEjecutivoView
        ref={reportRef}
        response={reportData}
        isStale={false}
        onRegenerate={noop}
        onExportPptx={noop}
        onExportPdf={noop}
        isExporting={false}
        isExportingPdf={false}
        hideActions
      />
    </div>
  );
}

// ============================================================
// Vista de PRESENTACIÓN editable (slides 1920x1080)
// ============================================================
function PresentationPublicView({ slidesData }: { slidesData: EditablePresentation }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const slide = slidesData.slides[activeIdx] ?? slidesData.slides[0];
  const totalSlides = slidesData.slides.length;

  return (
    <div className="flex flex-col items-center justify-center p-4 gap-3">
      <SlideViewport slide={slide} />

      <div className="flex items-center gap-3 bg-card rounded-full border border-border px-3 py-1.5 shadow-sm">
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          disabled={activeIdx === 0}
        >
          ← Anterior
        </Button>
        <span className="text-xs font-medium tabular-nums">
          {activeIdx + 1} / {totalSlides}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => setActiveIdx((i) => Math.min(totalSlides - 1, i + 1))}
          disabled={activeIdx >= totalSlides - 1}
        >
          Siguiente →
        </Button>
      </div>

      {totalSlides > 1 && (
        <div className="flex gap-2 overflow-x-auto max-w-full px-2 pb-2">
          {slidesData.slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIdx(i)}
              className={`relative flex-shrink-0 rounded border-2 overflow-hidden transition ${
                i === activeIdx
                  ? "border-primary shadow-md"
                  : "border-border hover:border-muted-foreground/40"
              }`}
              style={{ width: 120, height: 120 * (SLIDE_H / SLIDE_W) }}
            >
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: SLIDE_W,
                  height: SLIDE_H,
                  transform: `scale(${120 / SLIDE_W})`,
                  background: s.background ?? "#fff",
                }}
              >
                {s.elements.map((el) => (
                  <div
                    key={el.id}
                    style={{
                      position: "absolute",
                      left: el.x,
                      top: el.y,
                      width: el.w,
                      height: el.h,
                      zIndex: el.zIndex ?? 0,
                    }}
                  >
                    <ElementRenderer element={el} />
                  </div>
                ))}
              </div>
              <span className="absolute bottom-0.5 right-0.5 bg-black/50 text-white text-[9px] px-1 rounded">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SlideViewport({ slide }: { slide: EditablePresentation["slides"][number] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const sW = (rect.width - 16) / SLIDE_W;
      const sH = (rect.height - 16) / SLIDE_H;
      setScale(Math.min(sW, sH, 1));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!slide) return null;

  return (
    <div ref={wrapRef} className="w-full max-w-[1600px] flex-1 flex items-center justify-center min-h-[400px]">
      <div
        className="relative shadow-2xl ring-1 ring-black/10"
        style={{
          width: SLIDE_W * scale,
          height: SLIDE_H * scale,
          background: slide.background ?? "#fff",
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${scale})`,
          }}
        >
          {slide.elements
            .slice()
            .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
            .map((el) => (
              <div
                key={el.id}
                style={{
                  position: "absolute",
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                }}
              >
                <ElementRenderer element={el} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
