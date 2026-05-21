
# NOUSX — Fase 1

Núcleo funcional: usuário entra, conversa ilimitado com a IA, vê saldo de créditos, troca tema. Studio / Explorar / Galeria ficam para fase 2.

## Escopo desta fase

1. Identidade visual + tema escuro (padrão) e claro
2. Lovable Cloud + schema completo do banco (já preparado para fase 2)
3. Autenticação email/senha em `/auth`
4. Chat em `/` com streaming, histórico, sugestões, upload de imagem
5. Header com saldo de créditos + toggle tema + menu do usuário
6. Página `/creditos` (visual, sem pagamento)
7. Página `/configuracoes` (perfil, tema, saldo)

Fora desta fase: `/studio`, `/explorar`, `/galeria`, integração AliveAI, pagamento real.

## Arquitetura

- Stack do template: TanStack Start + Tailwind v4 + shadcn + Lovable Cloud (Supabase).
- "Edge functions" do spec → `createServerFn` em `src/lib/*.functions.ts` (mesmo comportamento, sem deploy separado).
- Secrets: `DEEPSEEK_API_KEY` e `ALIVEAI_API_KEY` adicionados via `add_secret` (AliveAI fica guardada para fase 2).
- Streaming: rota server `src/routes/api/chat.ts` (POST, SSE) — `createServerFn` não envia stream, então rota raw HTTP é a opção correta. Auth via bearer token Supabase no header.

## Design system (`src/styles.css`)

Tokens em oklch equivalentes aos hex do spec:
- `--primary` #6C47FF, `--accent` #8B6FFF, `--destructive` #FF4757, `--success` #2ED573
- Dark (padrão): bg #0A0A0F, surface #13131A, elevated #1C1C26, border #2A2A3A, fg #F0F0FF, muted-fg #8888AA
- Light: bg #F8F8FF, surface #FFFFFF, elevated #F0F0FA, border #E0E0EE, fg #0A0A0F, muted-fg #666688
- Inter via Google Fonts no `__root` head
- Logo: componente `<NousxLogo>` (texto, X em accent)
- `dark` class no `<html>` controlada por `ThemeProvider` (localStorage `nousx-theme`, default `dark`)

## Banco (migration única)

Cria todas as tabelas do spec já agora (chat usa `conversations`/`messages`/`credits`; resto fica pronto para fase 2):
`profiles`, `credits`, `conversations`, `messages`, `character_profiles`, `characters`.

- RLS habilitado em todas; políticas `auth.uid() = user_id` (e via join para `messages`).
- Trigger `handle_new_user` cria `profiles` + `credits` (balance 5) no signup.
- Índices: `messages(conversation_id, created_at)`, `conversations(user_id, created_at desc)`.

## Auth (`/auth`)

- Tabs Login / Cadastro (shadcn Tabs).
- `supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })` e `signInWithPassword`.
- Erros traduzidos PT-BR (mapa de mensagens).
- Após sucesso → redirect `/`.
- `_authenticated` layout route com `beforeLoad` redirecionando para `/auth` se não logado.
- `onAuthStateChange` global no `__root` invalidando router + query cache.

## Chat (`/_authenticated/index` na raiz)

Layout shadcn Sidebar (collapsible icon) + área central.

**Sidebar:**
- Logo NOUSX
- Botão "+ Nova conversa"
- Lista de `conversations` agrupada por data (Hoje / Ontem / Últimos 7 dias / Mais antigos)
- Hover → botão deletar
- Rodapé: avatar + nome + ícone configurações → `/configuracoes`
- Mobile: drawer

**Área central:**
- Estado vazio: "NOUSX" grande + "No que posso ajudar?" + 4 cards de sugestão
- Mensagens com `react-markdown` + `react-syntax-highlighter` para code blocks
- Botão copiar no assistant
- Indicador "digitando" (3 pontos)
- Auto-scroll

**Input:**
- Textarea autoexpand (max 6 linhas) — usar `react-textarea-autosize`
- Botão clipe → upload JPG/PNG → preview chip → vira `image_url` da mensagem
- Toggle "Raciocínio" → flag que troca model
- Enviar com Enter / Shift+Enter quebra linha
- Placeholder "Pergunte qualquer coisa..."

