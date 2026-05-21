import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Trash2, Settings, Sparkles, Image as ImageIcon, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NousxLogo } from "@/components/nousx-logo";
import {
  listConversations,
  deleteConversation,
} from "@/lib/chat.functions";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

type Conv = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

function groupByDate(rows: Conv[]) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(startOfDay.getTime() - 86_400_000);
  const sevenDays = new Date(startOfDay.getTime() - 7 * 86_400_000);

  const groups: Record<string, Conv[]> = {
    Hoje: [],
    Ontem: [],
    "Últimos 7 dias": [],
    "Mais antigos": [],
  };

  for (const c of rows) {
    const d = new Date(c.updated_at);
    if (d >= startOfDay) groups.Hoje.push(c);
    else if (d >= yesterday) groups.Ontem.push(c);
    else if (d >= sevenDays) groups["Últimos 7 dias"].push(c);
    else groups["Mais antigos"].push(c);
  }
  return groups;
}

export function ConversationSidebar({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listConversations);
  const deleteFn = useServerFn(deleteConversation);

  const currentId = useRouterState({
    select: (s) => {
      const match = s.matches.find((m) => m.params && "conversationId" in m.params);
      const p = match?.params as { conversationId?: string } | undefined;
      return p?.conversationId;
    },
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchList(),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (currentId === id) navigate({ to: "/" });
      notify.success("Conversa excluída.");
    },
    onError: () => notify.error("Não foi possível excluir."),
  });

  const groups = groupByDate(conversations as Conv[]);

  const navItems: Array<{ to: "/studio" | "/galeria" | "/explorar"; label: string; icon: any }> = [
    { to: "/studio", label: "Estúdio", icon: Sparkles },
    { to: "/galeria", label: "Galeria", icon: ImageIcon },
    { to: "/explorar", label: "Explorar", icon: Compass },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-sidebar">
      <div className="p-3 border-b border-border">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center justify-center py-2"
        >
          <NousxLogo className="text-xl" />
        </Link>
      </div>

      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => {
            navigate({ to: "/" });
            onNavigate();
          }}
        >
          <Plus className="size-4" />
          Nova conversa
        </Button>
      </div>

      <nav className="px-2 pb-2 space-y-0.5">
        {navItems.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            activeProps={{ className: "bg-secondary text-foreground" }}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
          >
            <it.icon className="size-4" />
            {it.label}
          </Link>
        ))}
      </nav>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-4 py-2">
          {Object.entries(groups).map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label}>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </div>
                <ul className="space-y-0.5">
                  {items.map((c) => {
                    const active = currentId === c.id;
                    return (
                      <li key={c.id} className="group relative">
                        <Link
                          to="/c/$conversationId"
                          params={{ conversationId: c.id }}
                          onClick={onNavigate}
                          className={cn(
                            "block truncate rounded-md px-2 py-2 text-sm transition-colors",
                            active
                              ? "bg-secondary text-foreground"
                              : "text-foreground/80 hover:bg-secondary/60",
                          )}
                        >
                          {(c.title || "Nova conversa").slice(0, 30)}
                        </Link>
                        <button
                          type="button"
                          aria-label="Excluir conversa"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm("Excluir esta conversa?")) del.mutate(c.id);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-background"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )}
          {conversations.length === 0 && (
            <p className="px-2 py-6 text-xs text-muted-foreground text-center">
              Sem conversas ainda.
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border">
        <Link
          to="/configuracoes"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <Settings className="size-4" />
          Configurações
        </Link>
      </div>
    </div>
  );
}