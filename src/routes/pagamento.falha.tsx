import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pagamento/falha")({
  head: () => ({
    meta: [
      { title: "Pagamento não concluído — AuraIA" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FailPage,
});

function FailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="max-w-md w-full text-center space-y-5 p-8 rounded-2xl border border-[#1E1E2E] bg-[#13131A]">
        <div className="mx-auto size-16 rounded-full bg-rose-500/15 flex items-center justify-center">
          <XCircle className="size-9 text-rose-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Pagamento não concluído</h1>
        <p className="text-sm text-zinc-400">
          Não se preocupe, nenhum valor foi cobrado. Tente novamente quando quiser.
        </p>
        <Button asChild className="w-full bg-[#6C47FF] hover:bg-[#7d5cff]">
          <Link to="/studio">Tentar novamente</Link>
        </Button>
      </div>
    </div>
  );
}