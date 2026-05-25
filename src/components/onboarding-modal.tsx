import { useState, useCallback, useEffect } from "react";
import { MessageSquare, Wand2, Compass } from "lucide-react";

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: <MessageSquare className="size-8" />,
    title: "Bem-vindo à AuraIA",
    description:
      "Seu assistente de IA sem censura e sem limites. Pergunte qualquer coisa, explore sem julgamentos.",
  },
  {
    icon: <Wand2 className="size-8" />,
    title: "Crie imagens sem filtros",
    description:
      "No Estúdio de Criação você gera imagens de alta qualidade sem censura. Compre créditos ou ganhe via indicação e comece a criar agora.",
  },
  {
    icon: <Compass className="size-8" />,
    title: "Explore criações da comunidade",
    description:
      "Veja o que outros usuários estão criando e publique suas próprias criações para inspirar outros.",
  },
];

const STORAGE_KEY = "auraia-onboarding-done";

function readOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  // Bail out IMMEDIATELY if the flag exists — never render the modal again.
  const [visible, setVisible] = useState<boolean>(() => !readOnboardingDone());

  useEffect(() => {
    // Defensive re-check in case the first render happened during SSR.
    if (readOnboardingDone()) {
      setVisible(false);
    }
  }, []);

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  const nextStep = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      markDone();
    }
  }, [step, markDone]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`size-2.5 rounded-full transition-all duration-300 ${
                i === step
                  ? "bg-primary w-6"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
              aria-label={`Ir para etapa ${i + 1}`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary">
            {current.icon}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-foreground mb-3">
          {current.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-center text-muted-foreground leading-relaxed mb-8">
          {current.description}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={nextStep}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all duration-150"
          >
            {isLast ? "Começar a criar" : "Próximo"}
          </button>
          <button
            onClick={markDone}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Pular
          </button>
        </div>
      </div>
    </div>
  );
}

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
