import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — AuraIA" },
      {
        name: "description",
        content:
          "Termos de uso da AuraIA — plataforma de inteligência artificial sem censura para maiores de 18 anos.",
      },
      { property: "og:title", content: "Termos de Uso — AuraIA" },
      {
        property: "og:description",
        content: "Termos de uso da plataforma AuraIA.",
      },
    ],
    links: [{ rel: "canonical", href: "https://chataura.com.br/termos" }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-12 space-y-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="text-3xl font-bold">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: 22 de maio de 2026
        </p>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-xl font-semibold pt-4">1. Aceitação dos termos</h2>
          <p>
            Ao criar uma conta e utilizar a AuraIA (&quot;a Plataforma&quot;), você
            declara ter lido, compreendido e aceito integralmente estes Termos de Uso.
            Se você não concorda, não utilize o serviço.
          </p>

          <h2 className="text-xl font-semibold pt-4">2. Restrição etária</h2>
          <p>
            O serviço é restrito a maiores de 18 (dezoito) anos. Ao se cadastrar,
            você declara, sob as penas da lei, ter idade igual ou superior a 18 anos.
            Contas de menores serão imediatamente encerradas.
          </p>

          <h2 className="text-xl font-semibold pt-4">3. Dados coletados</h2>
          <p>
            Para o funcionamento do serviço coletamos: endereço de e-mail, nome,
            CPF (quando informado para pagamento), histórico de mensagens e imagens
            geradas. O tratamento desses dados é descrito na nossa{" "}
            <Link to="/privacidade" className="underline">
              Política de Privacidade
            </Link>
            .
          </p>

          <h2 className="text-xl font-semibold pt-4">4. Pagamentos</h2>
          <p>
            Pagamentos de créditos e assinaturas são processados exclusivamente
            por gateways de pagamento terceirizados. A AuraIA não armazena dados
            de cartão de crédito. Cobranças, reembolsos e disputas são regidos
            pelas políticas do gateway utilizado.
          </p>

          <h2 className="text-xl font-semibold pt-4">5. Conteúdo gerado</h2>
          <p>
            O conteúdo gerado pela IA é produzido a partir das instruções do usuário.
            Você é integralmente responsável pelos prompts enviados e pelo uso que
            fizer das respostas e imagens geradas. É terminantemente proibido gerar,
            tentar gerar, armazenar ou distribuir qualquer conteúdo envolvendo
            menores de idade ou que viole leis brasileiras. Contas que violarem
            esta cláusula serão encerradas e poderão ser reportadas às autoridades.
          </p>

          <h2 className="text-xl font-semibold pt-4">6. Limitação de responsabilidade</h2>
          <p>
            O serviço é fornecido &quot;como está&quot;. A AuraIA não se
            responsabiliza por decisões tomadas com base em respostas da IA,
            indisponibilidades temporárias do serviço ou prejuízos indiretos
            decorrentes do uso.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Alterações</h2>
          <p>
            Podemos alterar estes termos a qualquer momento. A versão mais recente
            estará sempre disponível nesta página.
          </p>

          <h2 className="text-xl font-semibold pt-4">8. Contato</h2>
          <p>
            Dúvidas ou solicitações:{" "}
            <a href="mailto:contato@chataura.com.br" className="underline">
              contato@chataura.com.br
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
