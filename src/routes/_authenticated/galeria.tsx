import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Play,
  Pause,
  Copy,
  Trash2,
  AudioLines,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { downloadAsset } from "@/lib/download";
import {
  listGallery,
  deleteGalleryItem,
  type GalleryItem,
} from "@/lib/gallery.functions";
import { GridPageSkeleton } from "@/components/route-skeletons";

export const Route = createFileRoute("/_authenticated/galeria")({
  component: Gallery,
  pendingComponent: GridPageSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
});

type Filter = "all" | "chat" | "studio" | "audio" | "video";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "chat", label: "Chat" },
  { value: "studio", label: "Estúdio" },
  { value: "video", label: "Vídeos" },
  { value: "audio", label: "Áudios" },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isCoarse;
}

function formatDuration(sec: number | null) {
  if (!sec || sec < 1) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Gallery() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listGallery);
  const delFn = useServerFn(deleteGalleryItem);
  const [filter, setFilter] = useState<Filter>("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [actionSheetIdx, setActionSheetIdx] = useState<number | null>(null);
  const isCoarsePointer = useCoarsePointer();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["gallery-v2", filter],
    queryFn: ({ pageParam = 0 }) =>
      fetchList({ data: { filter, page: pageParam as number } }),
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length : undefined,
    initialPageParam: 0,
    staleTime: 60_000,
  });

  const items = useMemo<GalleryItem[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const images = useMemo(
    () => items.filter((i): i is Extract<GalleryItem, { kind: "image" }> => i.kind === "image"),
    [items],
  );
  const audios = useMemo(
    () => items.filter((i): i is Extract<GalleryItem, { kind: "audio" }> => i.kind === "audio"),
    [items],
  );

  const del = useMutation({
    mutationFn: (v: { kind: "image" | "audio"; id: string }) =>
      delFn({ data: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gallery-v2"] });
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
      notify.success("Item removido.");
    },
    onError: () => notify.error("Não foi possível excluir."),
  });

  const showAudios = filter === "audio";
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelectMode = () => {
    if (selectMode) exitSelectMode();
    else setSelectMode(true);
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectedImages = useMemo(
    () => images.filter((i) => selectedIds.has(i.id)),
    [images, selectedIds],
  );
  const handleBulkDownload = async () => {
    if (selectedImages.length === 0) return;
    setBulkBusy(true);
    try {
      for (const img of selectedImages) {
        downloadAsset(
          img.image_url,
          `auraia-${img.source === "chat" ? "chat" : "studio"}-${img.id}.jpg`,
        );
        await new Promise((r) => setTimeout(r, 500));
      }
      notify.success(`${selectedImages.length} download(s) iniciado(s).`);
    } finally {
      setBulkBusy(false);
    }
  };
  const handleBulkDelete = async () => {
    if (selectedImages.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        selectedImages.map((img) =>
          delFn({ data: { kind: "image", id: img.id } }).catch(() => null),
        ),
      );
      notify.success(`${selectedImages.length} imagem(ns) removida(s).`);
      queryClient.invalidateQueries({ queryKey: ["gallery-v2"] });
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
      exitSelectMode();
    } catch {
      notify.error("Falha ao apagar algumas imagens.");
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  };

  const lightboxItem =
    lightboxIdx !== null ? images[lightboxIdx] ?? null : null;
  const actionSheetItem =
    actionSheetIdx !== null ? images[actionSheetIdx] ?? null : null;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Galeria</h1>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2 items-center">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-foreground/80 border-primary/40 hover:bg-primary/10",
                )}
              >
                {f.label}
              </button>
            );
          })}
          {!showAudios && images.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectMode}
              className={cn(
                "ml-auto px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                selectMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-foreground/80 border-primary/40 hover:bg-primary/10",
              )}
            >
              {selectMode ? "Concluído" : "Selecionar"}
            </button>
          )}
        </div>

        {/* Selection action bar */}
        {selectMode && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow">
            <span className="text-sm font-medium">
              {selectedIds.size} selecionada(s)
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                onClick={handleBulkDownload}
                disabled={selectedIds.size === 0 || bulkBusy}
                className="gap-2"
              >
                <Download className="size-4" />
                Baixar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={selectedIds.size === 0 || bulkBusy}
                className="gap-2"
              >
                <Trash2 className="size-4" />
                Apagar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={exitSelectMode}
                aria-label="Cancelar seleção"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {query.isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-muted/60 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!query.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {showAudios ? (
              <AudioLines size={48} className="text-[#6C47FF] mb-4" />
            ) : (
              <ImageIcon size={48} className="text-[#6C47FF] mb-4" />
            )}
            <p className="text-lg font-semibold text-foreground">
              {showAudios
                ? "Nenhum áudio aqui ainda"
                : "Sua galeria está vazia"}
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {showAudios
                ? "Gere áudios TTS no chat para vê-los aqui."
                : "Gere sua primeira imagem no Estúdio de Criação e ela aparecerá aqui automaticamente."}
            </p>
            {!showAudios && (
              <Button
                className="mt-5 gap-2 bg-[#6C47FF] hover:bg-[#5a39e6] text-white"
                onClick={() => navigate({ to: "/studio" })}
              >
                <Wand2 className="size-4" />
                Ir para o Estúdio
              </Button>
            )}
          </div>
        )}

        {/* Image grid */}
        {!showAudios && images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {images.map((img, idx) => (
              <div key={img.id} className="space-y-1.5">
                <div
                  className={cn(
                    "group relative aspect-square rounded-lg overflow-hidden bg-muted",
                    selectMode && selectedIds.has(img.id) &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-background",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(img.id);
                        return;
                      }
                      if (isCoarsePointer) {
                        setActionSheetIdx(idx);
                      } else {
                        setLightboxIdx(idx);
                      }
                    }}
                    className="block w-full h-full"
                  >
                    <img
                      src={img.image_url}
                      alt={img.prompt || "Imagem"}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-10 pointer-events-none">
                      <div
                        className={cn(
                          "size-6 rounded-md border-2 flex items-center justify-center transition-colors",
                          selectedIds.has(img.id)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-background/80 border-white/80",
                        )}
                      >
                        {selectedIds.has(img.id) && (
                          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  {!selectMode && (
                  <div className="absolute top-2 left-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                        img.source === "chat"
                          ? "bg-primary/80 text-primary-foreground"
                          : "bg-accent/80 text-accent-foreground",
                      )}
                    >
                      {img.source === "chat" ? "Chat" : "Estúdio"}
                    </span>
                  </div>
                  )}
                  {/* Desktop hover actions only — mobile uses the bottom sheet */}
                  {!selectMode && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden md:flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadAsset(
                          img.image_url,
                          `auraia-${img.source === "chat" ? "chat" : "studio"}-${Date.now()}.jpg`,
                        );
                      }}
                      className="pointer-events-auto inline-flex items-center justify-center size-9 rounded-full bg-background/90 text-foreground hover:bg-background"
                      aria-label="Baixar"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Excluir esta imagem?"))
                          del.mutate({ kind: "image", id: img.id });
                      }}
                      className="pointer-events-auto inline-flex items-center justify-center size-9 rounded-full bg-background/90 text-destructive hover:bg-background"
                      aria-label="Excluir"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground px-1">
                  {formatDate(img.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Audio list */}
        {showAudios && audios.length > 0 && (
          <div className="space-y-2">
            {audios.map((a) => (
              <AudioCard
                key={a.id}
                item={a}
                onDelete={() => del.mutate({ kind: "audio", id: a.id })}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {query.hasNextPage && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog
        open={lightboxItem !== null}
        onOpenChange={(o) => !o && setLightboxIdx(null)}
      >
        <DialogContent className="max-w-5xl bg-background border-border p-0">
          <DialogTitle className="sr-only">Imagem</DialogTitle>
          {lightboxItem && (
            <div className="relative">
              <img
                src={lightboxItem.image_url}
                alt={lightboxItem.prompt || "Imagem"}
                className="w-full max-h-[80vh] object-contain bg-black"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() =>
                    downloadAsset(
                      lightboxItem.image_url,
                      `auraia-${lightboxItem.source === "chat" ? "chat" : "studio"}-${Date.now()}.jpg`,
                    )
                  }
                  aria-label="Baixar"
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => setLightboxIdx(null)}
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </Button>
              </div>
              {images.length > 1 && lightboxIdx !== null && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIdx((i) =>
                        i === null ? null : (i - 1 + images.length) % images.length,
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/80 hover:bg-background flex items-center justify-center"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIdx((i) =>
                        i === null ? null : (i + 1) % images.length,
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/80 hover:bg-background flex items-center justify-center"
                    aria-label="Próxima"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
              <div className="p-4 space-y-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                      lightboxItem.source === "chat"
                        ? "bg-primary/80 text-primary-foreground"
                        : "bg-accent/80 text-accent-foreground",
                    )}
                  >
                    {lightboxItem.source === "chat" ? "Chat" : "Estúdio"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(lightboxItem.created_at)}
                  </span>
                </div>
                {lightboxItem.prompt && (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {lightboxItem.prompt}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mobile bottom sheet — touch devices only */}
      <Sheet
        open={actionSheetItem !== null}
        onOpenChange={(o) => !o && setActionSheetIdx(null)}
      >
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-2xl p-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <SheetHeader>
            <SheetTitle className="text-base">Opções</SheetTitle>
          </SheetHeader>
          {actionSheetItem && (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 min-h-[52px] text-base"
                onClick={() => {
                  notify.info("Publicação em breve.");
                  setActionSheetIdx(null);
                }}
              >
                🌐 Publicar
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 min-h-[52px] text-base"
                onClick={() => {
                  downloadAsset(
                    actionSheetItem.image_url,
                    `auraia-${actionSheetItem.source === "chat" ? "chat" : "studio"}-${Date.now()}.jpg`,
                  );
                  setActionSheetIdx(null);
                }}
              >
                ⬇️ Baixar
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 min-h-[52px] text-base text-destructive border-destructive/30"
                onClick={() => {
                  if (confirm("Tem certeza que deseja apagar esta imagem?")) {
                    del.mutate({ kind: "image", id: actionSheetItem.id });
                    setActionSheetIdx(null);
                  }
                }}
              >
                🗑️ Apagar
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-center min-h-[52px] text-base"
                onClick={() => setActionSheetIdx(null)}
              >
                ✕ Cancelar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {selectedIds.size} imagens?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AudioCard({
  item,
  onDelete,
}: {
  item: Extract<GalleryItem, { kind: "audio" }>;
  onDelete: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState<HTMLAudioElement | null>(() => {
    if (typeof window === "undefined" || !item.audio_url) return null;
    return new Audio(item.audio_url);
  });

  const togglePlay = () => {
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => undefined);
      audio.onended = () => setPlaying(false);
    }
  };

  const copyText = async () => {
    if (!item.text_content) return;
    await navigator.clipboard.writeText(item.text_content);
    notify.success("Texto copiado.");
  };

  const preview = (item.text_content || "").slice(0, 80);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={togglePlay}
        disabled={!item.audio_url}
        className="shrink-0 size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40"
        aria-label={playing ? "Pausar" : "Tocar"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2">
          {preview || "(sem texto)"}
          {item.text_content && item.text_content.length > 80 ? "…" : ""}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {formatDate(item.created_at)} · {formatDuration(item.duration_seconds)}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={copyText}
          className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground"
          aria-label="Copiar texto"
        >
          <Copy className="size-4" />
        </button>
        {item.audio_url && (
          <button
            type="button"
            onClick={() =>
              downloadAsset(item.audio_url!, `auraia-audio-${Date.now()}.mp3`)
            }
            className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground"
            aria-label="Baixar"
          >
            <Download className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm("Excluir este áudio?")) onDelete();
          }}
          className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-destructive"
          aria-label="Excluir"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}