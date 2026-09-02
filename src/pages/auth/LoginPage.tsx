import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Lock, Mail, Sparkles, Activity, ShieldCheck, Headphones } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface InteractiveInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
}

const InteractiveInput = ({ label, icon, ...props }: InteractiveInputProps) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="w-full relative text-left">
      <label className="block mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
        {label}
      </label>
      <div className="relative w-full">
        <input
          className="peer relative z-10 border border-slate-700/80 h-13 sm:h-14 w-full rounded-xl bg-slate-900/90 px-4 sm:px-5 text-slate-100 placeholder:text-slate-500 font-normal outline-none drop-shadow-sm transition-all duration-200 ease-in-out focus:bg-slate-950 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm sm:text-base"
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          {...props}
        />
        {isHovering && (
          <>
            <div
              className="absolute pointer-events-none top-0 left-0 right-0 h-[2px] z-20 rounded-t-xl overflow-hidden"
              style={{
                background: `radial-gradient(75px circle at ${mousePosition.x}px 0px, #10b981 0%, transparent 80%)`,
              }}
            />
            <div
              className="absolute pointer-events-none bottom-0 left-0 right-0 h-[2px] z-20 rounded-b-xl overflow-hidden"
              style={{
                background: `radial-gradient(75px circle at ${mousePosition.x}px 2px, #10b981 0%, transparent 80%)`,
              }}
            />
          </>
        )}
        {icon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-slate-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cardMousePos, setCardMousePos] = useState({ x: 0, y: 0 });
  const [cardHover, setCardHover] = useState(false);
  const navigate = useNavigate();

  const handleCardMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCardMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Credenciales inválidas" : error.message);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#06080b] text-slate-100 flex items-center justify-center p-3 sm:p-6 lg:p-8 xl:p-10 relative overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Dynamic Moving Ambient Gradient Mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-transparent rounded-full blur-[150px] pointer-events-none animate-orb-1" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[750px] h-[750px] bg-gradient-to-tl from-teal-600/20 via-emerald-600/15 to-transparent rounded-full blur-[160px] pointer-events-none animate-orb-2" />
      <div className="absolute top-[35%] right-[25%] w-[550px] h-[550px] bg-gradient-to-r from-sky-500/10 via-cyan-500/15 to-transparent rounded-full blur-[140px] pointer-events-none animate-orb-3" />

      {/* Cybernetic Grid Overlay with subtle pulse */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(16, 185, 129, 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.07) 1px, transparent 1px)`,
          backgroundSize: '56px 56px',
        }}
      />

      {/* Main Glassmorphic Container - Expansive Layout filling the viewport elegantly */}
      <div className="w-full max-w-[1580px] xl:w-[94%] 2xl:w-[92%] rounded-3xl bg-slate-900/85 border border-slate-800/90 shadow-2xl backdrop-blur-2xl flex flex-col lg:flex-row overflow-hidden min-h-[750px] lg:h-[86vh] lg:min-h-[780px] relative z-10">
        
        {/* Left Section: Interactive Form */}
        <div
          className="w-full lg:w-[44%] xl:w-[40%] p-8 sm:p-12 lg:p-14 xl:p-16 relative flex flex-col justify-between overflow-hidden"
          onMouseMove={handleCardMouseMove}
          onMouseEnter={() => setCardHover(true)}
          onMouseLeave={() => setCardHover(false)}
        >
          {/* Dynamic cursor halo glow */}
          <div
            className={`absolute pointer-events-none w-[500px] h-[500px] bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-sky-500/10 rounded-full blur-3xl transition-opacity duration-300 ${
              cardHover ? "opacity-100" : "opacity-0"
            }`}
            style={{
              transform: `translate(${cardMousePos.x - 250}px, ${cardMousePos.y - 250}px)`,
              transition: "transform 0.08s ease-out",
            }}
          />

          {/* Brand Header */}
          <div className="relative z-10 mb-4 sm:mb-6">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/40 border border-emerald-500/30 p-2.5 flex items-center justify-center shadow-lg shadow-emerald-950/50 backdrop-blur">
                <img src="/logo.png" alt="Convert-IA" className="w-full h-full object-contain" />
              </div>
              <div>
                <span className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Convert-IA
                  <span className="text-emerald-400 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 font-medium">
                    Speech AI
                  </span>
                </span>
                <p className="text-xs sm:text-sm text-slate-400">Plataforma de Inteligencia Conversacional</p>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Iniciar sesión</h1>
            <p className="text-sm sm:text-base text-slate-400 mt-1.5">
              Ingresa tus credenciales autorizadas para acceder a la plataforma
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5 relative z-10 my-auto w-full max-w-md mx-auto">
            <InteractiveInput
              label="Correo electrónico"
              type="email"
              placeholder="admin@convertia.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              icon={<Mail className="w-5 h-5" />}
            />

            <div className="space-y-1.5">
              <InteractiveInput
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                icon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-emerald-400 transition-colors focus:outline-none p-1"
                    title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                }
              />

              <div className="flex justify-end pt-1">
                <Link
                  to="/forgot-password"
                  className="text-xs sm:text-sm text-slate-400 hover:text-emerald-400 transition-colors font-medium"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Glowing Interactive Submit Button */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="group/button w-full relative inline-flex justify-center items-center overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 px-6 py-4 text-base font-semibold text-white transition-all duration-300 ease-in-out hover:scale-[1.01] hover:shadow-2xl hover:shadow-emerald-500/30 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="relative z-10 flex items-center gap-2.5">
                  {loading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Iniciando sesión...
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Ingresar a la Plataforma
                    </>
                  )}
                </span>
                <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-13deg)_translateX(-100%)] group-hover/button:duration-1000 group-hover/button:[transform:skew(-13deg)_translateX(100%)]">
                  <div className="relative h-full w-16 bg-white/20" />
                </div>
              </button>
            </div>
          </form>

          {/* Footer Security Badges */}
          <div className="relative z-10 pt-6 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs sm:text-sm text-slate-400">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Conexión Encriptada SSL
            </span>
            <span className="text-slate-400 font-medium">Convert-IA Enterprise v2.5</span>
          </div>
        </div>

        {/* Right Section: Speech Analytics 3D AI Visual with Dynamic Movement */}
        <div className="hidden lg:flex lg:w-[56%] xl:w-[60%] relative bg-slate-950 flex-col justify-between overflow-hidden border-l border-slate-800/80">
          {/* AI-Generated Hero Image with Breathe Animation */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img
              src="/speech-analytics-hero.jpg"
              alt="Convert-IA Speech Analytics AI"
              className="w-full h-full object-cover object-center opacity-85 animate-zoom-breathe"
            />
            {/* Moving Laser Scanline traversing the voice analysis dashboard */}
            <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_16px_#10b981] animate-scanline pointer-events-none" />

            {/* Deep gradient overlays for typography contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#06080b] via-[#06080b]/45 to-[#06080b]/70" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#06080b] via-transparent to-transparent" />
          </div>

          {/* Top Floating Active Engine Badge with Real-Time Pulse */}
          <div className="relative z-10 p-8 sm:p-10 flex justify-between items-center">
            {/* Live Audio Equalizer Waveform Bars */}
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/80 border border-emerald-500/25 backdrop-blur-md shadow-lg shadow-black/30">
              <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider mr-1.5">Audio en vivo</span>
              {[35, 75, 100, 60, 90, 45, 80, 55, 95, 70, 85, 30, 65, 90, 50, 80].map((height, i) => (
                <span
                  key={i}
                  className="w-[3px] bg-emerald-400 rounded-full origin-bottom"
                  style={{
                    height: '16px',
                    animation: `audioBarBounce 1.${(i % 5) + 2}s ease-in-out infinite alternate`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>

            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/85 border border-emerald-500/35 text-xs sm:text-sm font-medium text-emerald-300 backdrop-blur-md shadow-xl shadow-black/50">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              Speech Engine Activo • 99.4% Precisión
            </div>
          </div>

          {/* Bottom Highlights & Metrics */}
          <div className="relative z-10 p-8 sm:p-12 lg:p-14 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-950/80 px-3.5 py-1.5 rounded-lg border border-emerald-500/30 backdrop-blur-sm">
                <Sparkles className="w-4 h-4" />
                Inteligencia Accionable en Audio
              </div>
              <h2 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
                Transforma cada llamada en insights estratégicos
              </h2>
              <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed max-w-2xl font-normal">
                Analiza miles de grabaciones en segundos, detecta sentimientos, objeciones y patrones de éxito comercial con modelos de IA auditados para contact centers.
              </p>
            </div>

            {/* Feature Mini Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/85 border border-slate-700/60 backdrop-blur-md shadow-xl hover:border-emerald-500/50 transition-all hover:bg-slate-900/95">
                <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-base mb-1.5">
                  <Headphones className="w-5 h-5" />
                  100% Auditoría de Agentes
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Transcripción y evaluación automatizada de cada interacción con scoring configurable.
                </p>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/85 border border-slate-700/60 backdrop-blur-md shadow-xl hover:border-teal-500/50 transition-all hover:bg-slate-900/95">
                <div className="flex items-center gap-2.5 text-teal-400 font-semibold text-base mb-1.5">
                  <Activity className="w-5 h-5" />
                  Análisis Emocional & CSAT
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Score de satisfacción del cliente, alertas de riesgo y objeciones en tiempo real.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

