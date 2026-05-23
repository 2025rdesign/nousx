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

export const Route = createFileRoute("/_authenticated/galeria")({
  head: () => ({ meta: [{ title: "Galeria — AuraIA" }] }),
  component: Gallery,
});

type Filter = "all" | "chat" | "studio" | "audio";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "chat", label: "Chat" },
  { value: "studio", label: "Estúdio" },
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

  const query = useInfiniteQuery({
    queryKey: ["gallery-v2", filter],
    queryFn: ({ pageParam = 0 }) =>
      fetchList({ data: { filter, page: pageParam as number } }),
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length : undefined,
    initialPageParam: 0,
    staleTime: 30_000,
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
      notify.success("Item removido.");
    },
    onError: () => notify.error("Não foi possível excluir."),
  });

  const showAudios = filter === "audio";
  const lightboxItem =
    lightboxIdx !== null ? images[lightboxIdx] ?? null : null;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Galeria</h1>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
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
        </div>

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
              <AudioLines className="size-16 text-muted-foreground/40 mb-4" />
            ) : (
              <ImageIcon className="size-16 text-muted-foreground/40 mb-4" />
            )}
            <p className="text-base font-medium text-foreground">
              {showAudios
                ? "Nenhum áudio aqui ainda"
                : "Nenhuma imagem aqui ainda"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {showAudios
                ? "Gere áudios TTS no chat para vê-los aqui."
                : "Gere imagens no chat ou no Estúdio para vê-las aqui."}
            </p>
            {!showAudios && (
              <Button
                className="mt-4 gap-2"
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
                <div className="group relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(idx)}
                    className="block w-full h-full"
                  >
                    <img
                      src={img.image_url}
                      alt={img.prompt || "Imagem"}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
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
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center gap-2">
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