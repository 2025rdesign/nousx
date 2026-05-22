## Modo de Voz — AuraIA (xAI Voice Agent)

Exclusivo para usuários com plano **Ultra** ativo. Conversa por voz em tempo real via WebSocket com a xAI Realtime API.

### Arquivos novos

1. **`src/routes/api/voice-session.ts`** — endpoint POST autenticado
   - Usa `requireSupabaseAuth`
   - Valida plano Ultra (consulta `subscriptions` como em `use-active-plan`)
   - Chama `POST https://api.x.ai/v1/realtime/ephemeral-tokens` com `XAI_API_KEY`
   - Body: `{ model: "grok-voice-latest", ttl: 600 }`
   - Retorna `{ token, model, expiresAt }`
   - 403 se não for Ultra; tratamento de erro xAI com fallback amigável

2. **`src/components/chat/voice-mode-modal.tsx`** — modal principal
   - Estados: `idle | connecting | listening | processing | speaking | error`
   - Visual:
     - Círculo 120px central, glow roxo (#6C47FF), animações CSS dedicadas (`pulse`, `wave`, `rotate`)
     - Visualizador FFT 20 barras (Web Audio API `AnalyserNode`, `getByteFrequencyData`)
     - Rodapé com transcrição em tempo real + histórico das últimas 2 trocas
     - Botão "Encerrar conversa" (vermelho, centralizado), "Mudo", "Skip"
   - Mobile fullscreen / Desktop 480px centrado
   - Fundo `#0A0A0F`, borda roxa sutil, radius 16px
   - Sem emojis

3. **`src/lib/voice-session.ts`** — classe `VoiceSession` (cliente WebSocket)
   - `connect()`: busca token via serverFn, abre `wss://api.x.ai/v1/realtime?model=grok-voice-latest`, envia `session.update` com voz `ara`, língua `pt-BR`, system prompt do modo voz, `turn_detection: server_vad`, áudio `pcm16`
   - `startMic()`: `getUserMedia`, `AudioContext` (24kHz), `ScriptProcessorNode` para downsample → PCM16 → base64 → `input_audio_buffer.append`
   - `playOutput()`: fila de chunks PCM16 reproduzida via `AudioBufferSourceNode` encadeado (streaming sem cortes)
   - Eventos emitidos: `state`, `userTranscript`, `assistantTranscript`, `error`
   - `mute()`, `skip()` (`response.cancel`), `close()` (fecha WS, libera mic)
   - Timeout 60s sem fala, 1 retry automático em queda

4. **`src/lib/voice-session.functions.ts`** — `createVoiceSession` serverFn wrapping #1
   - Retorna token via RPC autenticado

5. **`src/styles.css`** — keyframes adicionais
   - `voice-pulse`, `voice-wave`, `voice-rotate`, `voice-glow`

### Arquivos modificados

6. **`src/components/chat/chat-input.tsx`**
   - Adicionar prop `onOpenVoiceMode` + flag `hasUltra`
   - Novo botão `Mic2` (roxo) entre o anexo e o `VoiceRecordButton`
   - Se não Ultra: opacity 0.4, tooltip "Modo de voz exclusivo do plano Ultra", clique abre modal de upgrade (reusar lógica de `blockAnon`/notify)
   - Se Ultra: chama `onOpenVoiceMode`

7. **`src/components/chat/chat-view.tsx`**
   - Estado `voiceOpen`, hook `useActivePlan()` → verifica `planId === 'ultra'`
   - Renderiza `<VoiceModeModal>` quando aberto
   - Ao encerrar: insere mensagem de texto com resumo da conversa (transcrições concatenadas) no chat

### Detalhes técnicos

- **PCM16 24kHz** é o formato padrão da xAI Realtime. AudioContext criado com `sampleRate: 24000`. Resample manual se navegador não aceitar.
- **Reprodução streaming**: cada `response.output_audio.delta` (base64 PCM16) é convertido para `Float32Array`, empacotado em `AudioBuffer` e agendado em `audioContext.currentTime` ou no fim do último buffer (`nextStartTime`).
- **Visualizador**: `AnalyserNode` com `fftSize: 64` → 20 barras (height = `dataArray[i] / 255 * maxHeight`).
- **System prompt** inclui instruções de brevidade (3-4 frases, sem markdown, tom casual, pt-BR).
- **Cleanup obrigatório**: `MediaStream.getTracks().forEach(stop)`, `audioContext.close()`, `ws.close()` no unmount/encerrar.
- **SSR safety**: todo uso de `AudioContext`, `getUserMedia`, `WebSocket` dentro de funções chamadas por eventos/`useEffect`, nunca no módulo.

### Fluxo do usuário

1. Clica em `Mic2` no input → abre modal (`connecting`)
2. Frontend chama `createVoiceSession()` → recebe token efêmero
3. WS conecta, envia `session.update`, pede permissão de mic → `listening`
4. Usuário fala → server VAD detecta fim → `processing`
5. Resposta em áudio chega em chunks → `speaking` + ondas
6. Loop até "Encerrar"
7. Ao encerrar: resumo aparece como mensagem no chat

### Fora de escopo

- Persistência da conversa de voz no banco (apenas resumo de texto)
- Suporte a anexos durante voz
- Modo de voz para anônimos

Confirma para implementar?
