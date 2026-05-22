import { createFileRoute } from "@tanstack/react-router";
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
import { getProfile, updateProfile, deleteAllConversations } from "@/lib/chat.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { translateAuthError } from "@/lib/i18n-errors";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { SubscriptionTab } from "@/components/payments/subscription-tab";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — AuraIA" }] }),
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

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
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

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <UserAvatar name={name || user?.email} size={80} />
            <p className="text-sm text-muted-foreground">
              Seu avatar é gerado a partir do seu nome.
            </p>
          </div>
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

      <DangerZone />
    </div>
  );
}

function DangerZone() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteAllFn = useServerFn(deleteAllConversations);
  const deleteAll = useMutation({
    mutationFn: () => deleteAllFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      notify.success("Todas as conversas foram excluídas.");
      navigate({ to: "/" });
    },
    onError: () => notify.error("Não foi possível excluir as conversas."),
  });

  return (
    <Card className="border-destructive/40 bg-card shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Excluir todas as conversas</h3>
          <p className="text-sm text-muted-foreground">
            Remove permanentemente todo o seu histórico de chats. Imagens da Galeria,
            personagens do Estúdio e áudios não serão afetados.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={deleteAll.isPending}>
              <Trash2 className="size-4 mr-2" />
              {deleteAll.isPending ? "Excluindo..." : "Excluir todas as conversas"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir todas as conversas?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todo o seu histórico de chats será
                removido. Imagens, personagens e áudios permanecem intactos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAll.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
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
