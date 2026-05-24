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
import { useActivePlan } from "@/hooks/use-active-plan";
import { getCredits } from "@/lib/credits.functions";
import {
  cancelMySubscription,
  getMySubscription,
  listMyPaymentHistory,
} from "@/lib/payments.functions";
import { PLANS, type PlanId } from "@/lib/payments-config";
import { PlanBadge, getPlanKey } from "@/components/plan-badge";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
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
      <PlanSection />
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

function PlanSection() {
  const qc = useQueryClient();
  const { hasActive, planId } = useActivePlan();
  const planKey = getPlanKey(hasActive, planId);
  const fetchCredits = useServerFn(getCredits);
  const fetchSub = useServerFn(getMySubscription);
  const fetchHistory = useServerFn(listMyPaymentHistory);
  const cancelFn = useServerFn(cancelMySubscription);

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
  });
  const { data: sub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
    staleTime: 60_000,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["payment-history"],
    queryFn: () => fetchHistory(),
    staleTime: 60_000,
  });

  const [showAll, setShowAll] = useState(false);

  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      notify.success("Assinatura cancelada.");
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro."),
  });

  const balance = credits?.balance ?? 0;
  const plan = planKey !== "free" ? PLANS[planKey as PlanId] : null;
  const renewDate =
    sub?.expires_at && new Date(sub.expires_at).toLocaleDateString("pt-BR");

  const visibleHistory = showAll ? history : history.slice(0, 5);

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Meu plano</h3>
              <PlanBadge plan={planKey} />
            </div>
            {planKey === "free" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Plano atual: <span className="text-foreground font-medium">Gratuito</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Você tem <span className="text-foreground font-medium">{balance}</span> créditos disponíveis.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Plano <span className="font-medium">{plan?.name}</span> ativo
                </p>
                <p className="text-xs text-muted-foreground">
                  {plan?.credits} créditos por mês
                  {renewDate ? ` • Renovação em ${renewDate}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">{balance}</span> créditos restantes
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {planKey === "free" ? (
              <Button asChild className="bg-[#6C47FF] hover:bg-[#7d5cff] text-white">
                <Link to="/creditos">Ver planos e créditos</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Deseja realmente cancelar sua assinatura?")) {
                    cancel.mutate();
                  }
                }}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelando..." : "Cancelar assinatura"}
              </Button>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <h4 className="text-sm font-medium">Histórico de compras</h4>
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
          </div>
        )}
      </CardContent>
    </Card>
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
