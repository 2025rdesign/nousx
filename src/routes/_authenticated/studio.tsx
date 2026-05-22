import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { notify } from "@/lib/notify";
import { AlertTriangle, ArrowLeft, Download, Globe, Lock, Loader2, Maximize2, Plus, Sparkles as SparklesIcon, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CharacterCard } from "@/components/studio/character-card";
import {
  listMyProfiles,
  listMyCharacters,
  generateCharacter,
  improvePrompt,
  togglePublic,
  deleteCharacter,
} from "@/lib/studio.functions";
import { cn } from "@/lib/utils";
import { CreditPurchaseModal } from "@/components/payments/credit-purchase-modal";
import { Sparkles } from "lucide-react";
import { getCredits } from "@/lib/credits.functions";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Estúdio — NOUSX" },
      { name: "description", content: "Crie personagens e variações com IA." },
    ],
  }),
  component: StudioPage,
});

const CHIPS = [
  "Sem roupa",
  "Lingerie",
  "Mudar cenário",
  "Nude na praia",
  "Close-up",
  "Corpo inteiro",
  "De costas",
  "Na cama",
  "Ao pôr do sol",
  "Molhada",
];

type Ratio = "9:16" | "16:9" | "1:1" | "4:5";
const RATIOS: Array<{ value: Ratio; label: string; classes: string }> = [
  { value: "9:16", label: "Story", classes: "aspect-[9/16]" },
  { value: "16:9", label: "Wide", classes: "aspect-video" },
  { value: "1:1", label: "Square", classes: "aspect-square" },
  { value: "4:5", label: "Portrait", classes: "aspect-[4/5]" },
];

const LOADING_TEXTS = [
  "Construindo o personagem...",
  "Refinando detalhes...",
  "Aplicando qualidade final...",
  "Quase pronto...",
];

function StudioPage() {
  return <StudioInner />;
}

