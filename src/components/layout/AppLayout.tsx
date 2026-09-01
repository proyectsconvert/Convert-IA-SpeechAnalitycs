import { SidebarProvider } from "@/components/ui/sidebar";
import { RoutePermissionGuard } from "@/components/RoutePermissionGuard";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { AppTopBar } from "./AppTopBar";
import { BackgroundDataLoader } from "./BackgroundDataLoader";
import { useNavigationPreference } from "@/hooks/useNavigationPreference";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { layoutMode } = useNavigationPreference();

  // MODO 1: DOCK SUPERIOR (Espacio horizontal 100% libre para dashboards y analítica)
  if (layoutMode === "dock") {
    return (
      <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
        <BackgroundDataLoader />
        <AppTopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6 relative flex flex-col min-w-0">
          <RoutePermissionGuard>{children}</RoutePermissionGuard>
        </main>
      </div>
    );
  }

  // MODO 2: SIDEBAR CLÁSICO (100% preservado)
  return (
    <SidebarProvider>
      <div className="h-screen w-full flex overflow-hidden bg-background">
        <BackgroundDataLoader />
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <AppHeader />
          <main className="flex-1 overflow-auto p-4 md:p-6 relative flex flex-col">
            <RoutePermissionGuard>{children}</RoutePermissionGuard>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
