import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Settings, LogOut, User as UserIcon, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NousxLogo } from "@/components/nousx-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreditsBadge } from "@/components/layout/credits-badge";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { useAuth } from "@/hooks/use-auth";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Sidebar de conversas só aparece em rotas de chat.
  const showChatSidebar = pathname === "/" || pathname.startsWith("/c/");

  const initial = (user?.user_metadata?.name || user?.email || "?")
    .toString()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar (apenas em rotas de chat) */}
      {showChatSidebar && !collapsed && (
        <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-sidebar">
          <ConversationSidebar onNavigate={() => undefined} />
        </aside>
      )}

      {/* Mobile sidebar (apenas em rotas de chat) */}
      {showChatSidebar && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar border-border">
            <ConversationSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-2 px-3 md:px-4 border-b border-border bg-background/80 backdrop-blur">
          {showChatSidebar && (
            <>
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
            </>
          )}
          <Link to="/" className={showChatSidebar ? "md:hidden" : ""}>
            <NousxLogo className="text-lg" />
          </Link>
          <div className="flex-1" />
          <CreditsBadge />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Menu do usuário"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
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