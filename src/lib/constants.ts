import { toast } from "sonner";

/**
 * Global kill-switch for purchase flows.
 * Set to `false` to re-enable payments with zero other changes.
 */
export const PAYMENTS_UNDER_MAINTENANCE = true;

export const PAYMENTS_MAINTENANCE_TOOLTIP =
  "Pagamentos temporariamente indisponíveis";

export function notifyPaymentsMaintenance() {
  toast("Pagamentos em manutenção", {
    description:
      "Estamos realizando melhorias no sistema de pagamentos. Você pode continuar usando o chat normalmente. Voltamos em breve! 🚀",
    duration: 6000,
  });
}