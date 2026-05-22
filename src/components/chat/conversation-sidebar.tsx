import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Plus,
  Trash2,
  Settings,
  Wand2,
  Image as ImageIcon,
  Compass,
  Pin,
  PinOff,
  Pencil,
  Check,
  X,
  MoreHorizontal,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NousxLogo } from "@/components/nousx-logo";
import {
  listConversations,
  deleteConversation,
  togglePinConversation,
  renameConversation,
} from "@/lib/chat.functions";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { UserAvatar } from "@/components/user-avatar";
import { PlanBadge, getPlanKey } from "@/components/plan-badge";
import { useAuth } from "@/hooks/use-auth";
import { useActivePlan } from "@/hooks/use-active-plan";
import { getCredits } from "@/lib/credits.functions";
import { getProfile } from "@/lib/chat.functions";

type Conv = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
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
  const pinFn = useServerFn(togglePinConversation);
  const renameFn = useServerFn(renameConversation);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { user } = useAuth();
  const { hasActive, planId } = useActivePlan();
  const planKey = getPlanKey(hasActive, planId);
  const fetchCredits = useServerFn(getCredits);
  const { data: creditsData } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const fetchProfile = useServerFn(getProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id ?? null],
    queryFn: async () => {
      try {
        return await fetchProfile();
      } catch {
        return null;
      }
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const displayName =
    (profile?.name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    "Você";
  const balance = creditsData?.balance ?? 0;

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
    staleTime: 60_000,
    gcTime: 5 * 60_000,
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

  const pin = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) =>
      pinFn({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    onError: () => notify.error("Não foi possível fixar."),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => renameFn({ data: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setEditingId(null);
    },
    onError: () => notify.error("Não foi possível renomear."),
  });

  const all = conversations as Conv[];
  const pinned = all.filter((c) => c.pinned);
  const unpinned = all.filter((c) => !c.pinned);
  const groups = groupByDate(unpinned);

  const navItems: Array<{
    to: "/studio" | "/galeria" | "/explorar";
    label: string;
    icon: any;
    prefetch: () => Promise<unknown>;
  }> = [
    {
      to: "/studio",
      label: "Estúdio",
      icon: Wand2,
      prefetch: () => import("@/routes/_authenticated/studio"),
    },
    {
      to: "/galeria",
      label: "Galeria",
      icon: ImageIcon,
      prefetch: () => import("@/routes/_authenticated/galeria"),
    },
    {
      to: "/explorar",
      label: "Explorar",
      icon: Compass,
      prefetch: () => import("@/routes/_authenticated/explorar"),
    },
  ];

  function renderItem(c: Conv) {
    const active = currentId === c.id;
    const isEditing = editingId === c.id;
    return (
      <li key={c.id} className="group">
        {isEditing ? (
          <RenameInput
            initial={c.title || ""}
            onCancel={() => setEditingId(null)}
            onSave={(val) => {
              const trimmed = val.trim();
              if (!trimmed) return setEditingId(null);
              rename.mutate({ id: c.id, title: trimmed.slice(0, 80) });
            }}
          />
        ) : (
          <div
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button')) return;
              navigate({ to: '/c/$conversationId', params: { conversationId: c.id } });
              onNavigate();
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                navigate({ to: '/c/$conversationId', params: { conversationId: c.id } });
                onNavigate();
              }
            }}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors overflow-hidden min-w-0 cursor-pointer",
              active
                ? "bg-secondary text-foreground"
                : "text-foreground/80 hover:bg-secondary/60",
            )}
          >
            {c.pinned && (
              <Pin className="size-3 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 min-w-0 truncate text-[13px] leading-tight select-none">
              {c.title || "Nova conversa"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Opções da conversa"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-background hover:text-foreground transition-colors opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-background"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="right"
                className="w-44"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    pin.mutate({ id: c.id, pinned: !c.pinned });
                  }}
                >
                  {c.pinned ? (
                    <>
                      <PinOff className="size-4 mr-2" /> Desafixar
                    </>
                  ) : (
                    <>
                      <Pin className="size-4 mr-2" /> Fixar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(c.id);
                  }}
                >
                  <Pencil className="size-4 mr-2" /> Renomear
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Excluir esta conversa?")) del.mutate(c.id);
                  }}
                >
                  <Trash2 className="size-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </li>
    );
  }

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
            preload="intent"
            onMouseEnter={() => {
              it.prefetch().catch(() => undefined);
            }}
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
          {pinned.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Pin className="size-3" /> Fixados
              </div>
              <ul className="space-y-0.5">{pinned.map(renderItem)}</ul>
            </div>
          )}
          {Object.entries(groups).map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label}>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </div>
                <ul className="space-y-0.5">{items.map(renderItem)}</ul>
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
          preload="intent"
          onMouseEnter={() => {
            import("@/routes/_authenticated/configuracoes").catch(() => undefined);
          }}
          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <UserAvatar name={displayName} size={32} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-sm font-medium">{displayName}</span>
              <PlanBadge plan={planKey} className="shrink-0" />
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {planKey === "free"
                ? `${balance} créditos`
                : `Plano ${planKey === "plus" ? "Plus" : "Ultra"} • ${balance} créditos`}
            </div>
          </div>
          <Settings className="size-4 text-muted-foreground shrink-0" />
        </Link>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-background transition-colors",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(v);
          else if (e.key === "Escape") onCancel();
        }}
        className="flex-1 min-w-0 rounded-md bg-background border border-border px-2 py-1 text-sm focus:outline-none focus:border-accent"
        maxLength={80}
      />
      <button
        type="button"
        onClick={() => onSave(v)}
        className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
        aria-label="Salvar"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
        aria-label="Cancelar"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}