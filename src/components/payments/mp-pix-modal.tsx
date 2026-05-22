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
import { Copy, Check, Loader2, ShieldCheck, Clock } from "lucide-react";
import { notify } from "@/lib/notify";
import {
  createPixPayment,
  getPixStatus,
  getProfileCpf,
} from "@/lib/mercadopago.functions";

export type PixModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "credit" | "subscription";
  id: string;
  name: string;
  amount: number;
  couponCode?: string | null;
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

export function MpPixModal(props: PixModalProps) {
  const { open, onOpenChange, kind, id, name, amount, couponCode, onPaid } = props;
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

  // reset when reopened
  useEffect(() => {
    if (!open) {
      setPix(null);
      setCpfInput("");
      setCopied(false);
    }
  }, [open]);

  // tick timer
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
      if (s === "approved" || s === "rejected" || s === "cancelled" || s === "refunded") return false;
      return 5000;
    },
  });

  const isPaid = statusQ.data?.status === "approved";

  useEffect(() => {
    if (!isPaid) return;
    try {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
    } catch {}
    notify.success("PIX confirmado! Seus créditos foram liberados.");
    qc.invalidateQueries({ queryKey: ["credits"] });
    qc.invalidateQueries({ queryKey: ["my-subscription"] });
    onPaid?.();
    const t = setTimeout(() => onOpenChange(false), 1800);
    return () => clearTimeout(t);
  }, [isPaid, onPaid, onOpenChange, qc]);

  const copy = async () => {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      notify.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 2000);
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
  useEffect(() => {
    if (open && !pix && !create.isPending && savedCpf) {
      create.mutate(savedCpf);
    }
  }, [open, savedCpf, pix, create]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(640px,95vw)] sm:max-w-[min(640px,95vw)] bg-[#0A0A0F] border-border p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar com PIX</DialogTitle>
        </DialogHeader>

        {/* Header summary */}
        <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Você está adquirindo</p>
            <p className="text-sm font-semibold text-white truncate">{name}</p>
          </div>
          <p className="text-lg font-bold text-white shrink-0">{formatBRL(amount)}</p>
        </div>

        {/* CPF step */}
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
                  <p className="text-[11px] text-zinc-500">Exigido pelo banco para emitir o PIX.</p>
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

        {/* PIX display */}
        {pix && !isPaid && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl p-3 bg-white border-2 border-[#6C47FF]/30 w-full max-w-[240px]">
                {pix.qrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pix.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-zinc-400">
                    QR indisponível
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-[#9B7BFF]" />
                <span
                  className={
                    expired
                      ? "text-red-400 font-semibold"
                      : "text-[#9B7BFF] font-semibold tabular-nums"
                  }
                >
                  {expired ? "Expirado" : `Expira em ${mmss}`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-0">
              <p className="text-sm text-zinc-300">
                Abra o app do seu banco e escaneie o QR Code, ou use o código copia e cola abaixo.
              </p>

              <div className="space-y-2 min-w-0">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Código copia e cola</p>
                <code className="block w-full max-h-24 overflow-auto break-all rounded-md bg-[#13131A] border border-[#1E1E2E] px-3 py-2 text-xs text-zinc-300">
                  {pix.qrCode}
                </code>
                <Button
                  onClick={copy}
                  variant="outline"
                  className="w-full border-[#6C47FF]/50 hover:bg-[#6C47FF]/10"
                  disabled={!!expired}
                >
                  {copied ? (
                    <>
                      <Check className="size-4 mr-2" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4 mr-2" /> Copiar código PIX
                    </>
                  )}
                </Button>
              </div>

              {expired ? (
                <Button
                  className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
                  onClick={() => {
                    setPix(null);
                    if (savedCpf) create.mutate(savedCpf);
                  }}
                  disabled={create.isPending}
                >
                  {create.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" /> Gerando...
                    </>
                  ) : (
                    "Gerar novo QR Code"
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="size-3 animate-spin" />
                  Aguardando pagamento — confirmamos automaticamente
                </div>
              )}

              <div className="flex items-start gap-2 text-[11px] text-zinc-500 mt-1">
                <ShieldCheck className="size-3.5 shrink-0 mt-0.5 text-emerald-400/80" />
                <span>
                  Pagamento processado com segurança. Seus dados financeiros não são armazenados pela AuraIA.
                </span>
              </div>
            </div>
          </div>
        )}

        {isPaid && (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto size-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check className="size-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Pagamento confirmado!</h3>
            <p className="text-sm text-zinc-400">
              {pix?.description} — {formatBRL(pix?.amount ?? amount)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}