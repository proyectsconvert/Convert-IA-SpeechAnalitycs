import { HelpCircle, CheckCircle, BookOpen, MessageSquare } from "lucide-react";

export default function SoportePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Soporte</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: HelpCircle, title: "Centro de Ayuda", desc: "Documentación completa, tutoriales y guías de inicio rápido." },
          { icon: CheckCircle, title: "Estado del Sistema", desc: "Todos los servicios operativos. Uptime 99.97% este mes." },
          { icon: MessageSquare, title: "Soporte Técnico", desc: "Contacte a nuestro equipo de soporte enterprise 24/7." },
        ].map((s) => (
          <div key={s.title} className="bg-card rounded-xl border border-border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <s.icon className="w-8 h-8 text-accent mb-3" />
            <h3 className="font-semibold text-foreground">{s.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-accent" /> Preguntas Frecuentes
        </h2>
        <div className="space-y-3">
          {[
            { q: "¿Qué formatos de audio son compatibles?", a: "MP3, WAV, M4A, FLAC, OGG, WebM. Máximo 500MB por archivo." },
            { q: "¿Cuántas llamadas puedo procesar simultáneamente?", a: "Depende de su plan. Enterprise permite hasta 50 procesamiento concurrentes." },
            { q: "¿Cómo funciona el aislamiento entre cuentas?", a: "Cada cuenta opera como un tenant aislado con separación criptográfica de datos." },
          ].map((faq) => (
            <details key={faq.q} className="border border-border rounded-lg">
              <summary className="px-4 py-3 text-sm font-medium text-foreground cursor-pointer hover:bg-secondary/50">{faq.q}</summary>
              <p className="px-4 pb-3 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
