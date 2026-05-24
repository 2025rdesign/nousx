import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { SettingsSkeleton } from "@/components/route-skeletons";
import { SubscriptionTab } from "@/components/payments/subscription-tab";
import { getCredits } from "@/lib/credits.functions";
import { listMyPaymentHistory } from "@/lib/payments.functions";
import { getMyReferralInfo } from "@/lib/referrals.functions";
import { Copy, Check as CheckIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
  pendingComponent: SettingsSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
  validateSearch: (s: Record<string, unknown>) => {
    const tab =
      s.tab === "aparencia" ||
      s.tab === "seguranca" ||
      s.tab === "assinatura" ||
      s.tab === "geral"
        ? (s.tab as
            | "geral"
            | "aparencia"
            | "seguranca"
            | "assinatura")
        : undefined;
    return tab ? { tab } : {};
  },
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>
        <Tabs defaultValue={tab ?? "geral"}>
          <TabsList className="grid grid-cols-4 w-full mb-6">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="seguranca">Segurança</TabsTrigger>
            <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          </TabsList>
          <TabsContent value="geral"><GeneralTab /></TabsContent>
          <TabsContent value="aparencia"><AppearanceTab /></TabsContent>
          <TabsContent value="seguranca"><SecurityTab /></TabsContent>
          <TabsContent value="assinatura"><AssinaturaTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ReferralSection() {
  const fetchInfo = useServerFn(getMyReferralInfo);
  const { data } = useQuery({
    queryKey: ["referral-info"],
    queryFn: () => fetchInfo(),
    staleTime: 30_000,
  });
  const [copied, setCopied] = useState(false);

  const code = data?.code ?? "";
  const link = code ? `https://chataura.com.br/?ref=${code}` : "";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      notify.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-border my-6" />
      <h3 className="font-semibold text-lg">Indique e ganhe créditos</h3>
      <p className="text-sm text-muted-foreground">
        Compartilhe seu link e ganhe créditos quando seus indicados
        assinarem um plano ou comprarem créditos.
      </p>

      <div className="space-y-2">
        <Label>Seu link de indicação</Label>
        <div className="flex gap-2">
          <Input value={link} readOnly className="font-mono text-sm" />
          <Button onClick={copyLink} disabled={!link} variant="outline">
            {copied ? (
              <CheckIcon className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-2xl font-semibold">
            {data?.totalReferred ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">
            pessoas indicadas
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-2xl font-semibold">
            {data?.creditsEarned ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">
            créditos ganhos por indicações
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <h4 className="font-semibold">Recompensas</h4>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Evento</th>
                <th className="text-right font-medium px-3 py-2">
                  Créditos para você
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-3 py-2">Indicado assina Plus</td>
                <td className="px-3 py-2 text-right font-medium">
                  +10 créditos
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-2">Indicado assina Ultra</td>
                <td className="px-3 py-2 text-right font-medium">
                  +50 créditos
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-2">Indicado compra pacote</td>
                <td className="px-3 py-2 text-right font-medium">
                  +10 créditos
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Créditos são concedidos apenas na primeira compra do indicado.
        </p>
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

      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6 pb-6">
          <ReferralSection />
        </CardContent>
      </Card>
    </div>
  );
}

function AssinaturaTab() {
  return (
    <div className="space-y-6">
      <SubscriptionTab />
      <CreditsAndHistory />
    </div>
  );
}

function CreditsAndHistory() {
  const fetchCredits = useServerFn(getCredits);
  const fetchHistory = useServerFn(listMyPaymentHistory);

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    staleTime: 60_000,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["payment-history"],
    queryFn: () => fetchHistory(),
    staleTime: 60_000,
  });

  const [showAll, setShowAll] = useState(false);
  const balance = credits?.balance ?? 0;
  const visibleHistory = showAll ? history : history.slice(0, 5);

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="pt-6 pb-6 space-y-2">
          <h3 className="font-semibold">Créditos</h3>
          <p className="text-sm text-muted-foreground">
            Você tem{" "}
            <span className="text-foreground font-medium">{balance}</span>{" "}
            créditos disponíveis.
          </p>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-4">
            <h3 className="font-semibold">Histórico de compras</h3>
            <ul className="divide-y divide-border">
              {visibleHistory.map((h: any) => {
                const meta = (h.metadata ?? {}) as Record<string, any>;
                const label =
                  h.type === "subscription"
                    ? `Assinatura ${meta.planId ?? ""}`.trim()
                    : h.type === "credit"
                      ? `Créditos${meta.packId ? ` — ${meta.packId}` : ""}`
                      : h.type;
                const statusLabel: Record<string, string> = {
                  paid: "Aprovado",
                  approved: "Aprovado",
                  pending: "Pendente",
                  refunded: "Reembolsado",
                  cancelled: "Cancelado",
                  failed: "Falhou",
                };
                const tone =
                  h.status === "paid" || h.status === "approved"
                    ? "text-success"
                    : h.status === "refunded" || h.status === "failed" || h.status === "cancelled"
                      ? "text-destructive"
                      : "text-muted-foreground";
                return (
                  <li
                    key={h.id}
                    className="py-2 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">
                        R$ {Number(h.amount).toFixed(2).replace(".", ",")}
                      </p>
                      <p className={`text-xs ${tone}`}>
                        {statusLabel[h.status] ?? h.status}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {history.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
                className="w-full"
              >
                {showAll ? "Mostrar menos" : "Ver histórico completo"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
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
