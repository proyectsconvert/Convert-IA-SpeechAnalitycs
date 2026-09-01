import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AccountProvider } from "@/contexts/AccountContext";
import { WhatsappUploadProvider } from "@/contexts/WhatsappUploadContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import BibliotecaPage from "./pages/BibliotecaPage";
import TranscripcionesPage from "./pages/TranscripcionesPage";
import { AnaliticasFiltersProvider } from "@/contexts/AnaliticasFiltersContext";
import AnaliticasLayout from "./pages/analiticas/AnaliticasLayout";
import AnaliticasResumenPage from "./pages/analiticas/AnaliticasResumenPage";
import AnaliticasLlamadasPage from "./pages/analiticas/AnaliticasLlamadasPage";
import AnaliticasWhatsappPage from "./pages/analiticas/AnaliticasWhatsappPage";
import AnalizadorTotalPage from "./pages/AnalizadorTotalPage";
import ExtraccionesPage from "./pages/ExtraccionesPage";
import PromptsPage from "./pages/PromptsPage";
import CuentasPage from "./pages/CuentasPage";
import UsuariosPage from "./pages/UsuariosPage";
import RolesPage from "./pages/RolesPage";
import LimitesPage from "./pages/LimitesPage";
import FacturacionPage from "./pages/FacturacionPage";
import AuditoriaPage from "./pages/AuditoriaPage";
import SoportePage from "./pages/SoportePage";
import ConsultaIAPage from "./pages/ConsultaIAPage";
import ConfiguracionPage from "./pages/ConfiguracionPage";
import ModelosTranscripcionPage from "./pages/ModelosTranscripcionPage";
import ValidacionModelosPage from "./pages/ValidacionModelosPage";
import ConexionPage from "./pages/ConexionPage";
import AnalyticsWhatsappPage from "./pages/AnalyticsWhatsappPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import AccountSelectionPage from "./pages/auth/AccountSelectionPage";
import NotFound from "./pages/NotFound";
import PublicSharedPresentationPage from "./pages/PublicSharedPresentationPage";
import PublicSharedDashboardPage from "./pages/PublicSharedDashboardPage";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 5, // Aumentado a 5 minutos
      gcTime: 1000 * 60 * 60 * 24, // Mantener en caché 24h
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "VOICE_METRICS_OFFLINE_CACHE",
});

function ProtectedAppRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AccountProvider>
            <WhatsappUploadProvider>
              <Routes>
                <Route path="/v/:token" element={<PublicSharedPresentationPage />} />
                <Route path="/d/:token" element={<PublicSharedDashboardPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/select-account" element={<AccountSelectionPage />} />
                <Route path="/" element={<ProtectedAppRoute><DashboardPage /></ProtectedAppRoute>} />
                <Route path="/biblioteca" element={<ProtectedAppRoute><BibliotecaPage /></ProtectedAppRoute>} />
                <Route path="/transcripciones" element={<ProtectedAppRoute><TranscripcionesPage /></ProtectedAppRoute>} />
                <Route
                  path="/analiticas"
                  element={
                    <ProtectedAppRoute>
                      <AnaliticasFiltersProvider>
                        <AnaliticasLayout />
                      </AnaliticasFiltersProvider>
                    </ProtectedAppRoute>
                  }
                >
                  <Route index element={<AnaliticasResumenPage />} />
                  <Route path="llamadas" element={<AnaliticasLlamadasPage />} />
                  <Route path="whatsapp" element={<AnaliticasWhatsappPage />} />
                </Route>
                <Route path="/analizador-total" element={<ProtectedAppRoute><AnalizadorTotalPage /></ProtectedAppRoute>} />
                <Route path="/extracciones" element={<ProtectedAppRoute><ExtraccionesPage /></ProtectedAppRoute>} />
                <Route path="/prompts" element={<ProtectedAppRoute><PromptsPage /></ProtectedAppRoute>} />
                <Route path="/consulta-ia" element={<ProtectedAppRoute><ConsultaIAPage /></ProtectedAppRoute>} />
                <Route path="/cuentas" element={<ProtectedAppRoute><CuentasPage /></ProtectedAppRoute>} />
                <Route path="/usuarios" element={<ProtectedAppRoute><UsuariosPage /></ProtectedAppRoute>} />
                <Route path="/roles" element={<ProtectedAppRoute><RolesPage /></ProtectedAppRoute>} />
                <Route path="/limites" element={<ProtectedAppRoute><LimitesPage /></ProtectedAppRoute>} />
                <Route path="/facturacion" element={<ProtectedAppRoute><FacturacionPage /></ProtectedAppRoute>} />
                <Route path="/auditoria" element={<ProtectedAppRoute><AuditoriaPage /></ProtectedAppRoute>} />
                <Route path="/soporte" element={<ProtectedAppRoute><SoportePage /></ProtectedAppRoute>} />
                <Route path="/conexion" element={<ProtectedAppRoute><ConexionPage /></ProtectedAppRoute>} />
                <Route path="/configuracion" element={<ProtectedAppRoute><ConfiguracionPage /></ProtectedAppRoute>} />
                <Route path="/modelos-transcripcion" element={<ProtectedAppRoute><ModelosTranscripcionPage /></ProtectedAppRoute>} />
                <Route path="/validacion-modelos" element={<ProtectedAppRoute><ValidacionModelosPage /></ProtectedAppRoute>} />
                <Route path="/analytics-whatsapp" element={<ProtectedAppRoute><AnalyticsWhatsappPage /></ProtectedAppRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </WhatsappUploadProvider>
          </AccountProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
