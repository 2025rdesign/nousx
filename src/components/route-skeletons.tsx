import { cn } from "@/lib/utils";

/**
 * Instant skeletons shown by route `pendingComponent` while the next
 * page's code chunk or loader resolves. Set `pendingMs: 0` on the route
 * so these render the moment navigation starts (no blank screen).
 */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">{children}</div>
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("h-4 rounded bg-muted/60 animate-pulse", className)} />
  );
}

export function GridPageSkeleton() {
  return (
    <Page>
      <Bar className="h-7 w-40" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-lg bg-muted/60 animate-pulse"
          />
        ))}
      </div>
    </Page>
  );
}

export function StudioSkeleton() {
  return (
    <Page>
      <Bar className="h-7 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-3">
          <Bar className="h-10" />
          <Bar className="h-32" />
          <Bar className="h-10 w-1/2" />
          <Bar className="h-24" />
          <Bar className="h-10 w-1/3" />
        </div>
        <div className="aspect-square rounded-lg bg-muted/60 animate-pulse" />
      </div>
    </Page>
  );
}

export function SettingsSkeleton() {
  return (
    <Page>
      <Bar className="h-7 w-56" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </Page>
  );
}