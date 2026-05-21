import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { getCredits } from "@/lib/credits.functions";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { translateAuthError } from "@/lib/i18n-errors";
import { useState } from "react";

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
          <TabsList className="grid grid-cols-3 w-full mb-6">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          </TabsList>
          <TabsContent value="geral"><GeneralTab /></TabsContent>
          <TabsContent value="aparencia"><AppearanceTab /></TabsContent>
          <TabsContent value="assinatura"><SubscriptionTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GeneralTab() {
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
    <Card className="border-border bg-card">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input defaultValue={(user?.user_metadata?.name as string) || ""} disabled />
        </div>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="pt-2">
          <Button variant="outline" onClick={resetPassword} disabled={resetting}>
            {resetting ? "Enviando..." : "Redefinir senha por e-mail"}
          </Button>
        </div>
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