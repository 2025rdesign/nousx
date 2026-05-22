import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { listPublicCharacters, listPublicProfiles } from "@/lib/studio.functions";

const AGE_KEY = "nousx-age-confirmed";

export const Route = createFileRoute("/_authenticated/explorar")({
  head: () => ({ meta: [{ title: "Explorar — NOUSX" }] }),
  component: Explore,
});

function Explore() {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(localStorage.getItem(AGE_KEY) === "1");
  }, []);

  const fetchImages = useServerFn(listPublicCharacters);
  const fetchProfiles = useServerFn(listPublicProfiles);

  const { data: images = [], isLoading: liImages } = useQuery({
    queryKey: ["public-characters"],
    queryFn: () => fetchImages(),
    enabled: confirmed,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const { data: characters = [], isLoading: liChars } = useQuery({
    queryKey: ["public-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: confirmed,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Defensive dedupe by id — the server already deduplicates, but this
  // guarantees no duplicate cards reach the grid.
  const uniqueImages = useMemo(() => dedupeById(images as any[]), [images]);
  const uniqueCharacters = useMemo(
    () => dedupeById(characters as any[]),
    [characters],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Explorar</h1>

        <Tabs defaultValue="images">
          <TabsPrimitive.List className="inline-flex h-8 items-center gap-5 border-b border-border bg-transparent p-0">
            <ThinTab value="images">Imagens</ThinTab>
            <ThinTab value="characters">Personagens</ThinTab>
          </TabsPrimitive.List>

          <TabsContent value="images" className="mt-4">
            {liImages && uniqueImages.length === 0 ? (
              <SkeletonGrid />
            ) : uniqueImages.length === 0 ? (
              <EmptyExplore />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {uniqueImages.map((c: any) => (
                  <Card
                    key={c.id}
                    imageUrl={c.image_url}
                    title={c.name || ""}
                    creatorName={c.creator_name}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="characters" className="mt-4">
            {liChars && uniqueCharacters.length === 0 ? (
              <SkeletonGrid />
            ) : uniqueCharacters.length === 0 ? (
              <EmptyExplore />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {uniqueCharacters.map((p: any) => (
                  <Card
                    key={p.id}
                    imageUrl={p.base_image_url}
                    title={p.name}
                    creatorName={p.creator_name}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!confirmed}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conteúdo adulto</DialogTitle>
            <DialogDescription>
              Esta seção contém imagens explícitas. Para continuar, confirme que você tem 18 anos ou mais.
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              localStorage.setItem(AGE_KEY, "1");
              setConfirmed(true);
            }}
          >
            Confirmo que tenho 18 anos
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ThinTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative h-8 px-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[#6C47FF] focus:outline-none"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

function Card({
  imageUrl,
  title,
  creatorName,
}: {
  imageUrl: string | null;
  title: string;
  creatorName?: string | null;
}) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-muted">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="w-full aspect-[3/4] object-cover"
          loading="lazy"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 p-2 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent">
        <UserAvatar name={creatorName} size={20} className="shrink-0" />
        <span className="text-xs font-medium text-white truncate">
          {title || "Sem título"}
        </span>
      </div>
    </div>
  );
}

function EmptyExplore() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-secondary p-4 mb-4">
        <Sparkles className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Ainda não há publicações. Seja o primeiro!
      </p>
      <Button asChild>
        <Link to="/studio">Criar no Estúdio</Link>
      </Button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-muted/60 animate-pulse" />
      ))}
    </div>
  );
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}