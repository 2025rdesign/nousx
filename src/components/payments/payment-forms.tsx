import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CardForm = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};
export type HolderForm = {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
};

export function useCardForm(defaultEmail = "") {
  const [card, setCard] = useState<CardForm>({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
  });
  const [holder, setHolder] = useState<HolderForm>({
    name: "",
    email: defaultEmail,
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  });
  const sanitized = () => ({
    card: {
      ...card,
      number: card.number.replace(/\D/g, ""),
      ccv: card.ccv.replace(/\D/g, ""),
      expiryMonth: card.expiryMonth.replace(/\D/g, "").padStart(2, "0").slice(0, 2),
      expiryYear: card.expiryYear.replace(/\D/g, "").slice(0, 4),
    },
    holder: {
      ...holder,
      cpfCnpj: holder.cpfCnpj.replace(/\D/g, ""),
      postalCode: holder.postalCode.replace(/\D/g, ""),
      phone: holder.phone.replace(/\D/g, ""),
    },
  });
  return { card, setCard, holder, setHolder, sanitized };
}

export function CardFields({
  card,
  setCard,
  holder,
  setHolder,
}: {
  card: CardForm;
  setCard: (c: CardForm) => void;
  holder: HolderForm;
  setHolder: (h: HolderForm) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label>Número do cartão</Label>
          <Input
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nome impresso no cartão</Label>
          <Input
            placeholder="Como está no cartão"
            value={card.holderName}
            onChange={(e) => setCard({ ...card, holderName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Mês</Label>
            <Input
              inputMode="numeric"
              placeholder="MM"
              value={card.expiryMonth}
              onChange={(e) => setCard({ ...card, expiryMonth: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Input
              inputMode="numeric"
              placeholder="AAAA"
              value={card.expiryYear}
              onChange={(e) => setCard({ ...card, expiryYear: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>CVV</Label>
            <Input
              inputMode="numeric"
              placeholder="000"
              value={card.ccv}
              onChange={(e) => setCard({ ...card, ccv: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">Dados do titular</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome completo</Label>
            <Input
              value={holder.name}
              onChange={(e) => setHolder({ ...holder, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <Input
              inputMode="numeric"
              placeholder="Somente números"
              value={holder.cpfCnpj}
              onChange={(e) => setHolder({ ...holder, cpfCnpj: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={holder.email}
              onChange={(e) => setHolder({ ...holder, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone (DDD + número)</Label>
            <Input
              inputMode="numeric"
              placeholder="11999999999"
              value={holder.phone}
              onChange={(e) => setHolder({ ...holder, phone: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>CEP</Label>
            <Input
              inputMode="numeric"
              placeholder="00000000"
              value={holder.postalCode}
              onChange={(e) => setHolder({ ...holder, postalCode: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input
              value={holder.addressNumber}
              onChange={(e) => setHolder({ ...holder, addressNumber: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PixDisplay({
  qrCodeImage,
  payload,
}: {
  qrCodeImage: string;
  payload: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto w-48 h-48 bg-white rounded-md p-2">
        <img
          src={`data:image/png;base64,${qrCodeImage}`}
          alt="QR Code PIX"
          className="w-full h-full"
        />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Ou copie o código PIX</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="w-full text-xs break-all p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors text-left font-mono"
        >
          {payload}
        </button>
        <p className="text-xs text-accent">{copied ? "Copiado!" : "Clique para copiar"}</p>
      </div>
    </div>
  );
}

export function CountdownTimer({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return (
    <p className="text-sm text-muted-foreground text-center">
      Expira em <span className="font-mono font-semibold text-foreground">{m}:{s}</span>
    </p>
  );
}