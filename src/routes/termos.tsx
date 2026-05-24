import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Aura Chat" },
      {
        name: "description",
        content: "Termos e condições de uso da plataforma Aura Chat.",
      },
      { property: "og:title", content: "Termos de Uso — Aura Chat" },
      {
        property: "og:description",
        content: "Termos e condições de uso da plataforma Aura Chat.",
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
          <h2 className="text-xl font-semibold pt-4">1. Aceitação</h2>
          <p>
            Ao acessar e utilizar a AuraIA (&quot;Plataforma&quot;), uma plataforma
            de inteligência artificial generativa, você concorda integralmente com
            estes Termos. Se não concorda, não utilize o serviço.
          </p>

          <h2 className="text-xl font-semibold pt-4">2. Restrição etária (18+)</h2>
          <p>
            O serviço é destinado <strong>exclusivamente a maiores de 18 anos</strong>.
            Ao se cadastrar, você declara, sob as penas da lei, ter idade igual ou
            superior a 18 anos. Contas de menores serão imediatamente encerradas.
          </p>

          <h2 className="text-xl font-semibold pt-4">3. Uso permitido</h2>
          <p>
            É <strong>proibido</strong> utilizar a Plataforma para fins ilegais
            ou que prejudiquem terceiros, incluindo: difamação, assédio, fraude,
            engenharia social, geração de malware, violação de propriedade
            intelectual e qualquer prática vedada pela legislação brasileira.
          </p>
          <p>
            É <strong>terminantemente proibido</strong> gerar, tentar gerar,
            armazenar ou compartilhar conteúdo envolvendo menores de idade.
            Violações serão reportadas às autoridades competentes.
          </p>

          <h2 className="text-xl font-semibold pt-4">4. Responsabilidade do usuário</h2>
          <p>
            Você é <strong>inteiramente responsável</strong> pelos prompts que
            envia, pelo conteúdo gerado a partir deles e pelo uso que faz desse
            conteúdo. A AuraIA <strong>não se responsabiliza</strong> pelo
            conteúdo produzido pelos usuários por meio da Plataforma.
          </p>

          <h2 className="text-xl font-semibold pt-4">5. Suspensão e encerramento</h2>
          <p>
            A AuraIA reserva-se o direito de <strong>suspender ou encerrar
            contas a qualquer momento, sem aviso prévio</strong>, em caso de
            violação destes Termos, suspeita de fraude ou uso indevido.
          </p>

          <h2 className="text-xl font-semibold pt-4">6. Conteúdo gerado e licença</h2>
          <p>
            Todas as imagens e textos gerados pertencem ao usuário que os
            produziu. Em contrapartida, o usuário concede à AuraIA uma{" "}
            <strong>licença perpétua, mundial e gratuita</strong> para utilizar
            esse conteúdo de forma <strong>anonimizada</strong>, para fins de
            melhoria do modelo, segurança e marketing da Plataforma.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Pagamentos e reembolso</h2>
          <p>
            Pagamentos são processados por gateways terceirizados. A AuraIA não
            armazena dados de cartão. <strong>Créditos consumidos não são
            reembolsáveis</strong>. Assinaturas podem ser canceladas a qualquer
            momento e permanecem ativas até o fim do ciclo já pago.
          </p>

          <h2 className="text-xl font-semibold pt-4">8. Alterações de preço e funcionalidades</h2>
          <p>
            A AuraIA pode alterar preços, planos, modelos de IA disponíveis e
            funcionalidades <strong>a qualquer momento</strong>, mediante
            comunicação na própria Plataforma.
          </p>

          <h2 className="text-xl font-semibold pt-4">9. Limitação de responsabilidade</h2>
          <p>
            O serviço é fornecido &quot;como está&quot;. A AuraIA{" "}
            <strong>não garante a precisão, veracidade ou adequação</strong> das
            respostas geradas pela IA, e não se responsabiliza por decisões
            tomadas com base nelas, indisponibilidades temporárias ou danos
            indiretos decorrentes do uso.
          </p>

          <h2 className="text-xl font-semibold pt-4">10. Dados pessoais</h2>
          <p>
            O tratamento de dados pessoais é descrito na nossa{" "}
            <Link to="/privacidade" className="underline">
              Política de Privacidade
            </Link>
            .
          </p>

          <h2 className="text-xl font-semibold pt-4">11. Contato</h2>
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
