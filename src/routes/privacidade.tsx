import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — AuraIA" },
      {
        name: "description",
        content:
          "Como a AuraIA coleta, usa e protege seus dados pessoais conforme a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — AuraIA" },
      {
        property: "og:description",
        content: "Política de privacidade da plataforma AuraIA.",
      },
    ],
    links: [{ rel: "canonical", href: "https://chataura.com.br/privacidade" }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-12 space-y-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: 22 de maio de 2026
        </p>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-xl font-semibold pt-4">1. Quem somos</h2>
          <p>
            A AuraIA é uma plataforma brasileira de inteligência artificial.
            Esta política descreve como tratamos seus dados pessoais, em
            conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>

          <h2 className="text-xl font-semibold pt-4">2. Dados que coletamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>E-mail e nome informados no cadastro.</li>
            <li>CPF, quando informado para pagamento.</li>
            <li>Histórico de conversas e imagens geradas pelo seu usuário.</li>
            <li>Dados técnicos básicos (endereço IP, tipo de navegador) para
              segurança e prevenção a fraudes.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">3. Como usamos seus dados</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prestar o serviço contratado (chat e geração de imagens).</li>
            <li>Processar pagamentos por meio de gateways terceirizados.</li>
            <li>Prevenir abusos e cumprir obrigações legais.</li>
            <li>Comunicações operacionais sobre sua conta.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">4. Compartilhamento</h2>
          <p>
            Não vendemos seus dados. Compartilhamos apenas com:
            (i) gateways de pagamento, para processar cobranças;
            (ii) provedores de infraestrutura em nuvem, para hospedar a plataforma;
            (iii) autoridades, quando legalmente obrigados.
          </p>

          <h2 className="text-xl font-semibold pt-4">5. Pagamentos</h2>
          <p>
            Pagamentos são processados por terceiros. Não armazenamos dados de
            cartão de crédito em nossos servidores.
          </p>

          <h2 className="text-xl font-semibold pt-4">6. Retenção</h2>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa. Você pode
            solicitar a exclusão a qualquer momento pelo e-mail abaixo.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Seus direitos (LGPD)</h2>
          <p>
            Você pode solicitar acesso, correção, portabilidade ou exclusão dos
            seus dados, bem como revogar consentimentos. Para exercer, escreva
            para{" "}
            <a href="mailto:contato@chataura.com.br" className="underline">
              contato@chataura.com.br
            </a>
            .
          </p>

          <h2 className="text-xl font-semibold pt-4">8. Segurança</h2>
          <p>
            Adotamos medidas técnicas e administrativas razoáveis para proteger
            seus dados. Nenhum sistema é 100% seguro; em caso de incidente,
            notificaremos os titulares conforme a LGPD.
          </p>

          <h2 className="text-xl font-semibold pt-4">9. Contato</h2>
          <p>
            <a href="mailto:contato@chataura.com.br" className="underline">
              contato@chataura.com.br
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
