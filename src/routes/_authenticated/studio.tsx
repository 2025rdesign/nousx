import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  listPoses,
} from "@/lib/studio.functions";
import { cn } from "@/lib/utils";
import { CreditPurchaseModal } from "@/components/payments/credit-purchase-modal";
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

function CreditsPill({
  balance,
  onClick,
  compact,
}: {
  balance: number;
  onClick: () => void;
  compact?: boolean;
}) {
  const danger = balance < 5;
  const empty = balance === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={empty ? "Sem créditos" : `${balance} créditos`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        danger
          ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-card hover:border-accent hover:text-accent",
        empty && "animate-pulse",
      )}
    >
      {danger ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <SparklesIcon className="size-3.5 text-accent" />
      )}
      <span>
        {balance}
        {!compact && " créditos"}
      </span>
    </button>
  );
}

function StudioInner() {
  const qc = useQueryClient();
  const fetchProfiles = useServerFn(listMyProfiles);
  const fetchChars = useServerFn(listMyCharacters);
  const genFn = useServerFn(generateCharacter);
  const toggleFn = useServerFn(togglePublic);
  const deleteFn = useServerFn(deleteCharacter);
  const fetchCredits = useServerFn(getCredits);
  const fetchPoses = useServerFn(listPoses);
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
  const [model, setModel] = useState<"DEFAULT" | "REALISM" | "ANIME" | "TEMPORARY" | "ANIMA">("DEFAULT");
  const [gender, setGender] = useState<"FEMALE" | "MALE" | "TRANS">("FEMALE");
  const [name, setName] = useState("");
  const [createProfile, setCreateProfile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creativity, setCreativity] = useState<"low" | "medium" | "high">("medium");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [improving, setImproving] = useState(false);
  const improveFn = useServerFn(improvePrompt);

  // Pose, quality and face-ref state
  const [poseEnabled, setPoseEnabled] = useState(false);
  const [poseId, setPoseId] = useState<string | null>(null);
  const [poseType, setPoseType] = useState<string | null>(null);
  const [highQuality, setHighQuality] = useState(false);

  const { data: poses = [], isLoading: posesLoading, isError: posesError } = useQuery({
    queryKey: ["alive-poses"],
    queryFn: () => fetchPoses(),
    enabled: poseEnabled,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const groupedPoses = useMemo(() => {
    const groups: Record<string, Array<{ id: string; name: string; type?: string | null; thumbnail?: string }>> = {
      Standing: [], Sitting: [], Lying: [], Kneeling: [], "All Fours": [], Other: [],
    };
    for (const p of poses as Array<{ id: string; name: string; type?: string | null; thumbnail?: string }>) {
      const n = `${p.name || ""} ${p.type || ""}`.toLowerCase();
      if (/all.?four|on all fours|doggy/.test(n)) groups["All Fours"].push(p);
      else if (/stand/.test(n)) groups.Standing.push(p);
      else if (/sit/.test(n)) groups.Sitting.push(p);
      else if (/ly(ing)?|lay/.test(n)) groups.Lying.push(p);
      else if (/kneel/.test(n)) groups.Kneeling.push(p);
      else groups.Other.push(p);
    }
    return groups;
  }, [poses]);

  const cost = highQuality ? 2 : 1;

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
            poseId: poseEnabled ? poseId ?? undefined : undefined,
            poseType: poseEnabled ? poseType ?? undefined : undefined,
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
          creativity,
          negativePrompt: negativePrompt.trim() || undefined,
          detailLevel: highQuality ? "HIGH" : "MEDIUM",
          poseId: poseEnabled ? poseId ?? undefined : undefined,
          poseType: poseEnabled ? poseType ?? undefined : undefined,
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

  // Simulated progress bar: fast to 85% in 8s, slow to 95%, jumps to 100% on success
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!isLoading) {
      if (result) {
        setProgress(100);
        const t = setTimeout(() => setProgress(0), 700);
        return () => clearTimeout(t);
      }
      setProgress(0);
      return;
    }
    setProgress(2);
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      let p: number;
      if (elapsed < 8) p = (elapsed / 8) * 85;
      else p = Math.min(95, 85 + (elapsed - 8) * 0.5);
      setProgress(p);
    }, 120);
    return () => clearInterval(iv);
  }, [isLoading, result]);

  const Sidebar = (
    <div className="flex flex-col h-full bg-[#0D0D14]">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Personagens
        </h2>
      </div>
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveProfileId(null);
            setMobileSidebarOpen(false);
          }}
          className="w-full h-9 flex items-center justify-center gap-2 rounded-md border border-[#6C47FF] bg-transparent text-white text-[13px] transition-colors hover:bg-[#6C47FF]/20"
        >
          <Plus className="size-4" />
          Novo personagem
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y divide-white/[0.03]">
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
            <p className="text-xs text-muted-foreground text-center py-6 px-3">
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
      <aside className="hidden lg:flex w-[250px] shrink-0 border-r border-[#1a1a2e]">{Sidebar}</aside>
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
          <CreditsPill balance={balance} onClick={() => setCreditsOpen(true)} compact />
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

      <div className="flex-1 min-w-0 flex flex-col lg:flex-row min-h-0">
        {/* Center panel */}
        <section
          className={cn(
            "studio-scroll lg:w-[400px] lg:shrink-0 lg:flex-none flex-1 min-w-0 overflow-auto lg:border-r lg:border-border",
            "md:block",
            mobileTab === "criar" ? "block" : "hidden",
          )}
        >
          <div className="w-full max-w-2xl lg:max-w-none mx-auto p-3 md:p-6 space-y-5">
            <div className="hidden md:flex lg:hidden items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(true)}>
                Personagens
              </Button>
            </div>
            <div className="hidden md:flex items-center justify-end">
              <CreditsPill balance={balance} onClick={() => setCreditsOpen(true)} />
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="size-1.5 rounded-full bg-success" />
                    <span className="text-[10px] text-success leading-none">Consistente</span>
                  </div>
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
                        <SelectItem value="DEFAULT">NOUSX Standard</SelectItem>
                        <SelectItem value="REALISM">NOUSX Ultra HD</SelectItem>
                        <SelectItem value="ANIME">NOUSX Anime</SelectItem>
                        <SelectItem value="ANIMA">NOUSX Art</SelectItem>
                        <SelectItem value="TEMPORARY">NOUSX Dream</SelectItem>
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
                      const r = await improveFn({
                        data: { prompt: appearance.trim(), model },
                      });
                      setAppearance(r.prompt);
                      if (r.negativePrompt) setNegativePrompt(r.negativePrompt);
                      notify.success("Prompt melhorado!");
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

            {/* Pose selector */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={poseEnabled} onCheckedChange={(v) => { setPoseEnabled(v); if (!v) { setPoseId(null); setPoseType(null); } }} />
                <div className="flex-1">
                  <div className="text-sm font-medium">Pose</div>
                  <p className="text-xs text-muted-foreground">
                    Escolha uma pose específica ou deixe a IA decidir.
                  </p>
                </div>
              </label>
              {poseEnabled && (
                <div className="space-y-3 pt-1">
                  {posesLoading ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" />
                      Carregando poses...
                    </p>
                  ) : posesError || poses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Poses indisponíveis no momento.
                    </p>
                  ) : (
                    Object.entries(groupedPoses).map(([group, items]) =>
                      items.length === 0 ? null : (
                        <div key={group} className="space-y-1.5">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {group}
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                            {items.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { setPoseId(p.id); setPoseType(p.type ?? null); }}
                                className={cn(
                                  "aspect-square rounded-md border overflow-hidden bg-muted text-[10px] flex items-end justify-center transition-colors",
                                  poseId === p.id
                                    ? "border-primary ring-2 ring-primary/40"
                                    : "border-border hover:border-foreground/40",
                                )}
                                title={p.name}
                              >
                                {p.thumbnail ? (
                                  <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="p-1 truncate">{p.name}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>
              )}
            </div>

            {/* High quality toggle */}
            {!activeProfile && (
              <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer">
                <Switch checked={highQuality} onCheckedChange={setHighQuality} />
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    Alta qualidade
                    {highQuality && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                        +1 crédito
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Renderização em alto detalhe (HIGH). Consome 2 créditos.
                  </p>
                </div>
              </label>
            )}

            <div className="rounded-lg border border-border">
              <button
                type="button"
                className="w-full px-3 py-2.5 text-xs font-medium text-left text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                Avançado
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
                      Prompt negativo
                    </Label>
                    <Input
                      id="negative"
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="O que você NÃO quer na imagem. Ex: deformado, borrado, má iluminação, texto, marcas d'água..."
                      maxLength={500}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Esta geração custará <span className="font-semibold text-foreground">{cost} crédito{cost > 1 ? "s" : ""}</span>.
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
                "Criar Variacao"
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
            "lg:flex-1 lg:min-w-0 shrink-0 border-t lg:border-t-0 border-border bg-sidebar/40 overflow-auto",
            "md:block",
            mobileTab === "resultado" ? "block" : "hidden",
          )}
        >
          <div className="p-3 md:p-6 space-y-4 lg:min-h-full lg:flex lg:flex-col">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Resultado</h3>
              {(isLoading || progress > 0) && (
                <Progress value={progress} className="h-1 bg-primary/15" />
              )}
            </div>
            <div
              className={cn(
                "w-full mx-auto rounded-lg overflow-hidden bg-muted relative",
                "max-w-sm lg:max-w-none lg:w-full lg:flex-1 lg:flex lg:items-center lg:justify-center lg:max-h-[70vh] lg:bg-transparent",
                "lg:" + "",
              )}
              style={{}}
            >
              <div
                className={cn(
                  "relative w-full lg:max-h-[70vh] lg:w-auto lg:h-full overflow-hidden rounded-lg bg-muted",
                  RATIOS.find((r) => r.value === aspect)!.classes,
                )}
              >
              {isLoading && (
                <>
                  <Skeleton className="absolute inset-0 rounded-lg" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                    <Loader2 className="size-7 animate-spin text-primary" />
                    <p className="text-sm text-foreground font-medium text-center">
                      Gerando sua imagem...
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
                      {LOADING_TEXTS[loadingTextIdx]}
                    </p>
                  </div>
                </>
              )}
              {!isLoading && result && (
                <img src={result} alt="Resultado" className="w-full h-full object-contain lg:object-contain" />
              )}
              {!isLoading && !result && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  A imagem aparecerá aqui.
                </div>
              )}
              </div>
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
              <div className="grid grid-cols-3 gap-1.5">
                {history.map((c) => (
                  <div
                    key={c.id}
                    className="relative group h-[120px] rounded-lg overflow-hidden bg-muted cursor-pointer transition-transform hover:scale-105"
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