**Fluxo de envio:**
1. Cria conversa se não houver (título = primeiras 30 chars truncadas, gerado após primeira resposta via update)
2. Insert mensagem `user` no banco
3. POST `/api/chat` com `{ conversationId, messages, reasoning, image? }` + Authorization bearer
4. Servidor: chama DeepSeek com `stream: true`, system prompt fixo do spec, repassa SSE
5. Cliente acumula chunks, atualiza UI; ao final faz insert da mensagem `assistant`
6. Imagem: converte para base64 no cliente, envia no content multimodal

**Rota `/api/chat` (server route):**
- Valida bearer com `supabaseAdmin.auth.getUser(token)`
- Monta payload DeepSeek (`deepseek-chat` ou `deepseek-reasoner`)
- Faz fetch streaming e devolve `Response(res.body)` com headers SSE
- Nunca menciona DeepSeek nos erros

## Créditos

- Hook `useCredits()` com TanStack Query → server fn `getCredits` (requireSupabaseAuth)
- Componente `<CreditsBadge>` no header mostra `balance` + ícone
- Chat NÃO consome créditos (só geração de imagem — fase 2)
- Página `/creditos`: 3 cards (Starter / Popular / Pro) com badge "Mais popular" no segundo. Botão "Comprar" → `toast("Em breve")`
- Página `/configuracoes`: tabs Geral / Aparência / Assinatura

## Header

Persistente dentro do layout `_authenticated`:
- Trigger sidebar (mobile)
- Espaço flexível
- `<CreditsBadge>` (clicável → `/creditos`)
- Toggle tema (sol/lua)
- Avatar com dropdown: Configurações / Sair

## Rotas finais

```
src/routes/
  __root.tsx              (providers + onAuthStateChange + Toaster)
  auth.tsx                (login/cadastro, pública)
  _authenticated.tsx      (guard + AppLayout com sidebar + header)
  _authenticated/
    index.tsx             (Chat)
    creditos.tsx
    configuracoes.tsx
  api/
    chat.ts               (POST SSE)
```

## Arquivos novos principais

- `src/components/theme-provider.tsx`, `theme-toggle.tsx`
- `src/components/nousx-logo.tsx`
- `src/components/chat/` (ChatView, MessageList, MessageItem, ChatInput, EmptyState, SuggestionCard, ConversationSidebar)
- `src/components/layout/app-layout.tsx`, `header.tsx`, `credits-badge.tsx`
- `src/lib/chat.functions.ts` (listConversations, getMessages, createConversation, deleteConversation, saveMessage, renameConversation)
- `src/lib/credits.functions.ts` (getCredits)
- `src/lib/i18n-errors.ts` (mapeamento de erros Supabase → PT-BR)
- `src/routes/api/chat.ts` (streaming)

## Detalhes técnicos para o usuário

- **Por que server route em vez de "edge function"**: o template TanStack Start já roda código de servidor; criar Supabase Edge Functions adicionaria deploy separado sem ganho. Comportamento (auth, streaming, secrets) idêntico.
- **Por que Tailwind v4**: o scaffold já vem configurado; downgrade para v3 quebraria shadcn e o build. Todos os tokens do spec são respeitados via CSS variables.
- **Trigger SQL**: `handle_new_user` roda como `security definer` para inserir em `profiles`/`credits` mesmo com RLS ligado.
- **Streaming SSE**: rota retorna `Response(res.body, { headers: { "Content-Type": "text/event-stream" } })` repassando o stream da DeepSeek sem buffering.
- **Mensagens multimodais**: quando há imagem, `content` vira array `[{type:"image_url",...},{type:"text",...}]` conforme spec DeepSeek vision.

## Próximas fases (não inclusas agora)

- Fase 2: `/studio` + `generate-character` + AliveAI WebSocket + `/galeria` + `/explorar`
- Fase 3: integração de pagamento real para os pacotes de crédito
