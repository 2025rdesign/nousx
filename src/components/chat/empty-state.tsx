import { NousxLogo } from "@/components/nousx-logo";

const SUGGESTIONS = [
  "Explique a teoria do caos como se eu tivesse 12 anos",
  "Escreva um conto de 200 palavras sobre uma cidade flutuante",
  "Crie um plano de treino de 4 dias para iniciantes",
  "Compare estoicismo e budismo de forma direta",
];

export function EmptyState({
  onPick,
}: {
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <NousxLogo className="text-5xl md:text-6xl" />
      <p className="mt-3 text-base md:text-lg text-muted-foreground">
        No que posso ajudar?
      </p>
      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/80 hover:border-accent hover:text-foreground transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}