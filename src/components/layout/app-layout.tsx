import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Settings, LogOut, User as UserIcon, PanelLeft, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NousxLogo } from "@/components/nousx-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/chat.functions";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Sidebar aparece em todas as rotas autenticadas (não só chat).
  // Em rotas que não são chat escondemos a lista de conversas, mas a
  // navegação (Estúdio / Galeria / Explorar / Configurações) continua acessível.
  const isChatRoute = pathname === "/" || pathname.startsWith("/c/");
  const showSidebar = true;
  void isChatRoute;

  const fetchProfile = useServerFn(getProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });
  const displayName =
    (profile?.name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    "?";

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar — sempre visível enquanto autenticado */}
      {showSidebar && !collapsed && (
        <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-sidebar">
          <ConversationSidebar onNavigate={() => undefined} />
        </aside>
      )}

      {/* Mobile sidebar */}
      {showSidebar && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar border-border">
            <ConversationSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-2 px-3 md:px-4 border-b border-border bg-background/80 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Mostrar sidebar" : "Esconder sidebar"}
          >
            <PanelLeft className="size-5" />
          </Button>
          <Link to="/" className="md:hidden">
            <NousxLogo className="text-lg" />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Menu do usuário"
              >
                <UserAvatar name={displayName} size={32} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                {user?.email}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/configuracoes" })}>
                <UserIcon className="size-4" />
                Conta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/configuracoes" })}>
                <Settings className="size-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut className="size-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}