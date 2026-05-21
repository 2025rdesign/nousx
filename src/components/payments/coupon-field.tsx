import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2 } from "lucide-react";
import { validateCoupon } from "@/lib/payments.functions";

export type AppliedCoupon = { code: string; discountPercent: number } | null;

export function CouponField({
  value,
  onApply,
}: {
  value: AppliedCoupon;
  onApply: (c: AppliedCoupon) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validate = useServerFn(validateCoupon);

  async function apply() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await validate({ data: { code: code.trim() } });
      if (res.valid) {
        onApply({ code: res.code, discountPercent: res.discountPercent });
      } else {
        setError(res.message);
        onApply(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao validar.");
    } finally {
      setLoading(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2">
        <span className="text-sm">
          <Check className="inline size-4 text-success mr-1.5" />
          <strong>{value.code}</strong> — {value.discountPercent}% de desconto
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCode("");
            onApply(null);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Cupom (opcional)</Label>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Digite seu cupom"
          maxLength={40}
        />
        <Button type="button" variant="outline" onClick={apply} disabled={loading || !code.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}