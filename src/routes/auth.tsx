import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NousxLogo } from "@/components/nousx-logo";
import { AuthStarfield } from "@/components/auth-starfield";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { translateAuthError } from "@/lib/i18n-errors";
import { notify } from "@/lib/notify";
import { Loader2, Check, X } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — AuraIA" },
      { name: "description", content: "Acesse a AuraIA e converse sem limites." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center px-4 py-12 md:w-1/2">
        <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <NousxLogo className="text-4xl" />
          <p className="text-sm text-muted-foreground">
            IA livre, sem julgamentos.
          </p>
        </div>

        <Card className="border-border/60 bg-card">
          <CardContent className="pt-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <LoginForm />
              </TabsContent>
              <TabsContent value="signup">
                <SignupForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Ao continuar, você concorda em ter 18 anos ou mais e aceita os{" "}
          <Link to="/termos" className="underline hover:text-foreground">
            Termos
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          .
        </p>
        </div>
      </div>
      <div
        aria-hidden
        className="hidden md:block relative w-1/2 h-screen sticky top-0 overflow-hidden"
      >
        <AuthStarfield />
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <img
            src="https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png"
            alt=""
            className="h-[260px] w-auto object-contain select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      notify.error(translateAuthError(error.message));
      return;
    }
    notify.success("Bem-vindo de volta.");
    router.invalidate();
    navigate({ to: "/" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Senha</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
      </Button>
    </form>
  );
}

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const navigate = useNavigate();

  const reqLen = password.length >= 8;
  const reqUpper = /[A-Z]/.test(password);
  const reqNum = /\d/.test(password);
  const passedCount = [reqLen, reqUpper, reqNum].filter(Boolean).length;
  const strength: "fraca" | "media" | "forte" =
    password.length === 0
      ? "fraca"
      : passedCount <= 1
        ? "fraca"
        : passedCount === 2
          ? "media"
          : "forte";
  const strengthColor =
    strength === "forte" ? "#22c55e" : strength === "media" ? "#eab308" : "#ef4444";
  const strengthPct =
    password.length === 0
      ? 0
      : strength === "forte"
        ? 100
        : strength === "media"
          ? 66
          : 33;

  const formValid =
    name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    reqLen &&
    reqUpper &&
    reqNum &&
    accepted;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      notify.error("Informe seu nome (mínimo 2 caracteres).");
      return;
    }
    if (!reqLen || !reqUpper || !reqNum) {
      notify.error("A senha deve ter 8+ caracteres, 1 maiúscula e 1 número.");
      return;
    }
    if (!accepted) {
      notify.error("Aceite os Termos e a Política de Privacidade.");
      return;
    }
    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() },
      },
    });
    setLoading(false);
    if (error) {
      console.error("[signUp] error:", error);
      notify.error(translateAuthError(error.message));
      return;
    }
    console.log("[signUp] success:", signUpData);
    notify.success("Bem-vindo! Você ganhou 5 créditos para usar no Estúdio.");
    router.invalidate();
    navigate({ to: "/" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Como podemos te chamar?</Label>
        <Input
          id="signup-name"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome ou apelido"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Senha</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
        />
        {password.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${strengthPct}%`, background: strengthColor }}
              />
            </div>
            <div className="text-[11px]" style={{ color: strengthColor }}>
              Força: {strength === "forte" ? "Forte" : strength === "media" ? "Média" : "Fraca"}
            </div>
          </div>
        )}
        <ul className="text-[11px] space-y-1 pt-1 text-muted-foreground">
          <Req ok={reqLen}>Mínimo 8 caracteres</Req>
          <Req ok={reqUpper}>Pelo menos 1 letra maiúscula</Req>
          <Req ok={reqNum}>Pelo menos 1 número</Req>
        </ul>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => setAccepted(v === true)}
          className="mt-0.5"
        />
        <span>
          Li e aceito os{" "}
          <Link to="/termos" target="_blank" className="underline hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" target="_blank" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          . Declaro ter 18 anos ou mais.
        </span>
      </label>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Criar conta grátis"}
      </Button>
    </form>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5" style={{ color: ok ? "#22c55e" : undefined }}>
      {ok ? <Check className="size-3" /> : <X className="size-3" />}
      <span>{children}</span>
    </li>
  );
}