import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pagamento/pendente")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="max-w-md w-full text-center space-y-5 p-8 rounded-2xl border border-[#1E1E2E] bg-[#13131A]">
        <div className="mx-auto size-16 rounded-full bg-amber-500/15 flex items-center justify-center">
          <Clock className="size-9 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Pagamento em processamento</h1>
        <p className="text-sm text-zinc-400">
          Seu pagamento está sendo processado. Os créditos serão liberados automaticamente
          assim que confirmado.
        </p>
        <Button asChild className="w-full bg-[#6C47FF] hover:bg-[#7d5cff]">
          <Link to="/studio">Voltar para AuraIA</Link>
        </Button>
      </div>
    </div>
  );
}