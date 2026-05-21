import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listPublicCharacters, listPublicProfiles } from "@/lib/studio.functions";

const AGE_KEY = "nousx-age-confirmed";

export const Route = createFileRoute("/_authenticated/explorar")({
  head: () => ({ meta: [{ title: "Explorar — NOUSX" }] }),
  component: () => (
    <AppLayout>
      <Explore />
    </AppLayout>
  ),
});

function Explore() {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(localStorage.getItem(AGE_KEY) === "1");
  }, []);

  const fetchImages = useServerFn(listPublicCharacters);
  const fetchProfiles = useServerFn(listPublicProfiles);

  const { data: images = [] } = useQuery({
    queryKey: ["public-characters"],
    queryFn: () => fetchImages(),
    enabled: confirmed,
  });
  const { data: characters = [] } = useQuery({
    queryKey: ["public-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: confirmed,
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Explorar</h1>

        <Tabs defaultValue="images">
          <TabsList>
            <TabsTrigger value="images">Imagens</TabsTrigger>
            <TabsTrigger value="characters">Personagens</TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="mt-4">
            <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
              {images.map((c) => (
                <div key={c.id} className="break-inside-avoid rounded-lg overflow-hidden bg-muted">
                  {c.image_url && (
                    <img src={c.image_url} alt={c.name || ""} className="w-full h-auto" loading="lazy" />
                  )}
                </div>
              ))}
            </div>
            {images.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-16">
                Nada publicado ainda.
              </p>
            )}
          </TabsContent>

          <TabsContent value="characters" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {characters.map((p) => (
                <div key={p.id} className="rounded-lg overflow-hidden bg-muted">
                  {p.base_image_url && (
                    <img src={p.base_image_url} alt={p.name} className="w-full aspect-[3/4] object-cover" />
                  )}
                  <div className="p-2 text-sm font-medium truncate">{p.name}</div>
                </div>
              ))}
            </div>
            {characters.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-16">
                Nenhum personagem público ainda.
              </p>
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