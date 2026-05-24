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
        : typeof document !== "undefined" && document.hidden
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
      <DialogContent className="max-w-[min(920px,95vw)] sm:max-w-[min(920px,95vw)] bg-[#0A0A0F] border-border p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white rounded-xl p-3 sm:p-4 w-full flex justify-center">
                <QRCodeSVG
                  value={data.qrCode}
                  size={240}
                  level="M"
                  className="w-full h-auto max-w-[260px]"
                />
              </div>
              <p className="text-xs text-zinc-500 text-center">
                Aponte a câmera do seu app de banco
              </p>
            </div>

            {/* Info + copia-e-cola */}
            <div className="flex flex-col gap-4 min-w-0">
              <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  Você está adquirindo
                </p>
                <p className="text-base font-semibold text-white">
                  {data.description}
                </p>
                <p className="mt-3 text-2xl font-bold text-white">
                  {formatBRL(data.amountCents)}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Pagamento único via PIX</p>
              </div>

              <div className="space-y-2 min-w-0">
                <p className="text-xs text-zinc-400">Ou copie o código PIX:</p>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="flex-1 min-w-0 truncate rounded-md bg-[#13131A] border border-[#1E1E2E] px-3 py-2 text-xs text-zinc-300">
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
                <Button onClick={copy} className="w-full mt-1">
                  {copied ? "Copiado!" : "Copiar código PIX"}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="size-3 animate-spin" />
                Aguardando pagamento — verificamos automaticamente
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}