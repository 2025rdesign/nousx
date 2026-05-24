import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/creditos")({
  component: CreditsPage,
});

const PACKS = [
  { id: "starter", name: "Starter", credits: 20, price: "R$ 9,90", popular: false },
  { id: "popular", name: "Popular", credits: 60, price: "R$ 24,90", popular: true },
  { id: "pro", name: "Pro", credits: 150, price: "R$ 49,90", popular: false },
];

function CreditsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        <header className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Recarregue seus créditos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use créditos para gerar imagens. O chat é sempre ilimitado e gratuito.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PACKS.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "relative p-6 flex flex-col gap-4 border-border bg-card",
                p.popular && "border-accent ring-1 ring-accent/40",
              )}
            >
              {p.popular && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground">
                  Mais popular
                </Badge>
              )}
              <div>
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <Sparkles className="size-4 text-accent" />
                  <span className="text-3xl font-bold">{p.credits}</span>
                  <span className="text-sm text-muted-foreground">créditos</span>
                </p>
              </div>
              <p className="text-2xl font-bold text-foreground">{p.price}</p>
              <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> {p.credits} gerações de imagem
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> Chat ilimitado incluso
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> Sem expiração
                </li>
              </ul>
              <Button
                onClick={() =>
                  toast("Em breve", {
                    description: "Integração de pagamento chegando em breve.",
                  })
                }
                variant={p.popular ? "default" : "outline"}
              >
                Comprar
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}