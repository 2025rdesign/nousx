import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { getProfile, updateProfile } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { translateAuthError } from "@/lib/i18n-errors";
import { useEffect, useState } from "react";
import { AvatarGrid, UserAvatar, AVATAR_PRESETS } from "@/components/user-avatar";
import { SubscriptionTab } from "@/components/payments/subscription-tab";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — NOUSX" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>
        <Tabs defaultValue="geral">
          <TabsList className="grid grid-cols-4 w-full mb-6">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="seguranca">Segurança</TabsTrigger>
            <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          </TabsList>
          <TabsContent value="geral"><GeneralTab /></TabsContent>
          <TabsContent value="aparencia"><AppearanceTab /></TabsContent>
          <TabsContent value="seguranca"><SecurityTab /></TabsContent>
          <TabsContent value="assinatura"><SubscriptionTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
  });

  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string>(AVATAR_PRESETS[0].id);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setAvatarId(profile.avatar_id ?? AVATAR_PRESETS[0].id);
    }
  }, [profile]);

  const saveName = useMutation({
    mutationFn: () => saveProfile({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      notify.success("Nome atualizado.");
    },
    onError: () => notify.error("Não foi possível salvar."),
  });

  const saveAvatar = useMutation({
    mutationFn: (id: string) => saveProfile({ data: { avatarId: id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
    onError: () => notify.error("Não foi possível salvar o avatar."),
  });

  function pickAvatar(id: string) {
    setAvatarId(id);
    saveAvatar.mutate(id);
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <UserAvatar avatarId={avatarId} size={80} />
            <p className="text-sm text-muted-foreground">Escolha seu avatar</p>
          </div>
          <AvatarGrid selected={avatarId} onSelect={pickAvatar} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6 pb-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Seu nome"
              />
              <Button
                onClick={() => saveName.mutate()}
                disabled={
                  saveName.isPending || !name.trim() || name === (profile?.name ?? "")
                }
              >
                {saveName.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const { user } = useAuth();
  const [resetting, setResetting] = useState(false);

  async function resetPassword() {
    if (!user?.email) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + "/auth",
    });
    setResetting(false);
    if (error) notify.error(translateAuthError(error.message));
    else notify.success("Enviamos um link para o seu e-mail.");
  }

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Senha</h3>
          <p className="text-sm text-muted-foreground">
            Enviaremos um link por e-mail para você redefinir sua senha com segurança.
          </p>
        </div>
        <Button variant="outline" onClick={resetPassword} disabled={resetting}>
          {resetting ? "Enviando..." : "Redefinir senha por e-mail"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <Label className="mb-3 block">Tema</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`flex items-center gap-2 rounded-lg border p-4 transition-colors ${
              theme === "dark" ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
            }`}
          >
            <Moon className="size-4" /> Escuro
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`flex items-center gap-2 rounded-lg border p-4 transition-colors ${
              theme === "light" ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
            }`}
          >
            <Sun className="size-4" /> Claro
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionTab() {
  const fetchCredits = useServerFn(getCredits);
  const { data } = useQuery({ queryKey: ["credits"], queryFn: () => fetchCredits() });
  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6 space-y-4">
        <div>
          <Label className="text-muted-foreground">Saldo atual</Label>
          <p className="mt-1 flex items-center gap-2 text-3xl font-bold">
            <Sparkles className="size-6 text-accent" />
            {data?.balance ?? 0}
            <span className="text-sm font-normal text-muted-foreground">créditos</span>
          </p>
        </div>
        <Button asChild>
          <Link to="/creditos">Comprar mais créditos</Link>
        </Button>
      </CardContent>
    </Card>
  );
}