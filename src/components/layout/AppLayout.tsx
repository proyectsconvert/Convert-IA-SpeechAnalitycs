import { SidebarProvider } from "@/components/ui/sidebar";
import { RoutePermissionGuard } from "@/components/RoutePermissionGuard";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { BackgroundDataLoader } from "./BackgroundDataLoader";

export function AppLayout({ children }: { children: React.ReactNode }) {
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

