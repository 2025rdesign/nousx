import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pagamento/sucesso")({
  head: () => ({
    meta: [
      { name: "description", content: "Seu pagamento foi confirmado com sucesso." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="max-w-md w-full text-center space-y-5 p-8 rounded-2xl border border-[#1E1E2E] bg-[#13131A]">
        <div className="mx-auto size-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <CheckCircle2 className="size-9 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Pagamento confirmado!</h1>
        <p className="text-sm text-zinc-400">
          Seus créditos serão liberados em instantes. Você já pode fechar esta página.
        </p>
        <Button asChild className="w-full bg-[#6C47FF] hover:bg-[#7d5cff]">
          <Link to="/studio">Voltar para AuraIA</Link>
        </Button>
      </div>
    </div>
  );
}