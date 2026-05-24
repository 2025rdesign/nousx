import { MessageCircle } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/5599984699061";

export function SupportContact() {
  return (
    <section className="mt-12">
      <div className="mx-auto max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Precisa de ajuda?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre em contato com nosso suporte pelo WhatsApp. Atendimento rápido e direto.
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#25D366" }}
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o Suporte
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          Aura Chat · contato via WhatsApp
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Suporte:{" "}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          WhatsApp (99) 98469-9061
        </a>
      </p>
    </section>
  );
}