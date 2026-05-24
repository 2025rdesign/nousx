import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { Loader2 } from "lucide-react";
import { cleanupStalePendingVideoJobs } from "@/lib/video-jobs.functions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const cleanupFn = useServerFn(cleanupStalePendingVideoJobs);
  const cleanedRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user || cleanedRef.current) return;
    cleanedRef.current = true;
    void cleanupFn().catch((e) => console.error("[VIDEO-CLEANUP]", e));
  }, [user, cleanupFn]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}