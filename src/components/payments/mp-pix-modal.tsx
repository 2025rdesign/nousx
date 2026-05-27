import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import {
  createPixPayment,
  getPixStatus,
  getProfileCpf,
} from "@/lib/mercadopago.functions";
import {
  CREDIT_PACKS,
  PLANS,
  type BillingPeriod,
  type CreditPackId,
  type PlanId,
} from "@/lib/payments-config";

/* ── Inline SVG icons (no emojis) ─────────────────────────────────── */
function LockIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11" r="1" fill={color} />
    </svg>
  );
}

function ZapIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <polygon
        points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" stroke={color} strokeWidth="2" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}

/* ── Types & helpers ──────────────────────────────────────────────── */
export type PixModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "credit" | "subscription";
  id: string;
  name: string;
  amount: number;
  couponCode?: string | null;
  billingPeriod?: BillingPeriod;
  onPaid?: () => void;
};

const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  let out = d;
  if (d.length > 9) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  else if (d.length > 6) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  else if (d.length > 3) out = `${d.slice(0, 3)}.${d.slice(3)}`;
  return out;
}

type PixData = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amount: number;
  description: string;
};

/* ── Component ─────────────────────────────────────────────────────── */
export function MpPixModal(props: PixModalProps) {
  const { open, onOpenChange, kind, id, name, amount, couponCode, billingPeriod, onPaid } = props;
  const qc = useQueryClient();

  const fetchCpf = useServerFn(getProfileCpf);
  const cpfQ = useQuery({
    queryKey: ["profile-cpf"],
    queryFn: () => fetchCpf(),
    enabled: open,
  });
  const savedCpf = cpfQ.data?.cpf ?? null;

  const [cpfInput, setCpfInput] = useState("");
  const [pix, setPix] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  // reset on close
  useEffect(() => {
    if (!open) {
      setPix(null);
      setCpfInput("");
      setCopied(false);
    }
  }, [open]);

  // tick countdown timer
  useEffect(() => {
    if (!pix) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pix]);

  const remainingMs = pix ? new Date(pix.expiresAt).getTime() - now : 0;
  const expired = pix && remainingMs <= 0;
  const mmss = useMemo(() => {
    const s = Math.max(0, Math.floor(remainingMs / 1000));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }, [remainingMs]);

  const createFn = useServerFn(createPixPayment);
  const create = useMutation({
    mutationFn: (cpf: string | null) =>
      createFn({
        data: {
          kind,
          id,
          couponCode: couponCode ?? null,
          cpf: cpf ?? undefined,
          billingPeriod: kind === "subscription" ? billingPeriod ?? "monthly" : undefined,
        },
      }),
    onSuccess: (res) => {
      setPix({
        paymentId: res.paymentId,
        qrCode: res.qrCode,
        qrCodeBase64: res.qrCodeBase64,
        expiresAt: res.expiresAt,
        amount: res.amount,
        description: res.description,
      });
      setNow(Date.now());
      qc.invalidateQueries({ queryKey: ["profile-cpf"] });
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro ao gerar PIX."),
  });

  const statusFn = useServerFn(getPixStatus);
  const statusQ = useQuery({
    queryKey: ["mp-pix-status", pix?.paymentId],
    queryFn: () => statusFn({ data: { paymentId: pix!.paymentId } }),
    enabled: !!pix && !expired,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "approved" || s === "rejected" || s === "cancelled" || s === "refunded")
        return false;
      if (typeof document !== "undefined" && document.hidden) return false;
      return 5000;
    },
  });

  const isPaid = statusQ.data?.status === "approved";

  const creditsAdded = useMemo(() => {
    if (kind === "credit") return CREDIT_PACKS[id as CreditPackId]?.credits ?? 0;
    if (kind === "subscription") return PLANS[id as PlanId]?.credits ?? 0;
    return 0;
  }, [kind, id]);

  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isPaid) return;
    try {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
    } catch {}
    notify.success("PIX confirmado! Seus créditos foram liberados.");
    qc.invalidateQueries({ queryKey: ["credits"] });
    qc.invalidateQueries({ queryKey: ["my-subscription"] });
    onPaid?.();

    setCount(0);
    const start = performance.now();
    const duration = 1500;
    let raf = 0;
    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * creditsAdded));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const t = setTimeout(() => onOpenChange(false), 4000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [isPaid, onPaid, onOpenChange, qc, creditsAdded]);

  const copy = async () => {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      notify.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error("Não foi possível copiar.");
    }
  };

  const submitCpf = (e?: React.FormEvent) => {
    e?.preventDefault();
    const d = cpfInput.replace(/\D/g, "");
    if (d.length !== 11) {
      notify.error("CPF inválido. Digite os 11 números.");
      return;
    }
    create.mutate(d);
  };

  // Auto-generate when CPF is already saved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && !pix && !create.isPending && savedCpf) {
      create.mutate(savedCpf);
    }
  }, [open, savedCpf]);

  return (
    <>
      {/* Keyframe for CSS spinner */}
      <style>{`@keyframes pixSpin { to { transform: rotate(360deg); } }`}</style>
      {/* Keyframe for paid checkmark pop */}
      <style>{`@keyframes mp-pop { 0% { transform: scale(0); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1) } }`}</style>

      <Dialog open={open} onOpenChange={onOpenChange}>
        {/*
          Close button overrides:
          - bg-transparent! removes the data-[state=open]:bg-accent fill
          - opacity + hover give the subtle feel the spec asks for
        */}
        <DialogContent className="max-w-[min(640px,95vw)] sm:max-w-[min(640px,95vw)] bg-[#0A0A0F] border-border p-4 sm:p-6 max-h-[92vh] overflow-y-auto [&>button:last-child]:bg-transparent! [&>button:last-child]:opacity-50 [&>button:last-child]:hover:opacity-100 [&>button:last-child]:transition-opacity">
          <DialogHeader>
            <DialogTitle className="text-white">Pagar com PIX</DialogTitle>
            <p className="text-[13px] text-[#888] mt-0.5">
              {name} · <span className="text-zinc-300">{formatBRL(amount)}</span>
            </p>
          </DialogHeader>

          {/* ── CPF step ─────────────────────────────────────────────── */}
          {!pix && (
            <div className="space-y-4 mt-4">
              {cpfQ.isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : savedCpf ? (
                <div className="py-10 flex flex-col items-center gap-2 text-zinc-400 text-sm">
                  <Loader2 className="size-6 animate-spin" />
                  Gerando QR Code...
                </div>
              ) : (
                <form onSubmit={submitCpf} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wide text-zinc-400">
                      CPF do pagador
                    </label>
                    <Input
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={cpfInput}
                      onChange={(e) => setCpfInput(maskCpf(e.target.value))}
                      className="bg-[#13131A] border-[#1E1E2E] text-white"
                      maxLength={14}
                      autoFocus
                    />
                    <p className="text-[11px] text-zinc-500">
                      Exigido pelo banco para emitir o PIX.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
                    disabled={create.isPending}
                  >
                    {create.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" /> Gerando QR Code...
                      </>
                    ) : (
                      "Gerar QR Code"
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ── PIX display (waiting) ─────────────────────────────────── */}
          {pix && !isPaid && (
            <div className="mt-4 space-y-0">
              {/* Trust notice */}
              <div
                style={{
                  background: "#0f0f17",
                  border: "1px solid #1e1e2e",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "#888",
                  marginBottom: 20,
                  lineHeight: 1.55,
                }}
              >
                O pagamento é processado pelo Mercado Pago. Ao pagar, você verá o nome do
                responsável pela plataforma — isso é esperado e sua compra está segura.
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left — QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <div
                    style={{
                      background: "white",
                      borderRadius: 12,
                      padding: 12,
                      width: "100%",
                      maxWidth: 240,
                    }}
                  >
                    {pix.qrCodeBase64 ? (
                      <img
                        src={`data:image/png;base64,${pix.qrCodeBase64}`}
                        alt="QR Code PIX"
                        className="w-full h-auto"
                      />
                    ) : (
                      <div className="aspect-square flex items-center justify-center text-zinc-400 text-sm">
                        QR indisponível
                      </div>
                    )}
                  </div>

                  {/* Expiry pill */}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: "#1a1a22",
                      color: expired ? "#ef4444" : "#555",
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {expired ? "Expirado" : `Expira em ${mmss}`}
                  </span>
                </div>

                {/* Right — instructions + copia e cola + status + trust */}
                <div className="flex flex-col gap-3 min-w-0">
                  <p style={{ color: "#aaa", fontSize: 13, lineHeight: 1.5 }}>
                    Abra seu banco, escaneie o QR Code ou copie o código.
                  </p>

                  {/* Copia e cola */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 40,
                      border: "1px solid #2a2a3a",
                      background: "#0f0f17",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "0 12px",
                        fontSize: 11,
                        color: "#777",
                        fontFamily: "monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pix.qrCode}
                    </div>
                    <button
                      type="button"
                      onClick={copy}
                      disabled={!!expired}
                      style={{
                        flexShrink: 0,
                        width: 40,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderLeft: "1px solid #2a2a3a",
                        background: "transparent",
                        cursor: expired ? "not-allowed" : "pointer",
                        transition: "color 0.15s",
                        opacity: expired ? 0.4 : 1,
                      }}
                      aria-label="Copiar código PIX"
                    >
                      {copied ? (
                        <Check size={15} style={{ color: "#34d399" }} />
                      ) : (
                        <CopyIcon size={15} color="#888" />
                      )}
                    </button>
                  </div>

                  {/* Status row */}
                  {!expired ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#6C47FF",
                        fontSize: 12,
                      }}
                    >
                      {/* Pure CSS spinner — no emoji, no gif */}
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: "2px solid rgba(108,71,255,0.2)",
                          borderTopColor: "#6C47FF",
                          animation: "pixSpin 1s linear infinite",
                          flexShrink: 0,
                        }}
                      />
                      Aguardando pagamento — confirmamos automaticamente
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPix(null);
                        if (savedCpf) create.mutate(savedCpf);
                      }}
                      disabled={create.isPending}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "#6C47FF",
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                        opacity: create.isPending ? 0.6 : 1,
                      }}
                    >
                      {create.isPending ? "Gerando..." : "Gerar novo código →"}
                    </button>
                  )}

                  {/* Trust signals — SVG icons, no emojis */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "#555",
                        fontSize: 12,
                      }}
                    >
                      <LockIcon size={16} color="#555" />
                      <span>Pagamento processado com segurança</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "#555",
                        fontSize: 12,
                      }}
                    >
                      <ZapIcon size={16} color="#555" />
                      <span>Créditos liberados em até 1 minuto após confirmação</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Paid / success state ─────────────────────────────────── */}
          {isPaid && (
            <div className="py-8 text-center space-y-4">
              <div
                className="mx-auto size-16 rounded-full bg-emerald-500/15 flex items-center justify-center"
                style={{ animation: "mp-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
              >
                <Check className="size-9 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white">Pagamento confirmado!</h3>

              {creditsAdded > 0 && (
                <div className="space-y-1">
                  <div
                    className="text-5xl font-extrabold tabular-nums"
                    style={{ color: "#9B7BFF" }}
                  >
                    +{count}
                  </div>
                  <p className="text-sm text-zinc-300">
                    +{creditsAdded} créditos adicionados à sua conta
                  </p>
                  <p className="text-xs text-zinc-500">
                    Seus créditos já estão disponíveis no Estúdio de Criação.
                  </p>
                </div>
              )}

              <Button
                onClick={() => onOpenChange(false)}
                className="bg-[#6C47FF] hover:bg-[#7d5cff] text-white mt-2"
              >
                Continuar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
