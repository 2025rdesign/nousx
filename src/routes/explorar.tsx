import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ArrowLeft, Sparkles, Wand2, Compass } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { GridPageSkeleton } from "@/components/route-skeletons";
import { useTheme } from "@/components/theme-provider";
import { useRouter } from "@tanstack/react-router";

const AGE_KEY = "nousx-age-confirmed";
const LOGO_DARK =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png";
const LOGO_LIGHT =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH-VARIANTE-MODO-CLARO.png";

export const Route = createFileRoute("/explorar")({
  component: Explore,
  pendingComponent: GridPageSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
});

function Explore() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(localStorage.getItem(AGE_KEY) === "1");
  }, []);

  // Refresh Explorar in real-time when someone publishes (toggles is_public)
  useEffect(() => {
    const channel = supabase
      .channel("explore-public-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "characters" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["public-characters"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "character_profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["public-profiles"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: images = [], isLoading: liImages } = useQuery({
    queryKey: ["public-characters"],
    queryFn: fetchPublicCharacters,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const { data: characters = [], isLoading: liChars } = useQuery({
    queryKey: ["public-profiles"],
    queryFn: fetchPublicProfiles,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const uniqueImages = useMemo(
    () => dedupeById(images as any[]),
    [images],
  );
  const uniqueCharacters = useMemo(
    () => dedupeById(characters as any[]),
    [characters],
  );

  const goAuth = (tab: "login" | "signup") => {
    if (user) {
      navigate({ to: "/studio" });
      return;
    }
    navigate({ to: "/auth", search: { tab } as any });
  };

  const handleCardCta = () => {
    if (user) navigate({ to: "/studio" });
    else goAuth("signup");
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/" });
    }
  };

  const logoSrc = theme === "dark" ? LOGO_DARK : LOGO_LIGHT;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1 px-2"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
            <Link to="/" className="flex items-center shrink-0">
              <img
                src={logoSrc}
                alt="AuraIA"
                className="h-10 max-h-10 w-auto object-contain"
              />
            </Link>
          </div>
          <nav className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/galeria">Galeria</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/studio">Estúdio</Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => goAuth("login")}>
                  Entrar
                </Button>
                <Button size="sm" onClick={() => goAuth("signup")}>
                  Criar conta
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        {/* Conversion banner (anonymous only) */}
        {!user && (
          <div className="rounded-xl border border-[#6C47FF]/60 bg-gradient-to-br from-[#1a1030] to-[#0f0a1f] p-5 md:p-6 shadow-[0_0_40px_-12px_rgba(108,71,255,0.5)]">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="shrink-0 size-12 rounded-full bg-[#6C47FF]/15 border border-[#6C47FF]/40 flex items-center justify-center">
                <Sparkles className="size-6 text-[#B49CFF]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg md:text-xl font-semibold">
                  Ganhe 5 créditos grátis ao criar sua conta
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gere imagens sem censura no Estúdio de Criação.
                  Sem filtros. Sem limites.
                </p>
              </div>
              <div className="flex gap-2 md:shrink-0">
                <Button
                  className="bg-[#6C47FF] hover:bg-[#5a39e6] text-white"
                  onClick={() => goAuth("signup")}
                >
                  Criar conta grátis
                </Button>
                <Button
                  variant="outline"
                  className="border-[#6C47FF]/60 text-foreground hover:bg-[#6C47FF]/10"
                  onClick={() => goAuth("login")}
                >
                  Já tenho conta
                </Button>
              </div>
            </div>
          </div>
        )}

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
              <MasonryGrid>
                {uniqueImages.map((c: any) => (
                  <Card
                    key={c.id}
                    imageUrl={c.image_url}
                    title={resolveTitle(c)}
                    creatorName={c.creator_name}
                    onCta={handleCardCta}
                  />
                ))}
              </MasonryGrid>
            )}
          </TabsContent>

          <TabsContent value="characters" className="mt-4">
            {liChars && uniqueCharacters.length === 0 ? (
              <SkeletonGrid />
            ) : uniqueCharacters.length === 0 ? (
              <EmptyExplore />
            ) : (
              <MasonryGrid>
                {uniqueCharacters.map((p: any) => (
                  <Card
                    key={p.id}
                    imageUrl={p.base_image_url}
                    title={resolveTitle(p)}
                    creatorName={p.creator_name}
                    onCta={handleCardCta}
                  />
                ))}
              </MasonryGrid>
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

function resolveTitle(row: any): string {
  const promptSnippet =
    typeof row?.prompt === "string" && row.prompt.trim()
      ? row.prompt.trim().slice(0, 30)
      : "";
  return (
    row?.display_name ||
    row?.name ||
    promptSnippet ||
    "Criação AuraIA"
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

function MasonryGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="gap-3 [column-fill:_balance]"
      style={{
        columnCount: undefined,
        columns: undefined,
      }}
    >
      <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Card({
  imageUrl,
  title,
  creatorName,
  onCta,
}: {
  imageUrl: string | null;
  title: string;
  creatorName?: string | null;
  onCta: () => void;
}) {
  return (
    <div className="break-inside-avoid mb-3 group relative rounded-lg overflow-hidden bg-muted">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-auto object-cover block"
          loading="lazy"
        />
      )}

      {/* Avatar (bottom-left, always visible) */}
      <div className="absolute bottom-2 left-2 z-10">
        <UserAvatar
          name={creatorName}
          size={28}
          className="shrink-0 ring-2 ring-black/40"
        />
      </div>

      {/* Hover overlay (desktop) */}
      <div className="absolute inset-0 hidden md:flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          className="bg-[#6C47FF] hover:bg-[#5a39e6] text-white gap-2"
          onClick={(e) => {
            e.stopPropagation();
            onCta();
          }}
        >
          <Wand2 className="size-4" />
          Criar algo assim
        </Button>
      </div>

      {/* Title strip */}
      <div className="absolute inset-x-0 bottom-0 p-2 pl-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <span className="text-xs font-medium text-white truncate block">
          {title}
        </span>
      </div>
    </div>
  );
}

function EmptyExplore() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Compass size={48} className="text-[#6C47FF] mb-4" />
      <p className="text-lg font-semibold text-foreground">
        Nenhuma criação publicada ainda
      </p>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mb-5">
        Seja o primeiro a compartilhar sua criação com a comunidade.
      </p>
      <Button asChild className="bg-[#6C47FF] hover:bg-[#5a39e6] text-white gap-2">
        <Link to="/studio">
          <Wand2 className="size-4" />
          Criar no Estúdio
        </Link>
      </Button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="break-inside-avoid mb-3 rounded-lg bg-muted/60 animate-pulse"
          style={{ height: `${160 + ((i * 37) % 140)}px` }}
        />
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

async function attachCreators<T extends { user_id?: string | null }>(
  rows: T[],
): Promise<Array<T & { creator_name: string | null }>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.user_id).filter(Boolean)),
  ) as string[];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, creator_name: null }));
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", ids);
  const map = new Map<string, string | null>(
    (data || []).map((p: any) => [p.id, p.name ?? null]),
  );
  return rows.map((r) => ({
    ...r,
    creator_name: r.user_id ? map.get(r.user_id) ?? null : null,
  }));
}

async function fetchPublicCharacters() {
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, image_url, created_at, user_id, profile_id")
    .eq("is_public", true)
    .eq("is_approved", true)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = dedupeById((data || []) as any[]);
  const profileIds = Array.from(
    new Set(rows.map((r: any) => r.profile_id).filter(Boolean)),
  ) as string[];
  let profileNameMap = new Map<string, string | null>();
  if (profileIds.length > 0) {
    const { data: profs } = await supabase
      .from("character_profiles")
      .select("id, name")
      .in("id", profileIds);
    profileNameMap = new Map(
      (profs || []).map((p: any) => [p.id, p.name ?? null]),
    );
  }
  const withTitles = rows.map((r: any) => ({
    ...r,
    display_name:
      (r.profile_id && profileNameMap.get(r.profile_id)) ||
      r.name ||
      "Criação AuraIA",
  }));
  return await attachCreators(withTitles);
}

async function fetchPublicProfiles() {
  const { data, error } = await supabase
    .from("character_profiles")
    .select("id, name, appearance, base_image_url, created_at, user_id")
    .eq("is_public", true)
    .eq("is_approved", true)
    .not("base_image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return await attachCreators(dedupeById((data || []) as any[]));
}