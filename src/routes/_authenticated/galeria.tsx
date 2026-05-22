import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  listMyProfiles,
  listMyCharacters,
} from "@/lib/studio.functions";

export const Route = createFileRoute("/_authenticated/galeria")({
  head: () => ({ meta: [{ title: "Galeria — NOUSX" }] }),
  component: Gallery,
});

function Gallery() {
  const fetchProfiles = useServerFn(listMyProfiles);
  const fetchChars = useServerFn(listMyCharacters);
  const [filter, setFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: profiles = [], isLoading: lp } = useQuery({
    queryKey: ["my-profiles"],
    queryFn: () => fetchProfiles(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const { data: items = [], isLoading: li } = useQuery({
    queryKey: ["gallery", filter],
    queryFn: () =>
      fetchChars({ data: { profileId: filter === "all" ? null : filter } }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const loading = lp || li;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Galeria</h1>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {loading && items.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-muted/60 animate-pulse" />
            ))}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => c.image_url && setLightbox(c.image_url)}
              className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-90 transition"
            >
              {c.image_url && (
                <img src={c.image_url} alt={c.name || "Imagem"} className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
        {items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-16">
            Sua galeria está vazia. Gere sua primeira imagem no Estúdio.
          </p>
        )}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl bg-background border-border p-0">
          <DialogTitle className="sr-only">Imagem</DialogTitle>
          {lightbox && (
            <div className="relative">
              <img src={lightbox} alt="Imagem" className="w-full max-h-[85vh] object-contain" />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button asChild size="icon" variant="secondary">
                  <a href={lightbox} download target="_blank" rel="noopener noreferrer" aria-label="Baixar">
                    <Download className="size-4" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => setLightbox(null)}
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}