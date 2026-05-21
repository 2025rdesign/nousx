import { NousxLogo } from "@/components/nousx-logo";

export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <NousxLogo className="text-5xl md:text-6xl" />
      <p className="mt-3 text-base md:text-lg text-muted-foreground">
        No que posso ajudar?
      </p>
    </div>
  );
}