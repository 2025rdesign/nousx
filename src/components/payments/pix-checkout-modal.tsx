import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { getPixPaymentStatus } from "@/lib/cajupay.functions";

export type PixCheckoutData = {
  paymentId: string;
  qrCode: string;
  amountCents: number;
  description: string;
};

const formatBRL = (cents: number) =>
  `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function PixCheckoutModal({
  data,
  open,
  onOpenChange,
  onPaid,
}: {
  data: PixCheckoutData | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPaid?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fetchStatus = useServerFn(getPixPaymentStatus);

  const { data: status } = useQuery({
    queryKey: ["pix-status", data?.paymentId],
    queryFn: () => fetchStatus({ data: { paymentId: data!.paymentId } }),
    enabled: open && !!data?.paymentId,
    refetchInterval: (q) =>
      q.state.data?.status === "paid" || q.state.data?.status === "failed"
        ? false
        : 4000,
  });

  useEffect(() => {
    if (status?.status === "paid") onPaid?.();
  }, [status?.status, onPaid]);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.qrCode);
      setCopied(true);
      notify.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Não foi possível copiar.");
    }
  };

  const isPaid = status?.status === "paid";
  const isFailed =
    status?.status === "failed" ||
    status?.status === "expired" ||
    status?.status === "refunded";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#0A0A0F] border-border">
        <DialogHeader>
          <DialogTitle>Pagamento via PIX</DialogTitle>
        </DialogHeader>

        {!data ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isPaid ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="size-14 mx-auto text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Pagamento confirmado!</h3>
            <p className="text-sm text-zinc-400">
              {data.description} — {formatBRL(data.amountCents)}
            </p>
            <Button className="mt-3 w-full" onClick={() => onOpenChange(false)}>
              Continuar
            </Button>
          </div>
        ) : isFailed ? (
          <div className="py-8 text-center space-y-3">
            <XCircle className="size-14 mx-auto text-red-400" />
            <h3 className="text-lg font-semibold text-white">Cobrança não concluída</h3>
            <p className="text-sm text-zinc-400">
              O pagamento não foi confirmado. Gere uma nova cobrança para tentar novamente.
            </p>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{data.description}</p>
                <p className="text-xs text-zinc-400">Aguardando pagamento…</p>
              </div>
              <p className="text-lg font-bold text-white">{formatBRL(data.amountCents)}</p>
            </div>

            <div className="bg-white rounded-xl p-4 flex justify-center">
              <QRCodeSVG value={data.qrCode} size={220} level="M" />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-400">Ou copie o código PIX:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-[#13131A] border border-[#1E1E2E] px-3 py-2 text-xs text-zinc-300">
                  {data.qrCode}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copy}
                  className="shrink-0"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500 justify-center">
              <Loader2 className="size-3 animate-spin" />
              Estamos verificando o pagamento automaticamente
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}