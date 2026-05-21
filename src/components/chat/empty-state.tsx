import { NousxLogo } from "@/components/nousx-logo";
import { useMemo } from "react";

const SUGGESTIONS = [
  "Me conta um segredo que a maioria das pessoas não sabe",
  "Escreva uma cena de romance intensa entre dois personagens",
  "Qual o jeito mais rápido de aprender programação do zero?",
  "Me explica como funciona o mercado financeiro de forma direta",
  "Crie um personagem de RPG completo pra mim",
  "Qual droga é menos prejudicial à saúde?",
  "Me ajuda a escrever uma mensagem sedutora",
  "Como funciona a mente de um psicopata?",
  "Me dá uma ideia genial pra um app que ninguém fez ainda",
  "Explica a teoria do caos como se eu tivesse 12 anos",
  "Escreva um conto curto sobre uma cidade flutuante",
  "Me ajuda a montar um plano de treino de 4 dias",
  "Qual livro mudou mais cabeças no século XX?",
  "Me ensina um truque mental pra dormir em 5 minutos",
  "Como negociar salário sem parecer arrogante?",
  "Escreva uma carta de despedida poética",
  "O que a física quântica diz sobre a realidade?",
  "Me dá 5 ideias de encontro fora do comum",
  "Como começar a investir com pouco dinheiro?",
  "Crie uma piada que só gente inteligente entende",
];

function pickFour() {
  const arr = [...SUGGESTIONS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4);
}

export function EmptyState({
  onPick,
}: {
  onPick: (s: string) => void;
}) {
  const suggestions = useMemo(pickFour, []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <NousxLogo className="text-5xl md:text-6xl" />
      <p className="mt-3 text-base md:text-lg text-muted-foreground">
        No que posso ajudar?
      </p>
      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-2">
        {suggestions.map((s) => (
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