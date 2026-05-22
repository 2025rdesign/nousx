import { ThemeImage } from "@/components/theme-image";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActivePlan } from "@/hooks/use-active-plan";
import { useAuth } from "@/hooks/use-auth";
import { getCredits } from "@/lib/credits.functions";

const DASHBOARD_DARK =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png";
const DASHBOARD_LIGHT =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH-VARIANTE-MODO-CLARO.png";

export function EmptyState() {
  const { user } = useAuth();
  const { hasActive, planId } = useActivePlan();
  const fetchCredits = useServerFn(getCredits);
  const { data } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const balance = data?.balance ?? 0;

  let info: string | null = null;
  if (hasActive && planId === "ultra") {
    info = "Você é assinante Ultra — acesso completo a todos os recursos.";
  } else if (hasActive && planId === "plus") {
    info = `Você é assinante Plus — ${balance} créditos disponíveis para imagens.`;
  } else if (balance > 0) {
    info = `Você tem ${balance} créditos para gerar imagens no Estúdio.`;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <ThemeImage
        darkSrc={DASHBOARD_DARK}
        lightSrc={DASHBOARD_LIGHT}
        alt="AuraIA"
        className="h-[160px] sm:h-[180px] md:h-[200px] w-auto max-w-[85vw] object-contain select-none"
        draggable={false}
      />
      <p className="mt-6 text-base md:text-lg lg:text-xl text-muted-foreground text-center">
        No que posso ajudar?
      </p>
      {info && (
        <p className="mt-2 text-xs text-muted-foreground/70 text-center">{info}</p>
      )}
    </div>
  );
}
