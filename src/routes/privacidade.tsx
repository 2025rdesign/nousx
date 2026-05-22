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
            A AuraIA é uma plataforma brasileira de inteligência artificial
            generativa. Esta política descreve como tratamos seus dados
            pessoais em conformidade com a Lei Geral de Proteção de Dados
            (Lei 13.709/2018 — LGPD).
          </p>

          <h2 className="text-xl font-semibold pt-4">2. Dados que coletamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cadastro:</strong> nome, e-mail e senha (armazenada com hash).</li>
            <li><strong>Histórico de conversas</strong> trocadas com a IA.</li>
            <li><strong>Imagens geradas</strong> no Estúdio de Criação.</li>
            <li><strong>Dados de pagamento:</strong> processados por terceiros — <strong>não armazenamos cartão</strong>. CPF apenas quando exigido pelo gateway.</li>
            <li>Dados técnicos básicos (IP, navegador) para segurança e prevenção a fraude.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">3. Como usamos seus dados</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prestar e <strong>melhorar o serviço</strong> (chat, geração de imagens, suporte).</li>
            <li>Comunicações operacionais sobre sua conta e seus créditos.</li>
            <li>Prevenir abusos, fraudes e cumprir obrigações legais.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">4. Compartilhamento com terceiros</h2>
          <p>
            <strong>Não vendemos seus dados.</strong> Compartilhamos apenas com:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Processadores de pagamento</strong>, para cobranças e prevenção a fraude.</li>
            <li><strong>Provedores de IA</strong> (OpenAI, Google, xAI, DeepSeek e similares), para gerar as respostas — os prompts são enviados de forma <strong>anonimizada</strong>, sem dados de identificação do usuário.</li>
            <li>Provedores de infraestrutura em nuvem, para hospedar a Plataforma.</li>
            <li>Autoridades, quando legalmente obrigados.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">5. Cookies</h2>
          <p>
            Utilizamos <strong>apenas cookies essenciais de sessão</strong>,
            necessários para manter você autenticado. Não usamos cookies de
            rastreamento publicitário de terceiros.
          </p>

          <h2 className="text-xl font-semibold pt-4">6. Retenção</h2>
          <p>
            Mantemos seus dados <strong>enquanto sua conta estiver ativa</strong>.
            Após a exclusão da conta, removemos os dados em até{" "}
            <strong>30 dias</strong>, salvo obrigação legal de retenção.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Seus direitos (LGPD)</h2>
          <p>
            Você tem direito a <strong>acesso, correção, portabilidade,
            exclusão</strong> e revogação de consentimento sobre seus dados.
            Para exercer, escreva para{" "}
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