function StudioInner() {
  const qc = useQueryClient();
  const fetchProfiles = useServerFn(listMyProfiles);
  const fetchChars = useServerFn(listMyCharacters);
  const genFn = useServerFn(generateCharacter);
  const toggleFn = useServerFn(togglePublic);
  const deleteFn = useServerFn(deleteCharacter);
  const fetchCredits = useServerFn(getCredits);
  const { data: creditsData } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
  });
  const balance = creditsData?.balance ?? 0;
  const [creditsOpen, setCreditsOpen] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["my-profiles"],
    queryFn: () => fetchProfiles(),
  });

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || null,
    [profiles, activeProfileId],
  );

  const { data: history = [] } = useQuery({
    queryKey: ["my-characters", activeProfileId],
    queryFn: () => fetchChars({ data: { profileId: activeProfileId } }),
  });

  // shared form state
  const [aspect, setAspect] = useState<Ratio>("4:5");
  const [appearance, setAppearance] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  // mode B (new) state
  const [model, setModel] = useState<"DEFAULT" | "REALISM" | "ANIME">("DEFAULT");
  const [gender, setGender] = useState<"FEMALE" | "MALE" | "TRANS">("FEMALE");
  const [name, setName] = useState("");
  const [createProfile, setCreateProfile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [blockExplicit, setBlockExplicit] = useState(false);
  const [creativity, setCreativity] = useState<"low" | "medium" | "high">("medium");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [improving, setImproving] = useState(false);
  const improveFn = useServerFn(improvePrompt);

  // result panel
  const [result, setResult] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"criar" | "resultado" | "personagens">("criar");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const insertChip = (chip: string) => {
    setAppearance((prev) => (prev ? `${prev}, ${chip.toLowerCase()}` : chip));
    textRef.current?.focus();
  };

  const gen = useMutation({
    mutationFn: async () => {
      const ratio = aspect;
      if (activeProfile) {
        return genFn({
          data: {
            mode: "variation",
            profileId: activeProfile.id,
            appearance,
            aspectRatio: ratio,
          },
        });
      }
      if (!name.trim()) throw new Error("Informe o nome.");
      return genFn({
        data: {
          mode: "new",
          name: name.trim(),
          model,
          gender,
          appearance,
          aspectRatio: ratio,
          createProfile,
          blockExplicitContent: blockExplicit,
          creativity,
          negativePrompt: negativePrompt.trim() || undefined,
        },
      });
    },
    onMutate: () => {
      setResult(null);
      setResultId(null);
      setLoadingTextIdx(0);
      const iv = setInterval(
        () => setLoadingTextIdx((i) => (i + 1) % LOADING_TEXTS.length),
        4000,
      );
      return { iv };
    },
    onSuccess: (res) => {
      setResult(res.mediaUrl);
      qc.invalidateQueries({ queryKey: ["my-characters"] });
      qc.invalidateQueries({ queryKey: ["my-profiles"] });
      qc.invalidateQueries({ queryKey: ["credits"] });
      notify.success("Imagem pronta.");
    },
    onError: (err) => {
      notify.error(err instanceof Error ? err.message : "Algo deu errado.");
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (ctx?.iv) clearInterval(ctx.iv);
    },
  });

  const isLoading = gen.isPending;

  const Sidebar = (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold">Personagens</h2>
      </div>
      <div className="p-2">
        <button
          type="button"
          onClick={() => {
            setActiveProfileId(null);
            setMobileSidebarOpen(false);
          }}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm",
            !activeProfileId && "border-primary text-primary",
          )}
        >
          <Plus className="size-4" />
          Novo personagem
        </button>
      </div>
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-1">
          {profiles.map((p) => (
            <CharacterCard
              key={p.id}
              profile={p}
              active={activeProfileId === p.id}
              onClick={() => {
                setActiveProfileId(p.id);
                setMobileSidebarOpen(false);
              }}
            />
          ))}
          {profiles.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-2">
              Você ainda não criou personagens.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="h-full flex flex-col md:flex-row">
      <CreditPurchaseModal open={creditsOpen} onOpenChange={setCreditsOpen} />
      {/* Studio sidebar (desktop) */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border">{Sidebar}</aside>
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72 hidden md:block lg:hidden">
          <SheetTitle className="sr-only">Personagens</SheetTitle>
          {Sidebar}
        </SheetContent>
      </Sheet>

      {/* Mobile tabs */}
      <div className="md:hidden border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao chat">
            <Link to="/">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <span className="text-sm font-semibold">Estúdio</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setCreditsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent transition-colors"
          >
            <Sparkles className="size-3.5 text-accent" />
            {balance}
          </button>
        </div>
        <div className="grid grid-cols-3">
          {([
            ["criar", "Criar"],
            ["resultado", "Resultado"],
            ["personagens", "Personagens"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileTab(v)}
              className={cn(
                "py-3 text-sm font-medium border-b-2 transition-colors",
                mobileTab === v
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col xl:flex-row min-h-0">
        {/* Center panel */}
        <section
          className={cn(
            "flex-1 min-w-0 overflow-auto",
            "md:block",
            mobileTab === "criar" ? "block" : "hidden",
          )}
        >
          <div className="w-full max-w-2xl mx-auto p-3 md:p-6 space-y-5">
            <div className="hidden md:flex lg:hidden items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(true)}>
                Personagens
              </Button>
            </div>
            <div className="hidden md:flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCreditsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent transition-colors"
              >
                <Sparkles className="size-3.5 text-accent" />
                {balance} créditos
              </button>
            </div>

            {activeProfile ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <div className="size-12 rounded-md overflow-hidden bg-muted shrink-0">
                  {activeProfile.base_image_url && (
                    <img
                      src={activeProfile.base_image_url}
                      alt={activeProfile.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{activeProfile.name}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                    Rosto preservado
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveProfileId(null)}
                  aria-label="Sair do personagem"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs text-muted-foreground">
                      Nome
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Aurora"
                      maxLength={60}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Estilo</Label>
                    <Select value={model} onValueChange={(v) => setModel(v as any)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEFAULT">Realista</SelectItem>
                        <SelectItem value="REALISM">Fotografia HD</SelectItem>
                        <SelectItem value="ANIME">Anime</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  {([
                    ["FEMALE", "Feminino"],
                    ["MALE", "Masculino"],
                    ["TRANS", "Trans"],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGender(v)}
                      className={cn(
                        "h-8 px-3 text-[13px] rounded-md border transition-colors",
                        gender === v
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="appearance" className="text-xs text-muted-foreground">
                Descrição
              </Label>
              <Textarea
                id="appearance"
                ref={textRef}
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                rows={6}
                placeholder={
                  activeProfile
                    ? "Descreva a nova cena: pose, roupa, cenário, iluminação..."
                    : "Descreva sua visão: aparência, roupa, cenário, pose, iluminação, estilo artístico... Quanto mais detalhes, melhor o resultado."
                }
                className="resize-none min-h-[120px] w-full text-[15px] leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!appearance.trim() || improving}
                  onClick={async () => {
                    try {
                      setImproving(true);
                      const r = await improveFn({ data: { prompt: appearance.trim() } });
                      setAppearance(r.prompt);
                      notify.success("✨ Prompt melhorado!");
                    } catch (e) {
                      notify.error(e instanceof Error ? e.message : "Erro ao melhorar.");
                    } finally {
                      setImproving(false);
                    }
                  }}
                >
                  {improving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Melhorando...
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-3.5" />
                      Melhorar prompt
                    </>
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {appearance.length}/2000
                </span>
              </div>
              {activeProfile && (
                <ScrollArea className="w-full">
                  <div className="flex gap-2 pb-2">
                    {CHIPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => insertChip(c)}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/70 text-foreground/80"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="space-y-2">
              <Label>Proporção</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RATIOS.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    variant={aspect === r.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAspect(r.value)}
                    className="flex-col h-auto py-2"
                  >
                    <span>{r.label}</span>
                    <span className="text-[10px] opacity-70">{r.value}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <button
                type="button"
                className="w-full px-3 py-2.5 text-xs font-medium text-left text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                Avançado {showAdvanced ? "▾" : "▸"}
              </button>
              {showAdvanced && (
                <div className="px-3 pb-3 space-y-4 border-t border-border pt-3">
                  {!activeProfile && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Switch checked={createProfile} onCheckedChange={setCreateProfile} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Salvar como personagem</div>
                        <p className="text-xs text-muted-foreground">
                          Permite recriar o mesmo rosto em variações futuras.
                        </p>
                      </div>
                    </label>
                  )}

                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Switch checked={blockExplicit} onCheckedChange={setBlockExplicit} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🔞 Bloquear conteúdo adulto</div>
                        <p className="text-xs text-muted-foreground">
                          Padrão desligado. Quando ativo, evita nudez e conteúdo explícito.
                        </p>
                      </div>
                    </label>
                    {blockExplicit && /\b(nua|pelada|nude|naked|sem roupa|sem calcinha|seios|peito|bunda|genital|vagina|p[êe]nis)\b/i.test(appearance) && (
                      <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>
                          Sua descrição contém conteúdo adulto. Ativar este filtro pode ignorar partes do seu prompt.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Nível de criatividade</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ["low", "Conservador"],
                        ["medium", "Equilibrado"],
                        ["high", "Criativo"],
                      ] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCreativity(v)}
                          className={cn(
                            "h-8 px-2 text-[12px] rounded-md border transition-colors",
                            creativity === v
                              ? "border-primary text-primary bg-primary/10"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="negative" className="text-xs text-muted-foreground">
                      Palavras a evitar
                    </Label>
                    <Input
                      id="negative"
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="Ex: deformado, borrado, texto..."
                      maxLength={500}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!appearance.trim() || isLoading}
              onClick={() => {
                gen.mutate();
                setMobileTab("resultado");
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Gerando...
                </>
              ) : activeProfile ? (
                "Criar Variação"
              ) : createProfile ? (
                "Gerar e Salvar Personagem"
              ) : (
                "Gerar Imagem"
              )}
            </Button>
          </div>
        </section>

        {/* Result panel */}
        <section
          className={cn(
            "xl:w-[380px] shrink-0 border-t xl:border-t-0 xl:border-l border-border bg-sidebar/40 overflow-auto",
            "md:block",
            mobileTab === "resultado" ? "block" : "hidden",
          )}
        >
          <div className="p-3 md:p-6 space-y-4">
            <h3 className="text-sm font-semibold">Resultado</h3>
            <div
              className={cn(
                "w-full max-w-sm mx-auto rounded-lg overflow-hidden bg-muted relative",
                RATIOS.find((r) => r.value === aspect)!.classes,
              )}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
                  <p className="text-sm text-muted-foreground px-4 text-center">
                    {LOADING_TEXTS[loadingTextIdx]}
                  </p>
                </div>
              )}
              {!isLoading && result && (
                <img src={result} alt="Resultado" className="w-full h-full object-cover" />
              )}
              {!isLoading && !result && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  A imagem aparecerá aqui.
                </div>
              )}
            </div>

            {result && (
              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <a href={result} download target="_blank" rel="noopener noreferrer">
                    <Download className="size-4" />
                    Baixar
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setLightboxOpen(true)}
                >
                  <Maximize2 className="size-4" />
                  Tela cheia
                </Button>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Histórico</h4>
              <div className="grid grid-cols-3 gap-2">
                {history.map((c) => (
                  <div
                    key={c.id}
                    className="relative group aspect-square rounded-md overflow-hidden bg-muted cursor-pointer"
                    onClick={() => {
                      if (c.image_url) {
                        setResult(c.image_url);
                        setResultId(c.id);
                        setMobileTab("resultado");
                      }
                    }}
                  >
                    {c.image_url && (
                      <img
                        src={c.image_url}
                        alt={c.name || "Variação"}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title={c.is_public ? "Tornar privada" : "Publicar"}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await toggleFn({ data: { id: c.id, isPublic: !c.is_public } });
                          qc.invalidateQueries({ queryKey: ["my-characters"] });
                          notify.success(c.is_public ? "Tornada privada." : "Publicada.");
                        }}
                      >
                        {c.is_public ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        title="Excluir"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("Excluir esta imagem?")) return;
                          await deleteFn({ data: { id: c.id } });
                          qc.invalidateQueries({ queryKey: ["my-characters"] });
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <p className="col-span-3 text-xs text-muted-foreground text-center py-4">
                    Nada por aqui ainda.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Personagens panel (mobile only as tab) */}
        <section
          className={cn(
            "flex-1 min-w-0 overflow-auto md:hidden",
            mobileTab === "personagens" ? "block" : "hidden",
          )}
        >
          {Sidebar}
        </section>
      </div>

      {/* Lightbox */}
      {lightboxOpen && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={result}
            alt="Resultado"
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="size-5" />
          </button>
          <a
            href={result}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 right-4 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Baixar"
          >
            <Download className="size-5" />
          </a>
        </div>
      )}
    </div>
  );
}